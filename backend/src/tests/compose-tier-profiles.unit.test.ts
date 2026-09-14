import { assertEquals } from "jsr:@std/assert@0.217";
import { SERVICE_REGISTRY } from "../../../shared/serviceRegistry.ts";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const COMPOSE_PATH = `${REPO_ROOT}compose.yml`;

interface ServiceBlock {
  name: string;
  profiles: string[];
}

function parseServiceProfiles(composeText: string): Map<string, string[]> {
  const serviceStart = composeText.indexOf("\n  redpanda:\n");
  const section = composeText.slice(serviceStart);
  const blockPattern = /^  ([a-zA-Z0-9_-]+):\n((?:(?!^  [a-zA-Z0-9_-]+:\n)[\s\S])*)/gm;
  const result = new Map<string, string[]>();
  for (const m of section.matchAll(blockPattern)) {
    const name = m[1];
    const body = m[2];
    const profMatch = body.match(/profiles:\s*\[([^\]]*)\]/);
    const profiles = profMatch
      ? profMatch[1]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    result.set(name, profiles);
  }
  return result;
}

function readServiceBlocks(): Map<string, string[]> {
  const composeText = Deno.readTextFileSync(COMPOSE_PATH);
  return parseServiceProfiles(composeText);
}

Deno.test("[compose] every Tier 0 registry service has no profiles key (always starts)", () => {
  const blocks = readServiceBlocks();
  const offenders: string[] = [];
  for (const svc of SERVICE_REGISTRY) {
    if (svc.tier !== 0) continue;
    const profiles = blocks.get(svc.composeName);
    if (profiles === undefined) continue; // not a compose.yml service (e.g. postgres-health has its own block name)
    if (profiles.length > 0) {
      offenders.push(`${svc.composeName} (profiles: [${profiles.join(", ")}])`);
    }
  }
  assertEquals(
    offenders,
    [],
    `Tier 0 services must have no profiles key so they always start: ${offenders.join(", ")}`
  );
});

Deno.test("[compose] every Tier 1/2/3 registry service carries the on-demand profile", () => {
  const blocks = readServiceBlocks();
  const offenders: string[] = [];
  for (const svc of SERVICE_REGISTRY) {
    if (svc.tier === 0) continue;
    const profiles = blocks.get(svc.composeName);
    if (profiles === undefined) continue;
    if (!profiles.includes("on-demand")) {
      offenders.push(`${svc.composeName} (profiles: [${profiles.join(", ")}])`);
    }
  }
  assertEquals(
    offenders,
    [],
    `On-demand (tier >= 1) services must carry profiles: [..., on-demand]: ${offenders.join(", ")}`
  );
});

Deno.test("[compose] the 8 synthetic traders are gated behind on-demand, not started by default", () => {
  const blocks = readServiceBlocks();
  const synthetic = [...blocks.entries()].filter(([name]) =>
    name.startsWith("synthetic-trader-")
  );
  assertEquals(synthetic.length, 8, "expected exactly 8 synthetic-trader-* compose blocks");
  for (const [name, profiles] of synthetic) {
    assertEquals(
      profiles.includes("on-demand"),
      true,
      `${name} must be gated behind the on-demand profile, not started by default`
    );
  }
});

Deno.test("[compose] risk-engine and fix-exchange have no profiles key (Tier 0, always-on)", () => {
  const blocks = readServiceBlocks();
  for (const name of ["risk-engine", "fix-exchange"]) {
    const profiles = blocks.get(name);
    assertEquals(profiles, [], `${name} must have no profiles key`);
  }
});
