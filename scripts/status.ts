#!/usr/bin/env -S deno run --allow-run --allow-env
/**
 * VETA Service Status Dashboard
 * Live terminal UI showing supervisord service states, grouped by tier.
 * Refresh every 2 s. Press q / Ctrl-C to quit.
 *
 * Usage:  deno run --allow-run --allow-env scripts/status.ts
 *   or    svc-ui  (fish alias)
 */

const CONF = new URL("../supervisord.conf", import.meta.url).pathname;
const CTL = ["supervisorctl", "-c", CONF];
const REFRESH_MS = 2000;

const GROUPS: Array<{ label: string; idle: boolean; programs: string[] }> = [
  {
    label: "Core",
    idle: false,
    programs: [
      "redpanda",
      "market-sim",
      "journal",
      "user-service",
      "ems",
      "oms",
      "gateway",
      "frontend",
      "frontend-proxy",
    ],
  },
  {
    label: "Algo Strategies",
    idle: true,
    programs: [
      "algo-trader",
      "twap-algo",
      "pov-algo",
      "vwap-algo",
      "iceberg-algo",
      "sniper-algo",
      "arrival-price-algo",
      "is-algo",
      "momentum-algo",
    ],
  },
  {
    label: "Microstructure",
    idle: true,
    programs: [
      "dark-pool",
      "ccp-service",
      "rfq-service",
      "product-service",
      "fix-archive",
      "fix-exchange",
      "fix-gateway",
    ],
  },
  {
    label: "Analytics Pipeline",
    idle: true,
    programs: [
      "analytics",
      "market-data-service",
      "market-data-adapters",
      "feature-engine",
      "signal-engine",
      "recommendation-engine",
      "scenario-engine",
    ],
  },
  {
    label: "Aux / Observability",
    idle: true,
    programs: [
      "kafka-relay",
      "news-aggregator",
      "llm-advisory-orchestrator",
      "llm-worker",
    ],
  },
];

const ESC = "\x1b[";
const A = {
  clear: `${ESC}2J${ESC}H`,
  hide: `${ESC}?25l`,
  show: `${ESC}?25h`,
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  green: `${ESC}32m`,
  red: `${ESC}31m`,
  yellow: `${ESC}33m`,
  cyan: `${ESC}36m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  white: `${ESC}37m`,
  bgDark: `${ESC}40m`,
  move: (r: number, c: number) => `${ESC}${r};${c}H`,
};

function col(text: string, ...codes: string[]): string {
  return codes.join("") + text + A.reset;
}

interface SvcInfo {
  name: string;
  state: string;
  pid: string;
  uptime: string;
  raw: string;
}

async function fetchStatus(): Promise<Map<string, SvcInfo>> {
  const map = new Map<string, SvcInfo>();
  try {
    const proc = new Deno.Command(CTL[0], {
      args: [...CTL.slice(1), "status"],
      stdout: "piped",
      stderr: "null",
    });
    const { stdout } = await proc.output();
    const text = new TextDecoder().decode(stdout);
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      // Format: "program-name     STATE     pid 12345, uptime 0:01:23"
      // or:     "group:program    STATE     ..."
      const m = line.match(
        /^([^\s]+)\s+(\w+)\s+(?:pid\s+(\d+),\s+uptime\s+([\d:]+))?/,
      );
      if (!m) continue;
      let name = m[1];
      const colonIdx = name.indexOf(":");
      if (colonIdx !== -1) name = name.slice(colonIdx + 1);
      map.set(name, {
        name,
        state: m[2] ?? "UNKNOWN",
        pid: m[3] ?? "-",
        uptime: m[4] ?? "-",
        raw: line.trim(),
      });
    }
  } catch {
    // supervisord not running
  }
  return map;
}

const FRIENDLY: Record<string, string> = {
  "algo-trader": "limit-algo",
  "llm-advisory-orchestrator": "llm-advisory",
  "market-data-service": "market-data",
  "market-data-adapters": "mkt-data-adapters",
  "recommendation-engine": "recommendation",
  "arrival-price-algo": "arrival-price",
};

function friendlyName(name: string): string {
  return FRIENDLY[name] ?? name;
}

function stateIndicator(state: string): string {
  switch (state) {
    case "RUNNING":
      return col("●", A.green, A.bold);
    case "STOPPED":
      return col("○", A.dim);
    case "STARTING":
      return col("◎", A.yellow);
    case "STOPPING":
      return col("◎", A.yellow);
    case "BACKOFF":
    case "EXITED":
      return col("◆", A.red);
    case "FATAL":
      return col("✗", A.red, A.bold);
    default:
      return col("?", A.dim);
  }
}

function stateText(state: string): string {
  switch (state) {
    case "RUNNING":
      return col(state.padEnd(8), A.green);
    case "STOPPED":
      return col(state.padEnd(8), A.dim);
    case "STARTING":
    case "STOPPING":
      return col(state.padEnd(8), A.yellow);
    case "BACKOFF":
    case "EXITED":
    case "FATAL":
      return col(state.padEnd(8), A.red);
    default:
      return col(state.padEnd(8), A.dim);
  }
}

function groupSummary(
  programs: string[],
  status: Map<string, SvcInfo>,
): { running: number; total: number } {
  let running = 0;
  for (const p of programs) {
    if (status.get(p)?.state === "RUNNING") running++;
  }
  return { running, total: programs.length };
}

function renderGroupHeader(
  label: string,
  idle: boolean,
  running: number,
  total: number,
): string {
  const all = running === total;
  const none = running === 0;
  const frac = `${running}/${total}`;
  const indicator = all
    ? col(frac, A.green, A.bold)
    : none
    ? col(frac, A.dim)
    : col(frac, A.yellow, A.bold);
  const tag = idle ? col(" [idle-safe]", A.dim) : col(" [always-on]", A.cyan);
  return (
    col("  ┌─ ", A.dim) +
    col(label, A.bold, A.white) +
    tag +
    col("  ", A.reset) +
    indicator +
    col(" running", A.dim)
  );
}

function renderRow(name: string, info: SvcInfo | undefined): string {
  const fname = friendlyName(name).padEnd(22);
  if (!info) {
    return (
      "  │  " +
      col("○", A.dim) +
      "  " +
      col(fname, A.dim) +
      col("UNKNOWN ", A.dim) +
      col("  (not in supervisord output)", A.dim)
    );
  }
  const uptime = info.state === "RUNNING"
    ? col(`  up ${info.uptime}`, A.dim)
    : info.state === "STOPPED"
    ? col("  stopped", A.dim)
    : col(`  pid ${info.pid}`, A.dim);
  return (
    "  │  " +
    stateIndicator(info.state) +
    "  " +
    col(fname, A.reset) +
    stateText(info.state) +
    uptime
  );
}

function countTotals(
  status: Map<string, SvcInfo>,
): { running: number; total: number; stopped: number; error: number } {
  let running = 0, stopped = 0, error = 0;
  const total = [...GROUPS.flatMap((g) => g.programs)].length;
  for (const g of GROUPS) {
    for (const p of g.programs) {
      const s = status.get(p)?.state ?? "UNKNOWN";
      if (s === "RUNNING") running++;
      else if (s === "STOPPED") stopped++;
      else if (s === "FATAL" || s === "EXITED" || s === "BACKOFF") error++;
    }
  }
  return { running, total, stopped, error };
}

function render(status: Map<string, SvcInfo>, tick: number): string {
  const lines: string[] = [];
  const { running, total, stopped, error } = countTotals(status);
  const spinners = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spin = col(spinners[tick % spinners.length], A.dim);

  const now = new Date().toLocaleTimeString("en-GB");

  lines.push("");
  lines.push(
    col(
      "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      A.cyan,
    ),
  );
  lines.push(
    col("  VETA Service Status", A.bold, A.cyan) +
      col("                              ", A.reset) +
      spin +
      col(`  ${now}`, A.dim),
  );
  lines.push(
    col(
      "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      A.cyan,
    ),
  );

  const runStr = col(`${running} running`, A.green, A.bold);
  const stpStr = col(`${stopped} stopped`, A.dim);
  const errStr = error > 0
    ? col(`  ${error} error`, A.red, A.bold)
    : col("  0 errors", A.dim);
  lines.push(
    `  ${runStr}  ${stpStr}${errStr}` +
      col(`  of ${total} total`, A.dim),
  );
  lines.push("");

  for (const group of GROUPS) {
    const { running: gr, total: gt } = groupSummary(group.programs, status);
    lines.push(renderGroupHeader(group.label, group.idle, gr, gt));
    for (const p of group.programs) {
      lines.push(renderRow(p, status.get(p)));
    }
    lines.push(col("  └" + "─".repeat(58), A.dim));
    lines.push("");
  }

  lines.push(
    col(
      "  Commands: ",
      A.dim,
    ) +
      col("svc-ui", A.cyan) +
      col("  start-trading  ", A.dim) +
      col("stop-idle", A.cyan) +
      col("  svc-restart <name>  ", A.dim) +
      col("q", A.cyan) +
      col(" quit", A.dim),
  );
  lines.push("");

  return A.clear + lines.join("\n");
}

async function main() {
  const once = Deno.args.includes("--once");

  // One-shot snapshot mode (used in login banner, no raw mode, no clear)
  if (once) {
    const status = await fetchStatus();
    const lines: string[] = [];
    for (const group of GROUPS) {
      const { running: gr, total: gt } = groupSummary(group.programs, status);
      lines.push(renderGroupHeader(group.label, group.idle, gr, gt));
      for (const p of group.programs) {
        lines.push(renderRow(p, status.get(p)));
      }
      lines.push(col("  └" + "─".repeat(58), A.dim));
    }
    console.log(lines.join("\n"));
    return;
  }

  let running = true;

  await Deno.stdout.write(new TextEncoder().encode(A.hide));

  const restore = () => {
    Deno.stdout.writeSync(new TextEncoder().encode(A.show + A.reset + "\n"));
  };

  Deno.addSignalListener("SIGINT", () => {
    restore();
    Deno.exit(0);
  });

  try {
    Deno.stdin.setRaw(true);
  } catch {
    // not a TTY (piped / CI) — just run once and exit
    const status = await fetchStatus();
    console.log(render(status, 0));
    restore();
    return;
  }

  const stdinReader = Deno.stdin.readable.getReader();

  let tick = 0;

  let status = await fetchStatus();
  await Deno.stdout.write(new TextEncoder().encode(render(status, tick)));

  const readKey = async (): Promise<boolean> => {
    try {
      const { value } = await stdinReader.read();
      if (!value) return false;
      const ch = value[0];
      if (ch === 113 || ch === 81 || ch === 27 || ch === 3) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  };

  while (running) {
    tick++;
    const refreshDelay = new Promise<"timeout">((r) =>
      setTimeout(() => r("timeout"), REFRESH_MS)
    );
    const keyPress = readKey().then((keepGoing) =>
      keepGoing ? "key" as const : "quit" as const
    );

    const result = await Promise.race([refreshDelay, keyPress]);

    if (result === "quit") {
      running = false;
      break;
    }

    status = await fetchStatus();
    await Deno.stdout.write(
      new TextEncoder().encode(render(status, tick)),
    );
  }

  restore();
  stdinReader.cancel();
}

main();
