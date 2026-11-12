import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

interface Service {
  image: string;
  ports?: string[];
  volumes?: string[];
  networks?: string[];
  environment?: Record<string, string>;
  labels?: string[];
}

interface Project {
  services: Record<string, Service>;
  networks: Record<string, { internal?: boolean; external?: boolean }>;
}

const PROJECT = parse(read("deploy/authentik/compose.yml"), { merge: true }) as Project;
const BLUEPRINT = read("deploy/authentik/blueprints/veta.yaml");
const DEPLOY = read("scripts/homelab-deploy.sh");
const { server, worker, postgresql } = PROJECT.services;

test("[authentik] the image is pinned to one release for server and worker", () => {
  assert(/^ghcr\.io\/goauthentik\/server:\d{4}\.\d+\.\d+$/.test(server.image));
  assertEquals(worker.image, server.image);
});

test("[authentik] nothing is published on the host and the Docker socket is not mounted", () => {
  const services = Object.values(PROJECT.services);
  assertEquals(
    services.flatMap((service) => service.ports ?? []),
    []
  );
  assertEquals(
    services.flatMap((service) => service.volumes ?? []).filter((v) => v.includes("docker.sock")),
    []
  );
});

test("[authentik] only the server joins trading-net and the project network is internal", () => {
  assertEquals(PROJECT.networks["authentik-net"].internal, true);
  assertEquals(PROJECT.networks["veta_trading-net"].external, true);
  assertEquals(server.networks, ["authentik-net", "veta_trading-net"]);
  assertEquals(worker.networks, ["authentik-net"]);
  assertEquals(postgresql.networks, ["authentik-net"]);
});

test("[authentik] outbound calls are disabled and the path prefix matches the router", () => {
  assertEquals(server.environment?.AUTHENTIK_DISABLE_UPDATE_CHECK, "true");
  assertEquals(server.environment?.AUTHENTIK_ERROR_REPORTING__ENABLED, "false");
  assertEquals(server.environment?.AUTHENTIK_WEB__PATH, "/sso/");
  assert((server.labels ?? []).some((label) => label.endsWith("rule=PathPrefix(`/sso`)")));
});

test("[authentik] secrets have no defaults", () => {
  const raw = read("deploy/authentik/compose.yml");
  for (const name of [
    "AUTHENTIK_SECRET_KEY",
    "AUTHENTIK_PG_PASSWORD",
    "AUTHENTIK_BOOTSTRAP_PASSWORD_HASH",
    "VETA_OIDC_CLIENT_SECRET",
  ]) {
    assert(raw.includes(`\${${name}:?`), `${name} must be required`);
    assertEquals(raw.includes(`\${${name}:-`), false);
  }
});

test("[authentik] the blueprint enforces a second factor and a strict redirect", () => {
  assert(BLUEPRINT.includes("not_configured_action: configure"));
  assert(BLUEPRINT.includes("last_auth_threshold: seconds=0"));
  assert(BLUEPRINT.includes("matching_mode: strict"));
  assertEquals(BLUEPRINT.includes("matching_mode: regex"), false);
  assert(BLUEPRINT.includes("client_type: confidential"));
  assert(BLUEPRINT.includes("client_secret: !Env VETA_OIDC_CLIENT_SECRET"));
});

test("[authentik] the deploy syncs the project and starts it only when its secrets exist", () => {
  assert(DEPLOY.includes('"deploy/authentik/"'));
  assert(DEPLOY.includes("openbao_export_if_present authentik"));
  assert(DEPLOY.includes('[[ -n "${AUTHENTIK_SECRET_KEY:-}" ]] || exit 3'));
});
