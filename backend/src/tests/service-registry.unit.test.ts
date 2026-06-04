// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { gatewayHostEnvBlock, SERVICE_REGISTRY } from "../../../shared/serviceRegistry.ts";

const COMPOSE_PATH = new URL("../../../compose.yml", import.meta.url).pathname;

function extractGatewayHostBlock(composeText: string): string {
  const lines = composeText.split("\n");
  let gatewayStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "  gateway:") {
      gatewayStart = i;
      break;
    }
  }
  if (gatewayStart === -1) throw new Error("gateway: not found in compose.yml");
  let nextServiceStart = lines.length;
  for (let i = gatewayStart + 1; i < lines.length; i++) {
    if (/^[ ]{2}[a-z][a-z0-9-]+:$/.test(lines[i])) {
      nextServiceStart = i;
      break;
    }
  }
  const out: string[] = [];
  let started = false;
  for (let i = gatewayStart + 1; i < nextServiceStart; i++) {
    const isHostLine = /^[ ]{6}[A-Z_]+_HOST: /.test(lines[i]);
    const isPortLine = /^[ ]{6}[A-Z_]+_PORT: /.test(lines[i]);
    if (!started) {
      if (isHostLine) {
        started = true;
        out.push(lines[i]);
      }
    } else {
      if (isHostLine || isPortLine) out.push(lines[i]);
      else break;
    }
  }
  return out.join("\n");
}

Deno.test("[registry] gateway HOST env block in compose.yml matches generated output", () => {
  const composeText = Deno.readTextFileSync(COMPOSE_PATH);
  const actual = extractGatewayHostBlock(composeText);
  const expected = gatewayHostEnvBlock();
  if (actual !== expected) {
    throw new Error(
      `Gateway HOST env block in compose.yml has drifted from shared/serviceRegistry.ts.\n\n` +
        `If you added or renamed a service, regenerate the block:\n\n` +
        `  deno run --allow-read --allow-write scripts/generate-compose-host-env.ts\n\n` +
        `Got:\n${actual}\n\nExpected:\n${expected}`
    );
  }
});

Deno.test("[registry] SVC_PROXY in gateway.ts covers every registry composeName", () => {
  const gatewayPath = new URL("../gateway/gateway.ts", import.meta.url).pathname;
  const text = Deno.readTextFileSync(gatewayPath);
  const proxyStart = text.indexOf("SVC_PROXY: Record<string, string>");
  if (proxyStart === -1) throw new Error("SVC_PROXY not found in gateway.ts");
  const proxyEnd = text.indexOf("};", proxyStart);
  const block = text.slice(proxyStart, proxyEnd);
  const proxiedNames = new Set([...block.matchAll(/"([a-z][a-z0-9-]+)":\s+/g)].map((m) => m[1]));
  const missing: string[] = [];
  for (const svc of SERVICE_REGISTRY) {
    if (svc.excludeFromGatewayHostEnv) continue;
    if (!proxiedNames.has(svc.composeName)) missing.push(svc.composeName);
  }
  if (missing.length > 0) {
    throw new Error(
      `SVC_PROXY in gateway.ts is missing entries for: ${missing.join(", ")}.\n` +
        `Every service in shared/serviceRegistry.ts (except those with excludeFromGatewayHostEnv:true) ` +
        `must have a SVC_PROXY entry so /api/<service>/* routes to it.`
    );
  }
});

Deno.test("[registry] every service has a unique id, envPrefix, composeName, port", () => {
  const ids = new Set<string>();
  const envPrefixes = new Set<string>();
  const composeNames = new Set<string>();
  const ports = new Set<number>();
  for (const svc of SERVICE_REGISTRY) {
    if (ids.has(svc.id)) throw new Error(`Duplicate id: ${svc.id}`);
    if (envPrefixes.has(svc.envPrefix)) throw new Error(`Duplicate envPrefix: ${svc.envPrefix}`);
    if (composeNames.has(svc.composeName))
      throw new Error(`Duplicate composeName: ${svc.composeName}`);
    if (ports.has(svc.defaultPort)) throw new Error(`Duplicate port: ${svc.defaultPort}`);
    ids.add(svc.id);
    envPrefixes.add(svc.envPrefix);
    composeNames.add(svc.composeName);
    ports.add(svc.defaultPort);
  }
  assertEquals(ids.size, SERVICE_REGISTRY.length);
});
