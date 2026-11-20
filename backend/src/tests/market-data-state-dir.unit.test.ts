import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

test("[market-data image] creates the state directory owned by the runtime user before dropping root", () => {
  const dockerfile = readFileSync(join(REPO_ROOT, "docker/market-data/Dockerfile"), "utf8");
  const lines = dockerfile.split("\n").map((line) => line.trim());
  const mkdir = lines.findIndex(
    (l) => l.includes("mkdir -p /app/data") && l.includes("chown veta:veta /app/data")
  );
  const asRoot = lines.indexOf("USER root");
  const dropped = lines.lastIndexOf("USER veta:veta");
  assert(
    asRoot >= 0 && mkdir > asRoot && dropped > mkdir,
    "state directory must be created as root then chowned before USER veta"
  );
});

test("[market-data compose] the state volume is mounted where the service writes its files", () => {
  const compose = readFileSync(join(REPO_ROOT, "compose.yml"), "utf8");
  const start = compose.indexOf("\n  market-data:\n");
  const block = compose.slice(start, compose.indexOf("\n  healthcheck:", start));
  assert(block.includes("working_dir: /app/data"));
  assert(block.includes("market-data-state:/app/data"));
});
