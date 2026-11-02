import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const COMPOSE_PROD = readFileSync(new URL("../../../compose.prod.yml", import.meta.url), "utf8");

const PUBLIC_SERVICES: readonly string[] = ["fix-gateway", "frontend", "gateway"];

const SERVICE_HEADER = /^ {2}([a-z0-9-]+):\s*$/;
const TRAEFIK_ENABLED = /^\s*- "traefik\.enable=true"\s*$/;

const servicesServedByTraefik = (): string[] => {
  const lines = COMPOSE_PROD.split("\n");
  const servicesStart = lines.findIndex((line) => line === "services:");
  const owners = lines.slice(servicesStart + 1).reduce<{ current: string; enabled: string[] }>(
    (state, line) => {
      const header = line.match(SERVICE_HEADER)?.[1];
      if (header !== undefined) return { ...state, current: header };
      return TRAEFIK_ENABLED.test(line)
        ? { ...state, enabled: [...state.enabled, state.current] }
        : state;
    },
    { current: "", enabled: [] }
  );
  return [...new Set(owners.enabled)].sort();
};

test("[public-services] only the reviewed services are served by Traefik in production", () => {
  assertEquals(
    servicesServedByTraefik(),
    [...PUBLIC_SERVICES],
    "A service with traefik.enable=true is reachable from the internet. Route it through the gateway, which authenticates, or review it and add it to PUBLIC_SERVICES."
  );
});
