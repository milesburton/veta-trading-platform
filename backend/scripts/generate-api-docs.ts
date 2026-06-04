import { join } from "https://deno.land/std@0.210.0/path/mod.ts";

const ROUTES_DIR = "./backend/src/gateway/routes";
const OUTPUT_FILE = "./docs/api-endpoints.md";

const SERVICE_MAPPINGS: Record<string, string> = {
  "user-service": "User Service",
  analytics: "Analytics Service",
  "market-data": "Market Data Service",
  "feature-engine": "Feature Engine",
  "signal-engine": "Signal Engine",
  "recommendation-engine": "Recommendation Engine",
  "scenario-engine": "Scenario Engine",
  "llm-advisory": "LLM Advisory Service",
  ems: "EMS (Execution Management System)",
  oms: "OMS (Order Management System)",
  journal: "Journal Service",
  "market-sim": "Market Simulator",
  "fix-archive": "FIX Archive",
  "fix-gateway": "FIX Gateway",
  "kafka-relay": "Kafka Relay",
  "news-aggregator": "News Aggregator",
  "dark-pool": "Dark Pool",
  "ccp-service": "CCP Service",
  "rfq-service": "RFQ Service",
  "product-service": "Product Service",
  replay: "Replay Service",
  "risk-engine": "Risk Engine",
};

interface Endpoint {
  path: string;
  method: string;
  description: string;
  service?: string;
  requiresAuth: boolean;
}

interface ParseState {
  path: string;
  method: string;
  description: string;
  service: string;
  requiresAuth: boolean;
}

const emptyState = (): ParseState => ({
  path: "",
  method: "",
  description: "",
  service: "",
  requiresAuth: false,
});

const isDescriptionComment = (line: string): boolean =>
  line.startsWith("//") &&
  !line.includes("function") &&
  !line.includes("if (path") &&
  !line.includes("return null");

const applyLine = (state: ParseState, rawLine: string): ParseState => {
  const line = rawLine.trim();
  const next = { ...state };

  const path = line.match(/path\s*===\s*"([^"]+)"/);
  if (path) next.path = path[1];

  const method = line.match(/req\.method\s*===\s*"([^"]+)"/);
  if (method) next.method = method[1];

  const service = line.match(/ctx\.urls\.([a-zA-Z0-9_-]+)/);
  if (service) next.service = service[1];

  if (/await ctx\.requireAuth\(req\)/.test(line)) next.requiresAuth = true;

  if (isDescriptionComment(line)) {
    const comment = line.substring(2).trim();
    if (comment) next.description = comment;
  }

  return next;
};

const toEndpoint = (state: ParseState): Endpoint => ({
  path: state.path,
  method: state.method,
  description: state.description || `Endpoint for ${state.path}`,
  service: SERVICE_MAPPINGS[state.service],
  requiresAuth: state.requiresAuth,
});

const parseEndpoints = (content: string): Endpoint[] => {
  const endpoints: Endpoint[] = [];
  let state = emptyState();
  for (const line of content.split("\n")) {
    state = applyLine(state, line);
    if (state.path && state.method) {
      endpoints.push(toEndpoint(state));
      state = emptyState();
    }
  }
  return endpoints;
};

const extractEndpointsFromRoute = async (routeFile: string): Promise<Endpoint[]> => {
  try {
    return parseEndpoints(await Deno.readTextFile(routeFile));
  } catch (error) {
    console.error(`Error reading ${routeFile}:`, error);
    return [];
  }
};

const extractAllEndpoints = async (): Promise<Endpoint[]> => {
  const endpoints: Endpoint[] = [];
  try {
    for await (const file of Deno.readDir(ROUTES_DIR)) {
      if (file.isFile && file.name.endsWith(".ts")) {
        endpoints.push(...(await extractEndpointsFromRoute(join(ROUTES_DIR, file.name))));
      }
    }
  } catch (error) {
    console.error("Error reading route files:", error);
  }
  return endpoints;
};

const groupByService = (endpoints: Endpoint[]): Record<string, Endpoint[]> => {
  const grouped: Record<string, Endpoint[]> = {};
  for (const endpoint of endpoints) {
    const service = endpoint.service ?? "General";
    if (!grouped[service]) {
      grouped[service] = [];
    }
    grouped[service].push(endpoint);
  }
  return grouped;
};

const authIcon = (requiresAuth: boolean): string => (requiresAuth ? "✅" : "❌");

const renderServiceSection = (service: string, endpoints: Endpoint[]): string => {
  const rows = endpoints
    .map((e) => `| ${e.method} | ${e.path} | ${e.description} | ${authIcon(e.requiresAuth)} |`)
    .join("\n");
  return `## ${service}\n\n| Method | Path | Description | Auth |\n|--------|------|-------------|------|\n${rows}\n`;
};

const renderSummary = (grouped: Record<string, Endpoint[]>): string => {
  const rows = Object.entries(grouped)
    .map(([service, endpoints]) => {
      const hasAuth = endpoints.some((e) => e.requiresAuth);
      return `| ${service} | ${endpoints.length} | ${authIcon(hasAuth)} |`;
    })
    .join("\n");
  return `## Summary\n\n| Service | Endpoints | Auth Required |\n|---------|-----------|---------------|\n${rows}\n`;
};

const renderDocument = (grouped: Record<string, Endpoint[]>): string => {
  const header =
    "# API Endpoints Documentation\n\nThis document describes all available API endpoints in the VETA system.\n\n";
  const sections = Object.entries(grouped)
    .map(([service, endpoints]) => renderServiceSection(service, endpoints))
    .join("\n");
  return `${header}${sections}\n${renderSummary(grouped)}`;
};

const generateDocumentation = async (): Promise<void> => {
  const grouped = groupByService(await extractAllEndpoints());
  await Deno.writeTextFile(OUTPUT_FILE, renderDocument(grouped));
  console.log(`Documentation generated successfully at ${OUTPUT_FILE}`);
};

await generateDocumentation();
