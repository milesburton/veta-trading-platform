import { applyMigrations } from "./migrations.ts";
import { startEphemeralPostgres } from "./postgres.ts";
import { startEphemeralRedpanda } from "./redpanda.ts";
import type { ManagedPostgres, ManagedRedpanda } from "./types.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;

export type ServiceName =
  | "market-sim"
  | "ems"
  | "oms"
  | "journal"
  | "user-service"
  | "scenario-engine"
  | "feature-engine"
  | "signal-engine"
  | "risk-engine"
  | "limit-strategy"
  | "twap-strategy"
  | "pov-strategy"
  | "vwap-strategy"
  | "iceberg-strategy"
  | "sniper-strategy"
  | "arrival-price-strategy"
  | "momentum-strategy"
  | "is-strategy"
  | "market-data"
  | "market-data-adapters"
  | "fix-archive"
  | "observability"
  | "gateway"
  | "news-aggregator"
  | "analytics"
  | "recommendation-engine"
  | "llm-advisory"
  | "replay"
  | "rfq-service"
  | "dark-pool"
  | "ccp-service";

interface ServiceDescriptor {
  entrypoint: string;
  port: number;
  health: string;
  readyLog?: RegExp;
}

const ALGO_READY = /connected to market-sim/;

const SERVICES: Record<ServiceName, ServiceDescriptor> = {
  "market-sim": {
    entrypoint: "backend/src/market-sim/market-sim.ts",
    port: 5000,
    health: "/health",
  },
  ems: {
    entrypoint: "backend/src/ems/ems-server.ts",
    port: 5001,
    health: "/health",
  },
  oms: {
    entrypoint: "backend/src/oms/oms-server.ts",
    port: 5002,
    health: "/health",
  },
  "limit-strategy": {
    entrypoint: "backend/src/algo/limit-strategy.ts",
    port: 5003,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "twap-strategy": {
    entrypoint: "backend/src/algo/twap-strategy.ts",
    port: 5004,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "pov-strategy": {
    entrypoint: "backend/src/algo/pov-strategy.ts",
    port: 5005,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "vwap-strategy": {
    entrypoint: "backend/src/algo/vwap-strategy.ts",
    port: 5006,
    health: "/health",
    readyLog: ALGO_READY,
  },
  observability: {
    entrypoint: "observability/kafka-relay.ts",
    port: 5007,
    health: "/health",
  },
  "iceberg-strategy": {
    entrypoint: "backend/src/algo/iceberg-strategy.ts",
    port: 5021,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "sniper-strategy": {
    entrypoint: "backend/src/algo/sniper-strategy.ts",
    port: 5022,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "arrival-price-strategy": {
    entrypoint: "backend/src/algo/arrival-price-strategy.ts",
    port: 5023,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "momentum-strategy": {
    entrypoint: "backend/src/algo/momentum-strategy.ts",
    port: 5025,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "is-strategy": {
    entrypoint: "backend/src/algo/is-strategy.ts",
    port: 5026,
    health: "/health",
    readyLog: ALGO_READY,
  },
  "user-service": {
    entrypoint: "backend/src/user-service/user-service.ts",
    port: 5008,
    health: "/health",
  },
  journal: {
    entrypoint: "backend/src/journal/journal-server.ts",
    port: 5009,
    health: "/health",
  },
  gateway: {
    entrypoint: "backend/src/gateway/gateway.ts",
    port: 5011,
    health: "/health",
  },
  "fix-archive": {
    entrypoint: "backend/src/fix/fix-archive.ts",
    port: 5012,
    health: "/health",
  },
  "market-data": {
    entrypoint: "backend/src/market-data/market-data-service.ts",
    port: 5015,
    health: "/health",
  },
  "market-data-adapters": {
    entrypoint: "backend/src/market-data-adapters/adapter-server.ts",
    port: 5016,
    health: "/health",
  },
  "feature-engine": {
    entrypoint: "backend/src/feature-engine/feature-engine.ts",
    port: 5017,
    health: "/health",
  },
  "signal-engine": {
    entrypoint: "backend/src/signal-engine/signal-engine.ts",
    port: 5018,
    health: "/health",
  },
  "scenario-engine": {
    entrypoint: "backend/src/scenario-engine/scenario-server.ts",
    port: 5020,
    health: "/health",
  },
  "risk-engine": {
    entrypoint: "backend/src/risk-engine/risk-engine.ts",
    port: 5032,
    health: "/health",
  },
  "news-aggregator": {
    entrypoint: "backend/src/news/news-aggregator.ts",
    port: 5013,
    health: "/health",
  },
  analytics: {
    entrypoint: "backend/src/analytics/analytics-server.ts",
    port: 5014,
    health: "/health",
  },
  "recommendation-engine": {
    entrypoint: "backend/src/recommendation-engine/recommendation-server.ts",
    port: 5019,
    health: "/health",
  },
  "llm-advisory": {
    entrypoint: "backend/src/llm-advisory/orchestrator.ts",
    port: 5024,
    health: "/health",
  },
  replay: {
    entrypoint: "backend/src/replay/replay-service.ts",
    port: 5031,
    health: "/health",
  },
  "rfq-service": {
    entrypoint: "backend/src/rfq/rfq-service.ts",
    port: 5029,
    health: "/health",
  },
  "dark-pool": {
    entrypoint: "backend/src/dark-pool/dark-pool-server.ts",
    port: 5027,
    health: "/health",
  },
  "ccp-service": {
    entrypoint: "backend/src/ccp/ccp-service.ts",
    port: 5028,
    health: "/health",
  },
};

interface RunningService {
  name: ServiceName;
  process: Deno.ChildProcess;
  port: number;
  log: string[];
}

export interface TestStack {
  postgres: ManagedPostgres;
  redpanda: ManagedRedpanda;
  urls: Partial<Record<ServiceName, string>>;
  inspectLogs: (name: ServiceName) => string;
  dumpLogs: () => string;
  teardown: () => Promise<void>;
}

export interface StartStackOptions {
  services: ServiceName[];
  perServiceEnv?: Partial<Record<ServiceName, Record<string, string>>>;
  startupTimeoutMs?: number;
  verbose?: boolean;
  // When set (or DENO_COVERAGE_DIR env), spawn each service with
  // --coverage=<coverageDir>/<service-name> so .tc.test.ts runs
  // contribute to the unified coverage report. Subprocesses get up to
  // 3s on SIGTERM to flush coverage before SIGKILL (see killProcess).
  coverageDir?: string;
}

function buildBaseEnv(
  pg: ManagedPostgres,
  rp: ManagedRedpanda,
): Record<string, string> {
  return {
    HOME: Deno.env.get("HOME") ?? "/tmp",
    PATH: Deno.env.get("PATH") ?? "/usr/local/bin:/usr/bin:/bin",
    DENO_DIR: Deno.env.get("DENO_DIR") ?? "/tmp/deno-cache",
    DATABASE_URL: pg.url,
    JOURNAL_DATABASE_URL: pg.url,
    USERS_DATABASE_URL: pg.url,
    REDPANDA_BROKERS: rp.brokers,
    OAUTH2_SHARED_SECRET: "veta-dev-passcode",
    VETA_ALLOW_DEFAULT_PASSCODE: "true",
    VETA_DEMO_MODE: "true",
    RISK_ENGINE_ENABLED: "false",
    LOG_LEVEL: Deno.env.get("STACK_LOG_LEVEL") ?? "info",
    OTEL_DENO: "false",
  };
}

async function waitForHealth(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await res.body?.cancel();
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Health check timeout for ${url}: ${lastErr}`);
}

async function waitForKafka(
  host: string,
  port: number,
  deadlineMs: number,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const sock = await Deno.connect({ hostname: host, port });
      sock.close();
      return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Kafka broker ${host}:${port} not accepting after ${deadlineMs}ms: ${lastErr}`,
  );
}

async function waitForLog(
  log: string[],
  pattern: RegExp,
  deadlineMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (pattern.test(log.join(""))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Ready-log ${pattern} not seen for ${label} within ${deadlineMs}ms`,
  );
}

async function killProcess(proc: Deno.ChildProcess): Promise<void> {
  try {
    proc.kill("SIGTERM");
  } catch {
    /* already dead */
  }
  let killTimer: number | undefined;
  const killOnTimeout = new Promise<Deno.CommandStatus>((resolve) => {
    killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve({ success: false, code: -1, signal: "SIGKILL" });
    }, 3_000);
  });
  await Promise.race([proc.status, killOnTimeout]);
  if (killTimer !== undefined) clearTimeout(killTimer);
  await proc.status.catch(() => {});
}

function pipeToBuffer(
  stream: ReadableStream<Uint8Array>,
  buf: string[],
  prefix: string,
  echo: boolean,
): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        const text = decoder.decode(value, { stream: true });
        buf.push(text);
        if (buf.length > 4_000) buf.splice(0, buf.length - 2_000);
        if (echo) {
          await Deno.stderr.write(
            new TextEncoder().encode(`[${prefix}] ${text}`),
          );
        }
      }
    } catch {
      /* stream cancelled */
    }
  })();
}

export async function startStack(opts: StartStackOptions): Promise<TestStack> {
  const startupTimeoutMs = opts.startupTimeoutMs ?? 30_000;
  const coverageDir = opts.coverageDir ?? Deno.env.get("DENO_COVERAGE_DIR");

  const pg = await startEphemeralPostgres();
  let rp: ManagedRedpanda | null = null;
  const running: RunningService[] = [];

  const teardown = async () => {
    for (const svc of running.reverse()) await killProcess(svc.process);
    if (rp) await rp.teardown();
    await pg.teardown();
  };

  try {
    await applyMigrations(pg.url);
    rp = await startEphemeralRedpanda();
    await waitForKafka(rp.host, rp.port, 30_000);

    const baseEnv = buildBaseEnv(pg, rp);
    const urls: Partial<Record<ServiceName, string>> = {};

    for (const name of opts.services) {
      const desc = SERVICES[name];
      if (!desc) throw new Error(`Unknown service: ${name}`);

      const env: Record<string, string> = {
        ...baseEnv,
        ...(opts.perServiceEnv?.[name] ?? {}),
      };

      const args = ["run", "--allow-all"];
      if (coverageDir) {
        // All subprocesses write to the same directory; Deno coverage
        // profiles use random per-process filenames so they don't collide.
        args.push(`--coverage=${coverageDir}`);
      }
      args.push(desc.entrypoint);
      const cmd = new Deno.Command("deno", {
        args,
        cwd: REPO_ROOT,
        env,
        stdout: "piped",
        stderr: "piped",
      });
      const process = cmd.spawn();
      const log: string[] = [];
      pipeToBuffer(process.stdout, log, name, opts.verbose ?? false);
      pipeToBuffer(process.stderr, log, name, opts.verbose ?? false);
      running.push({ name, process, port: desc.port, log });
      urls[name] = `http://localhost:${desc.port}`;
    }

    await Promise.all(
      running.map((svc) =>
        waitForHealth(
          `http://localhost:${svc.port}${SERVICES[svc.name].health}`,
          startupTimeoutMs,
        )
      ),
    );

    await Promise.all(
      running.flatMap((svc) => {
        const readyLog = SERVICES[svc.name].readyLog;
        return readyLog
          ? [waitForLog(svc.log, readyLog, startupTimeoutMs, svc.name)]
          : [];
      }),
    );

    if (
      opts.services.includes("limit-strategy") ||
      opts.services.includes("twap-strategy") ||
      opts.services.includes("pov-strategy") ||
      opts.services.includes("vwap-strategy")
    ) {
      await new Promise((r) => setTimeout(r, 1_500));
    }

    return {
      postgres: pg,
      redpanda: rp,
      urls,
      inspectLogs(name) {
        const svc = running.find((s) => s.name === name);
        return svc ? svc.log.join("") : "";
      },
      dumpLogs() {
        return running.map((svc) =>
          `=== ${svc.name} ===\n${svc.log.join("")}\n`
        ).join("\n");
      },
      teardown,
    };
  } catch (err) {
    const captured = running
      .map((svc) =>
        `=== ${svc.name} (port ${svc.port}) ===\n${
          svc.log.join("").slice(-2_000)
        }`
      )
      .join("\n");
    if (captured) {
      await Deno.stderr.write(
        new TextEncoder().encode(
          `\n--- service logs at startup failure ---\n${captured}\n`,
        ),
      );
    }
    await teardown();
    throw err;
  }
}
