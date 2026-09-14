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
  const proxiedNames = new Set(
    [...block.matchAll(/(?:"([a-z][a-z0-9-]+)"|([a-z][a-z0-9]*)):\s+/g)].map((m) => m[1] ?? m[2])
  );
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

Deno.test("[registry] every service has a valid tier", () => {
  for (const svc of SERVICE_REGISTRY) {
    if (![0, 1, 2, 3].includes(svc.tier)) {
      throw new Error(`${svc.id} has an invalid tier: ${svc.tier}`);
    }
  }
});

const EXPECTED_TIER_0_IDS = new Set([
  "marketSim",
  "ems",
  "oms",
  "userService",
  "journal",
  "riskEngine",
  "fixExchange",
  "postgresHealth",
  "redpanda",
]);

Deno.test("[registry] Tier 0 (always-on) is exactly the intended core set", () => {
  const actualTier0 = new Set(SERVICE_REGISTRY.filter((s) => s.tier === 0).map((s) => s.id));
  assertEquals(
    actualTier0,
    EXPECTED_TIER_0_IDS,
    "Tier 0 membership changed — if intentional, update EXPECTED_TIER_0_IDS in this test; " +
      "if not, a service was accidentally reclassified."
  );
});

Deno.test("[registry] Tier 0 services never carry an idleTimeoutSeconds", () => {
  for (const svc of SERVICE_REGISTRY) {
    if (svc.tier === 0 && svc.idleTimeoutSeconds !== undefined) {
      throw new Error(`${svc.id} is Tier 0 but has idleTimeoutSeconds set — Tier 0 never idles.`);
    }
  }
});

Deno.test("[registry] every supervisorProgram override names a real supervisord program", () => {
  const conf = Deno.readTextFileSync(
    new URL("../../../supervisord.conf", import.meta.url).pathname
  );
  const programs = new Set([...conf.matchAll(/^\[program:([a-z0-9-]+)\]/gm)].map((m) => m[1]));
  for (const svc of SERVICE_REGISTRY) {
    if (svc.supervisorProgram && !programs.has(svc.supervisorProgram)) {
      throw new Error(
        `${svc.id}.supervisorProgram = "${svc.supervisorProgram}" has no matching ` +
          `[program:${svc.supervisorProgram}] block in supervisord.conf`
      );
    }
  }
});

// ollama isn't a Deno process supervisord manages — it's its own container in
// compose.yml, with no dev-container wake path today.
const NOT_SUPERVISORD_MANAGED = new Set(["ollama"]);

Deno.test("[registry] a composeName with no supervisorProgram override matches a real supervisord program, for every tier >= 1 service", () => {
  const conf = Deno.readTextFileSync(
    new URL("../../../supervisord.conf", import.meta.url).pathname
  );
  const programs = new Set([...conf.matchAll(/^\[program:([a-z0-9-]+)\]/gm)].map((m) => m[1]));
  const missing: string[] = [];
  for (const svc of SERVICE_REGISTRY) {
    if (svc.tier === 0) continue;
    if (NOT_SUPERVISORD_MANAGED.has(svc.id)) continue;
    const program = svc.supervisorProgram ?? svc.composeName;
    if (!programs.has(program)) missing.push(`${svc.id} -> ${program}`);
  }
  assertEquals(
    missing,
    [],
    `On-demand services must resolve to a real supervisord program so the gateway/algo ` +
      `wake logic can start them: ${missing.join(", ")}`
  );
});
