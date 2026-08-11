import { getTraderArchetype, STARTER_MAX_ORDER_QTY } from "@veta/trader-archetypes";
import type { OrderNew } from "@veta/schemas/orders";
import type { PositionTracker, Side } from "./positionTracker.ts";

interface DeskConfig {
  desk: OrderNew["desk"];
  instrumentType: OrderNew["instrumentType"];
  symbols: readonly string[];
}

const EQUITY_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "GS", "V"];

// Real symbols pulled from market-sim's asset universes (fxAssets.ts,
// commodityAssets.ts, shared/curatedBonds.ts) so orders look like the
// instruments the platform actually simulates prices for, without a
// cross-service import of those service-specific files.
const DESK_CONFIG: Record<string, DeskConfig> = {
  equity: { desk: "equity", instrumentType: "equity", symbols: EQUITY_SYMBOLS },
  fx: {
    desk: "fx",
    instrumentType: "fx",
    symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "EUR/GBP", "EUR/JPY", "NZD/USD"],
  },
  fi: {
    desk: "fi",
    instrumentType: "bond",
    symbols: ["US3M", "US6M", "US1Y", "US2Y", "US3Y", "US5Y", "US7Y", "US10Y", "US20Y", "US30Y"],
  },
  derivatives: { desk: "derivatives", instrumentType: "option", symbols: EQUITY_SYMBOLS },
  commodities: {
    desk: "commodities",
    instrumentType: "commodity",
    symbols: ["CL1!", "NG1!", "GC1!", "SI1!", "HG1!", "ZC1!", "ZW1!", "ZS1!"],
  },
};

const STRATEGY_WEIGHTS: Record<string, number> = {
  LIMIT: 30,
  TWAP: 20,
  VWAP: 15,
  POV: 12,
  ICEBERG: 8,
  SNIPER: 5,
  ARRIVAL_PRICE: 5,
  MOMENTUM: 3,
  IS: 2,
};

const MIN_QUANTITY = 100;
const MAX_QUANTITY = 2_000;
const FAT_FINGER_SAFE_PCT = 0.02;

export interface DecisionEngineConfig {
  archetypeId: string;
  userId: string;
  symbols?: readonly string[];
  random?: () => number;
}

export interface Decision {
  kind: "order";
  order: OrderNew;
}

export interface Skip {
  kind: "skip";
  skippedReason: string;
}

function pickWeighted(weights: Record<string, number>, random: () => number): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0][0];
}

export class DecisionEngine {
  #archetypeId: string;
  #userId: string;
  #allowedStrategies: string[];
  #desk: DeskConfig;
  #symbols: readonly string[];
  #random: () => number;
  #counter = 0;

  constructor(config: DecisionEngineConfig) {
    const archetype = getTraderArchetype(config.archetypeId);
    if (!archetype) {
      throw new Error(`Unknown trader archetype: ${config.archetypeId}`);
    }
    const desk = DESK_CONFIG[archetype.allowedDesks];
    if (!desk) {
      throw new Error(`No desk config for allowedDesks: ${archetype.allowedDesks}`);
    }
    this.#archetypeId = archetype.id;
    this.#userId = config.userId;
    this.#allowedStrategies = archetype.allowedStrategies.split(",").map((s) => s.trim());
    this.#desk = desk;
    this.#symbols = config.symbols ?? desk.symbols;
    this.#random = config.random ?? Math.random;
  }

  #pickStrategy(): string {
    const weights: Record<string, number> = {};
    for (const strategy of this.#allowedStrategies) {
      if (strategy in STRATEGY_WEIGHTS) weights[strategy] = STRATEGY_WEIGHTS[strategy];
    }
    if (Object.keys(weights).length === 0) {
      return this.#allowedStrategies[0];
    }
    return pickWeighted(weights, this.#random);
  }

  #pickSide(): Side {
    return this.#random() < 0.5 ? "BUY" : "SELL";
  }

  #pickQuantity(): number {
    const range = Math.min(MAX_QUANTITY, STARTER_MAX_ORDER_QTY / 5) - MIN_QUANTITY;
    return Math.round(MIN_QUANTITY + this.#random() * range);
  }

  #nextClientOrderId(): string {
    this.#counter += 1;
    return `synthetic-${this.#archetypeId}-${Date.now()}-${this.#counter}`;
  }

  decide(tracker: PositionTracker, midPriceFor: (symbol: string) => number | undefined): Decision | Skip {
    if (tracker.openOrderCount() >= 30) {
      return { kind: "skip", skippedReason: "open-order cap reached" };
    }

    const side = this.#pickSide();
    const candidates = this.#symbols.filter((symbol) => !tracker.hasOpenOpposite(symbol, side));
    if (candidates.length === 0) {
      return { kind: "skip", skippedReason: "no symbol without an open opposite-side order" };
    }
    const symbol = tracker.pickLeastConcentrated(candidates);

    const mid = midPriceFor(symbol);
    if (mid === undefined || mid <= 0) {
      return { kind: "skip", skippedReason: `no live price for ${symbol}` };
    }

    const strategy = this.#pickStrategy();
    const quantity = this.#pickQuantity();
    const drift = (this.#random() * 2 - 1) * FAT_FINGER_SAFE_PCT;
    const limitPrice = Math.round(mid * (1 + drift) * 100) / 100;

    const order: OrderNew = {
      clientOrderId: this.#nextClientOrderId(),
      userId: this.#userId,
      asset: symbol,
      side,
      quantity,
      limitPrice,
      strategy: strategy as OrderNew["strategy"],
      instrumentType: this.#desk.instrumentType,
      desk: this.#desk.desk,
    };

    return { kind: "order", order };
  }
}
