import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

interface ComposeNetwork {
  internal?: boolean;
}

interface ComposeService {
  networks?: string[] | Record<string, unknown>;
}

interface ComposeFile {
  networks: Record<string, ComposeNetwork>;
  services: Record<string, ComposeService>;
}

const COMPOSE = parse(read("compose.yml"), { merge: true, maxAliasCount: -1 }) as ComposeFile;
const DEPLOY = read("scripts/homelab-deploy.sh");
const ALLOWLIST = read("docker/egress-proxy/allowlist.txt")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const DIRECT_NETWORK = "internet-net";
const DIRECT_EGRESS_SERVICES = ["egress-proxy", "ollama-model-pull", "traefik"];

const networksOf = (service: ComposeService): string[] =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});

test("[deploy-networks] every network except the direct one is internal", () => {
  const routable = Object.entries(COMPOSE.networks)
    .filter(([, network]) => network.internal !== true)
    .map(([name]) => name);
  assertEquals(routable, [DIRECT_NETWORK]);
});

test("[deploy-networks] only the recorded exceptions join the direct network", () => {
  const direct = Object.entries(COMPOSE.services)
    .filter(([, service]) => networksOf(service).includes(DIRECT_NETWORK))
    .map(([name]) => name)
    .toSorted();
  assertEquals(direct, DIRECT_EGRESS_SERVICES);
});

test("[deploy-networks] the retired non-internal egress-net name is not reused", () => {
  assertEquals(Object.keys(COMPOSE.networks).includes("egress-net"), false);
});

test("[deploy-networks] the deploy script compares declared internal networks with Docker", () => {
  assert(DEPLOY.includes("docker network inspect --format '{{.Internal}}'"));
  assert(DEPLOY.includes("networks declared internal that Docker does not isolate"));
  assert(DEPLOY.includes("ENFORCE_INTERNAL_NETWORKS"));
});

test("[deploy-networks] the allowlist grants the GitHub API host only, not the whole domain", () => {
  assert(ALLOWLIST.includes("api.github.com"));
  assertEquals(
    ALLOWLIST.filter((entry) => entry.endsWith("github.com") && entry !== "api.github.com"),
    []
  );
});
