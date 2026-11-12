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
  extra_hosts?: string[];
  environment?: Record<string, string>;
  entrypoint?: string[];
  depends_on?: Record<string, unknown> | string[];
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

const OVERLAYS = ["compose.observability.yml", "compose.loadgen.yml"].map(
  (file) => parse(read(file), { merge: true, maxAliasCount: -1 }) as ComposeFile
);
const LGTM = parse(read("observability/docker-compose.lgtm.yml"), {
  merge: true,
  maxAliasCount: -1,
}) as ComposeFile;

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
  assert(DEPLOY.includes('"${ENFORCE_INTERNAL_NETWORKS:-1}" == "1"'));
});

test("[deploy-networks] the allowlist grants the GitHub API host only, not the whole domain", () => {
  const registrableDomain = (entry: string): string => entry.split(".").slice(-2).join(".");
  assertEquals(
    ALLOWLIST.filter((entry) => registrableDomain(entry) === "github.com"),
    ["api.github.com"]
  );
});

test("[deploy-networks] no service relies on a route to the Docker host", () => {
  const reliant = [COMPOSE, ...OVERLAYS].flatMap((file) =>
    Object.entries(file.services)
      .filter(
        ([, service]) =>
          (service.extra_hosts ?? []).some((host) => host.includes("host-gateway")) ||
          Object.values(service.environment ?? {}).some((value) =>
            String(value).includes("host.docker.internal")
          )
      )
      .map(([name]) => name)
  );
  assertEquals(reliant, []);
});

test("[deploy-networks] the collector and Prometheus are reachable on trading-net", () => {
  assert(networksOf(LGTM.services.alloy).includes("veta_trading-net"));
  assert(networksOf(LGTM.services.prometheus).includes("veta_trading-net"));
});

test("[deploy-networks] every service given the proxy URL is on the proxied network", () => {
  const misplaced = Object.entries(COMPOSE.services)
    .filter(([, service]) => service.environment?.EGRESS_PROXY_URL !== undefined)
    .filter(([, service]) => !networksOf(service).includes("proxied-net"))
    .map(([name]) => name);
  assertEquals(misplaced, []);
});

test("[deploy-networks] Traefik is pinned to the network every routed service shares", () => {
  const expected = `${(COMPOSE as unknown as { name: string }).name}_trading-net`;
  const pinned = ["traefik.yml", "traefik.gate.yml"].map(
    (file) =>
      (parse(read(file)) as { providers: { docker: { network?: string } } }).providers.docker
        .network
  );
  assertEquals(pinned, [expected, expected]);
});

test("[deploy-networks] the model download shares no network with application services", () => {
  const pull = COMPOSE.services["ollama-model-pull"];
  assertEquals(networksOf(pull), [DIRECT_NETWORK]);
  assertEquals(networksOf(COMPOSE.services.ollama), ["trading-net"]);
  assertEquals(pull.environment?.OLLAMA_HOST, undefined);
  assertEquals(pull.depends_on, undefined);
});

test("[deploy-networks] the model download skips the registry when the model is present", () => {
  const script = (COMPOSE.services["ollama-model-pull"].entrypoint ?? []).join(" ");
  assert(script.includes("ollama serve"));
  assert(script.includes('ollama list | grep -q "^qwen2.5:3b" || ollama pull qwen2.5:3b'));
});

test("[deploy-networks] every service Traefik routes to is on trading-net", () => {
  const unreachable = Object.entries(COMPOSE.services)
    .filter(([, service]) =>
      ((service as { labels?: string[] }).labels ?? []).includes("traefik.enable=true")
    )
    .filter(([, service]) => !networksOf(service).includes("trading-net"))
    .map(([name]) => name);
  assertEquals(unreachable, []);
});
