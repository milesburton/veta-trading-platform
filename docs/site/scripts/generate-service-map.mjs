import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const outputPath = path.resolve(
  docsSiteRoot,
  "src/content/docs/platform/services.md",
);

const supervisord = fs.readFileSync(path.join(repoRoot, "supervisord.conf"), "utf8");

const INFRA_OR_NON_HTTP = new Set([
  "db-migrate",
  "redpanda",
  "frontend",
  "frontend-proxy",
]);

const DESCRIPTIONS = {
  "market-sim": "GBM price engine, real-data seeding",
  ems: "Execution management, FIX bridge",
  oms: "Order validation, routing, RBAC limits",
  "algo-trader": "LIMIT order monitoring",
  "twap-algo": "Time-weighted average price slicing",
  "pov-algo": "Percent-of-volume participation",
  "vwap-algo": "Volume-weighted average price",
  "iceberg-algo": "Hidden order iceberg execution",
  "sniper-algo": "Multi-venue smart order routing",
  "arrival-price-algo": "Arrival price benchmark execution",
  "is-algo": "Implementation shortfall minimisation",
  "momentum-algo": "EMA crossover signal-driven",
  "kafka-relay": "HTTP→Kafka relay for browser/event ingestion",
  "user-service": "OAuth2, RBAC, session management",
  journal: "PostgreSQL trade lifecycle store",
  gateway: "WebSocket hub, HTTP proxy, auth",
  "fix-archive": "FIX execution report persistence",
  "fix-exchange": "Simulated FIX 4.2 matching engine",
  "fix-gateway": "FIX 4.2 session manager",
  analytics: "Black-Scholes, Monte Carlo, recommendations",
  "market-data-service": "Alpha Vantage, Polygon, Tiingo polling",
  "market-data-adapters": "Earnings, economic event adapters",
  "feature-engine": "Real-time feature vector computation",
  "signal-engine": "Signal scoring from features",
  "recommendation-engine": "Rule-based trade recommendations",
  "scenario-engine": "Factor shock scenario analysis",
  "news-aggregator": "Market news with sentiment scoring",
  "llm-advisory-orchestrator": "Natural language trade commentary (Ollama)",
  "llm-worker": "LLM inference worker (job queue consumer)",
  "dark-pool": "Simulated dark pool crossing network",
  "ccp-service": "Central counterparty clearing",
  "rfq-service": "Request for quote workflow",
  "product-service": "Structured product builder (CDO-like multi-leg baskets)",
  "replay-service": "rrweb session recording and playback",
  "risk-engine": "Pre-trade risk checks (6 checks)",
  "discord-bot": "Discord Gateway client, welcome message on member join",
};

const DISPLAY_NAMES = {
  "market-sim": "Market Simulator",
  ems: "EMS",
  oms: "OMS",
  "algo-trader": "LIMIT Algo",
  "twap-algo": "TWAP Algo",
  "pov-algo": "POV Algo",
  "vwap-algo": "VWAP Algo",
  "iceberg-algo": "ICEBERG Algo",
  "sniper-algo": "SNIPER Algo",
  "arrival-price-algo": "ARRIVAL_PRICE Algo",
  "is-algo": "IS Algo",
  "momentum-algo": "MOMENTUM Algo",
  "kafka-relay": "Kafka Relay",
  "user-service": "User Service",
  journal: "Journal",
  gateway: "Gateway (BFF)",
  "fix-archive": "FIX Archive",
  "fix-exchange": "FIX Exchange",
  "fix-gateway": "FIX Gateway",
  analytics: "Analytics",
  "market-data-service": "Market Data",
  "market-data-adapters": "Market Data Adapters",
  "feature-engine": "Feature Engine",
  "signal-engine": "Signal Engine",
  "recommendation-engine": "Recommendation Engine",
  "scenario-engine": "Scenario Engine",
  "news-aggregator": "News Aggregator",
  "llm-advisory-orchestrator": "LLM Advisory Orchestrator",
  "llm-worker": "LLM Worker",
  "dark-pool": "Dark Pool",
  "ccp-service": "CCP",
  "rfq-service": "RFQ",
  "product-service": "Product Service",
  "replay-service": "Session Replay",
  "risk-engine": "Risk Engine",
  "discord-bot": "Discord Bot",
};

function parseSupervisordPrograms(text) {
  const programs = [];
  const blocks = text.split(/^\[program:/m).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("]");
    if (newline === -1) continue;
    const name = block.slice(0, newline).trim();
    const commandMatch = block.match(/command=([^\n]+)/);
    if (!commandMatch) continue;
    programs.push({ name, command: commandMatch[1] });
  }
  return programs;
}

function findScriptPath(command) {
  const match = command.match(/(\/[\w./-]+\.ts)/);
  return match ? match[1] : null;
}

function resolveScriptAbsPath(scriptPath) {
  if (!scriptPath) return null;
  // supervisord.conf hard-codes container-style absolute paths like
  //   /workspaces/virtual-equities-trading-application/backend/...
  //   /app/...
  // Those resolve fine inside the devcontainer but not on GitHub
  // Actions runners where the checkout is at
  //   /home/runner/work/<repo>/<repo>/.
  // Strip any known container prefix and re-rebase under the actual
  // repoRoot. The previous version accepted /workspaces/... unchanged,
  // which silently returned a non-existent path on CI ->
  // extractDefaultPort returned null -> every service rendered with
  // port `—` and the table re-sorted alphabetically. That diff
  // blocked every PR on check-clean-state.
  const KNOWN_CONTAINER_PREFIXES = [
    "/workspaces/virtual-equities-trading-application/",
    "/app/",
  ];
  for (const prefix of KNOWN_CONTAINER_PREFIXES) {
    if (scriptPath.startsWith(prefix)) {
      return path.join(repoRoot, scriptPath.slice(prefix.length));
    }
  }
  return path.join(repoRoot, scriptPath);
}

function extractDescription(scriptAbs) {
  if (!scriptAbs || !fs.existsSync(scriptAbs)) return null;
  const src = fs.readFileSync(scriptAbs, "utf8");
  const m = src.match(/^\s*\/\*\*\s*([\s\S]*?)\s*\*\//);
  if (!m) return null;
  // Split into paragraphs by blank line. The leading JSDoc usually has the
  // structure:
  //   /**
  //    * Title line.
  //    *
  //    * First paragraph — short summary, what this page should show.
  //    *
  //    * Longer operational detail (events, endpoints, lifecycle) below.
  //    */
  // We want the title plus the first paragraph; anything past the next blank
  // line stays in the source code as long-form context.
  const rawLines = m[1].split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trimEnd());
  const paragraphs = [];
  let current = [];
  for (const line of rawLines) {
    if (line.trim().length === 0) {
      if (current.length > 0) paragraphs.push(current.join(" ").trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" ").trim());
  if (paragraphs.length === 0) return null;
  // The first paragraph is the title + summary; if it fits on a single line
  // there's no separate summary, return the line; otherwise drop the title
  // and return the summary.
  const firstPara = paragraphs[0];
  if (paragraphs.length >= 2) {
    return paragraphs[1];
  }
  // No blank-line summary; return everything truncated at the first
  // sentence boundary so the table cell stays readable.
  const idx = firstPara.search(/\.\s+[A-Z]/);
  return idx > 0 ? `${firstPara.slice(0, idx + 1).trim()}` : firstPara;
}

function extractDefaultPort(scriptAbs, programName) {
  if (!scriptAbs || !fs.existsSync(scriptAbs)) return null;
  const src = fs.readFileSync(scriptAbs, "utf8");

  const bindRegex =
    /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*Number\(Deno\.env\.get\("([A-Z_]+_PORT)"\)\)\s*\|\|\s*(\d[_\d]*)/g;
  const bindings = [];
  let m;
  m = bindRegex.exec(src);
  while (m !== null) {
    bindings.push({ varName: m[1], envName: m[2], value: Number(m[3].replace(/_/g, "")) });
    m = bindRegex.exec(src);
  }

  const exact = bindings.find((b) => b.varName === "PORT");
  if (exact) return exact.value;

  const programToken = programName.replace(/-/g, "_").toUpperCase();
  const programMatch = bindings.find((b) =>
    b.envName.includes(programToken) || b.varName.includes(programToken),
  );
  if (programMatch) return programMatch.value;

  if (bindings.length === 1) return bindings[0].value;
  if (bindings.length > 0) return bindings[0].value;
  return null;
}

const programs = parseSupervisordPrograms(supervisord);
const rows = [];
for (const program of programs) {
  if (INFRA_OR_NON_HTTP.has(program.name)) continue;
  const scriptPath = findScriptPath(program.command);
  const scriptAbs = resolveScriptAbsPath(scriptPath);
  const port = extractDefaultPort(scriptAbs, program.name);
  // Hand-typed descriptions in DESCRIPTIONS take priority because they have
  // been tuned for a single-cell table format. Source JSDoc is fallback for
  // services we forget to add to the map. Audit the table after adding a
  // new service to see whether the JSDoc-derived fallback reads well or
  // needs a hand-tuned override.
  const description =
    DESCRIPTIONS[program.name] ?? extractDescription(scriptAbs) ?? "—";
  rows.push({
    name: program.name,
    port,
    display: DISPLAY_NAMES[program.name] ?? program.name,
    description,
  });
}

rows.sort((a, b) => {
  if (a.port == null && b.port == null) return a.name.localeCompare(b.name);
  if (a.port == null) return 1;
  if (b.port == null) return -1;
  return a.port - b.port;
});

const lines = [
  "---",
  "title: Service Map",
  "description: Every backend service, its port, and what it does.",
  "---",
  "",
  "<!-- This page is generated by docs/site/scripts/generate-service-map.mjs from supervisord.conf and each service's *_PORT default. Edits will be lost; change the source files instead. -->",
  "",
  "Ports listed below are the internal listening ports used inside the dev container and the docker compose network. In production deployments the services are not exposed on these ports directly: public traffic enters via the [Traefik](/veta-trading-platform/platform/supporting/traefik/) ingress and is routed to services over the internal Docker network.",
  "",
  "| Port (dev container) | Service | Process | Role |",
  "|------|---------|---------|------|",
];
for (const r of rows) {
  const portCell = r.port ?? "—";
  lines.push(`| ${portCell} | ${r.display} | \`${r.name}\` | ${r.description} |`);
}

const body = `${lines.join("\n")}\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, body);

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} (${rows.length} services)`,
);
