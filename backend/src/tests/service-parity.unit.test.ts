import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { SERVICE_REGISTRY, type ServiceSpec } from "../../../shared/serviceRegistry.ts";

const COMPOSE_TEXT = readFileSync(new URL("../../../compose.yml", import.meta.url), "utf8");
const SUPERVISORD_TEXT = readFileSync(
  new URL("../../../supervisord.conf", import.meta.url),
  "utf8"
);

const HEALTH_PORT_OVERRIDES: Readonly<Record<string, number>> = { fixExchange: 9_879 };

const COMPOSE_BLOCKS: ReadonlyMap<string, string> = new Map(
  [
    ...COMPOSE_TEXT.matchAll(
      /^ {2}([a-z0-9-]+):\n([\s\S]*?)(?=^ {2}[a-z0-9-]+:\n|^[a-z]|$(?![\s\S]))/gm
    ),
  ].map((match) => [match[1] ?? "", match[2] ?? ""])
);

const SUPERVISORD_COMMANDS: ReadonlyMap<string, string> = new Map(
  [...SUPERVISORD_TEXT.matchAll(/^\[program:([a-z0-9-]+)\]\ncommand=(.*)$/gm)].map((match) => [
    match[1] ?? "",
    match[2] ?? "",
  ])
);

interface NodeService {
  readonly spec: ServiceSpec;
  readonly script: string;
  readonly block: string;
}

const NODE_SERVICES: readonly NodeService[] = SERVICE_REGISTRY.flatMap((spec) => {
  const block = COMPOSE_BLOCKS.get(spec.composeName);
  const script = block?.match(/"\/app\/([^"]+\.ts)"/)?.[1];
  return block === undefined || script === undefined ? [] : [{ spec, script, block }];
});

const programFor = (spec: ServiceSpec): string => spec.supervisorProgram ?? spec.composeName;

test("[parity] the registry finds the node services in compose.yml", () => {
  assertEquals(NODE_SERVICES.length > 30, true);
});

test("[parity] compose and supervisord launch the same entry script for every node service", () => {
  const mismatches = NODE_SERVICES.filter(
    ({ spec, script }) => !(SUPERVISORD_COMMANDS.get(programFor(spec)) ?? "").includes(script)
  ).map(({ spec, script }) => `${spec.id}: ${script} is not run by [program:${programFor(spec)}]`);
  assertEquals(mismatches, []);
});

test("[parity] the registry port matches the compose healthcheck port for every node service", () => {
  const mismatches = NODE_SERVICES.flatMap(({ spec, block }) => {
    const healthPort = Number(block.match(/localhost:(\d+)\//)?.[1]);
    const expected = HEALTH_PORT_OVERRIDES[spec.id] ?? spec.defaultPort;
    return healthPort === expected
      ? []
      : [`${spec.id}: compose healthcheck uses ${healthPort}, registry expects ${expected}`];
  });
  assertEquals(mismatches, []);
});

test("[parity] every health port override names a registry service", () => {
  const known = new Set(SERVICE_REGISTRY.map((spec) => spec.id));
  assertEquals(
    Object.keys(HEALTH_PORT_OVERRIDES).filter((id) => !known.has(id)),
    []
  );
});
