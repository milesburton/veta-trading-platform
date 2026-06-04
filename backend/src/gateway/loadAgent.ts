import { logger } from "@veta/logger";
import type { MsgProducer } from "@veta/messaging";

export interface LoadAgentConfig {
  ratePerSecond: number;
  strategyMix: ReadonlyArray<{ strategy: string; weight: number }>;
  symbols: ReadonlyArray<string>;
  userIds: ReadonlyArray<string>;
  sizeMin: number;
  sizeMax: number;
  autoStopAfterMs: number;
}

export interface LoadAgentStatus {
  running: boolean;
  startedAt: number | null;
  stopAt: number | null;
  config: LoadAgentConfig | null;
  ordersSent: number;
  ordersFailed: number;
  lastTickAt: number | null;
  lastError: string | null;
}

export interface LoadAgentDeps {
  producer: MsgProducer;
  refPriceFor: (symbol: string) => number;
  publishAccessEvent: (e: {
    action: string;
    userId: string;
    userRole: string;
    path: string;
    reason?: string;
  }) => void;
}

const DEFAULT_AUTO_STOP_MS = 60 * 60 * 1000;
const MAX_AUTO_STOP_MS = 24 * 60 * 60 * 1000;
const MAX_RATE_PER_SECOND = 1000;
const TICK_INTERVAL_MS = 100;

export const DEFAULT_STRATEGY_MIX: ReadonlyArray<{ strategy: string; weight: number }> = [
  { strategy: "LIMIT", weight: 30 },
  { strategy: "TWAP", weight: 20 },
  { strategy: "VWAP", weight: 15 },
  { strategy: "POV", weight: 12 },
  { strategy: "ICEBERG", weight: 8 },
  { strategy: "SNIPER", weight: 5 },
  { strategy: "ARRIVAL_PRICE", weight: 5 },
  { strategy: "MOMENTUM", weight: 3 },
  { strategy: "IS", weight: 2 },
];

export const DEFAULT_EQUITY_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "TSLA",
  "JPM",
  "V",
  "WMT",
] as const;

const DEFAULT_USER_IDS = ["alice", "amelia", "bob", "dave"] as const;

export class LoadAgent {
  readonly #deps: LoadAgentDeps;
  #status: LoadAgentStatus = {
    running: false,
    startedAt: null,
    stopAt: null,
    config: null,
    ordersSent: 0,
    ordersFailed: 0,
    lastTickAt: null,
    lastError: null,
  };
  #intervalId: number | null = null;
  #autoStopId: number | null = null;
  #orderCounter = 0;

  constructor(deps: LoadAgentDeps) {
    this.#deps = deps;
  }

  start(
    partial: Partial<LoadAgentConfig>,
    actor: { userId: string; role: string }
  ): LoadAgentStatus {
    if (this.#status.running) {
      throw new Error("load-agent: already running; stop before starting again");
    }

    const config = this.#resolveConfig(partial);
    const now = Date.now();
    this.#status = {
      running: true,
      startedAt: now,
      stopAt: now + config.autoStopAfterMs,
      config,
      ordersSent: 0,
      ordersFailed: 0,
      lastTickAt: null,
      lastError: null,
    };
    this.#orderCounter = 0;

    this.#intervalId = setInterval(() => this.#tick(), TICK_INTERVAL_MS);
    this.#autoStopId = setTimeout(
      () => this.stop(actor, "auto-stop deadline reached"),
      config.autoStopAfterMs
    );

    this.#deps.publishAccessEvent({
      action: "load_agent_start",
      userId: actor.userId,
      userRole: actor.role,
      path: "/admin/load-gen/start",
      reason: `rate=${config.ratePerSecond}/s autoStop=${config.autoStopAfterMs / 60_000}min`,
    });
    logger.info("load-agent started", {
      actor: actor.userId,
      ratePerSecond: config.ratePerSecond,
      autoStopAfterMs: config.autoStopAfterMs,
    });

    return this.#status;
  }

  stop(actor: { userId: string; role: string }, reason: string = "operator-stop"): LoadAgentStatus {
    if (!this.#status.running) return this.#status;
    if (this.#intervalId !== null) clearInterval(this.#intervalId);
    if (this.#autoStopId !== null) clearTimeout(this.#autoStopId);
    this.#intervalId = null;
    this.#autoStopId = null;
    const finalStatus: LoadAgentStatus = { ...this.#status, running: false };
    this.#status = finalStatus;

    this.#deps.publishAccessEvent({
      action: "load_agent_stop",
      userId: actor.userId,
      userRole: actor.role,
      path: "/admin/load-gen/stop",
      reason,
    });
    logger.info("load-agent stopped", {
      actor: actor.userId,
      reason,
      ordersSent: finalStatus.ordersSent,
      ordersFailed: finalStatus.ordersFailed,
    });

    return finalStatus;
  }

  status(): LoadAgentStatus {
    return { ...this.#status };
  }

  #resolveConfig(partial: Partial<LoadAgentConfig>): LoadAgentConfig {
    const ratePerSecond = clamp(partial.ratePerSecond ?? 50, 1, MAX_RATE_PER_SECOND);
    const autoStopAfterMs = clamp(
      partial.autoStopAfterMs ?? DEFAULT_AUTO_STOP_MS,
      60_000,
      MAX_AUTO_STOP_MS
    );
    const sizeMin = Math.max(1, partial.sizeMin ?? 100);
    const sizeMax = Math.max(sizeMin, partial.sizeMax ?? 5_000);
    return {
      ratePerSecond,
      autoStopAfterMs,
      strategyMix: partial.strategyMix?.length ? partial.strategyMix : DEFAULT_STRATEGY_MIX,
      symbols: partial.symbols?.length ? partial.symbols : [...DEFAULT_EQUITY_SYMBOLS],
      userIds: partial.userIds?.length ? partial.userIds : [...DEFAULT_USER_IDS],
      sizeMin,
      sizeMax,
    };
  }

  async #tick(): Promise<void> {
    const cfg = this.#status.config;
    if (!cfg || !this.#status.running) return;

    const ordersPerTick = (cfg.ratePerSecond * TICK_INTERVAL_MS) / 1000;
    const wholeOrders = Math.floor(ordersPerTick);
    const fractional = ordersPerTick - wholeOrders;
    const total = wholeOrders + (Math.random() < fractional ? 1 : 0);
    if (total === 0) {
      this.#status.lastTickAt = Date.now();
      return;
    }

    await Promise.all(
      Array.from({ length: total }, () =>
        this.#emitOrder(cfg).catch((err) => {
          this.#status.ordersFailed += 1;
          this.#status.lastError = err instanceof Error ? err.message : String(err);
        })
      )
    );
    this.#status.lastTickAt = Date.now();
  }

  async #emitOrder(cfg: LoadAgentConfig): Promise<void> {
    const strategy = pickWeighted(cfg.strategyMix);
    const symbol = cfg.symbols[Math.floor(Math.random() * cfg.symbols.length)];
    const userId = cfg.userIds[this.#orderCounter % cfg.userIds.length];
    const side = this.#orderCounter % 2 === 0 ? "BUY" : "SELL";
    const refPrice = this.#deps.refPriceFor(symbol);
    const limitPrice =
      side === "BUY" ? Number((refPrice * 1.02).toFixed(2)) : Number((refPrice * 0.98).toFixed(2));
    const quantity = randomInt(cfg.sizeMin, cfg.sizeMax);
    const clientOrderId = `loadgen-${this.#status.startedAt}-${this.#orderCounter}`;
    this.#orderCounter += 1;

    await this.#deps.producer.send("orders.new", {
      clientOrderId,
      asset: symbol,
      side,
      quantity,
      limitPrice,
      expiresAt: 300,
      strategy,
      algoParams: { strategy },
      userId,
      userRole: "trader",
      _loadGenStartedAt: this.#status.startedAt,
    });
    this.#status.ordersSent += 1;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pickWeighted(items: ReadonlyArray<{ strategy: string; weight: number }>): string {
  const total = items.reduce((s, x) => s + x.weight, 0);
  const roll = Math.random() * total;
  const result = items.reduce<{ acc: number; pick: string | null }>(
    (state, item) => {
      if (state.pick) return state;
      const next = state.acc + item.weight;
      return next >= roll ? { acc: next, pick: item.strategy } : { acc: next, pick: null };
    },
    { acc: 0, pick: null }
  );
  return result.pick ?? items[0].strategy;
}
