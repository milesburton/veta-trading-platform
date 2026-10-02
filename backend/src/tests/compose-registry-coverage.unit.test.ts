import { assertEquals } from "jsr:@std/assert@0.217";
import { SERVICE_REGISTRY } from "../../../shared/serviceRegistry.ts";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const COMPOSE_FILES = [
  "compose.yml",
  "compose.observability.yml",
  "observability/docker-compose.lgtm.yml",
];

function composeServiceNames(composeText: string): Set<string> {
  const afterHeader = composeText.slice(composeText.search(/^services:\n/m) + "services:\n".length);
  const end = afterHeader.search(/^[a-z]/m);
  const body = end === -1 ? afterHeader : afterHeader.slice(0, end);
  return new Set([...body.matchAll(/^ {2}([a-zA-Z0-9_-]+):\s*$/gm)].map((m) => m[1]));
}

Deno.test("[compose] every registry service has a compose service of the same name", () => {
  const defined = new Set(
    COMPOSE_FILES.flatMap((file) => [
      ...composeServiceNames(Deno.readTextFileSync(`${REPO_ROOT}${file}`)),
    ])
  );
  const missing = SERVICE_REGISTRY.map((s) => s.composeName).filter((name) => !defined.has(name));
  assertEquals(missing, []);
});
