import { readdirSync, readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

const DEPLOY = read("scripts/homelab-deploy.sh");
const COMPOSE_FILES = [
  "compose.yml",
  "compose.prod.yml",
  "compose.observability.yml",
  "compose.loadgen.yml",
  "compose.loadtest.yml",
];

const syncedPaths = (): string[] => {
  const block = DEPLOY.match(/CONFIG_PATHS=\(([\s\S]*?)\n\)/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

const isSynced = (path: string, synced: readonly string[]): boolean =>
  synced.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

const scriptBindMounts = (): string[] =>
  COMPOSE_FILES.flatMap((file) =>
    [...read(file).matchAll(/^\s*- \.\/(scripts\/[^:\s]+):/gm)].map((m) => m[1])
  );

test("[deploy-sync] every script bind-mounted by compose is synced to the host", () => {
  const synced = syncedPaths();
  assertEquals(
    [...new Set(scriptBindMounts())].filter((path) => !isSynced(path, synced)),
    []
  );
});

test("[deploy-sync] every script a homelab systemd unit executes under the stack directory is synced", () => {
  const units = readdirSync(new URL("../../../scripts/homelab-systemd/", import.meta.url)).filter(
    (name) => name.endsWith(".service")
  );
  const executed = units.flatMap((unit) =>
    [
      ...read(`scripts/homelab-systemd/${unit}`).matchAll(
        /^ExecStart=\/opt\/stacks\/veta\/(scripts\/\S+)/gm
      ),
    ].map((m) => m[1])
  );
  const synced = syncedPaths();
  assertEquals(
    executed.filter((path) => !isSynced(path, synced)),
    []
  );
});
