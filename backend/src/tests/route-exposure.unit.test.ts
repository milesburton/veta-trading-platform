import { readFileSync, writeFileSync } from "node:fs";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const COMPOSE_PROD = readFileSync(new URL("../../../compose.prod.yml", import.meta.url), "utf8");
const ROLE_MATRIX = JSON.parse(
  readFileSync(new URL("./fixtures/gateway-role-matrix.json", import.meta.url), "utf8")
) as { proxy: Record<string, "all" | string[]> };
const DOC_URL = new URL(
  "../../../docs/site/src/content/docs/reference/route-exposure.md",
  import.meta.url
);

const REGENERATE = process.env.UPDATE_ROUTE_EXPOSURE === "1";
const START = "<!-- route-exposure:start -->";
const END = "<!-- route-exposure:end -->";
const MIN_ROUTERS = 30;

interface Router {
  readonly name: string;
  readonly rule: string;
  readonly entrypoint: string;
  readonly service: string;
  readonly enabled: boolean;
}

const SERVICE_BLOCKS: ReadonlyMap<string, string> = new Map(
  [
    ...COMPOSE_PROD.matchAll(
      /^ {2}([a-z0-9-]+):\n([\s\S]*?)(?=^ {2}[a-z0-9-]+:\n|^[a-z]|$(?![\s\S]))/gm
    ),
  ].map((match) => [match[1] ?? "", match[2] ?? ""])
);

const routerAttribute = (block: string, name: string, attribute: string): string =>
  block.match(new RegExp(`traefik\\.http\\.routers\\.${name}\\.${attribute}=([^"]+)"`))?.[1] ?? "";

const ROUTERS: readonly Router[] = [...SERVICE_BLOCKS].flatMap(([service, block]) =>
  [...new Set([...block.matchAll(/traefik\.http\.routers\.([a-z0-9-]+)\.rule=/g)].map((m) => m[1]))]
    .filter((name): name is string => name !== undefined)
    .map((name) => ({
      name,
      rule: routerAttribute(block, name, "rule").replaceAll("`", "'"),
      entrypoint: routerAttribute(block, name, "entrypoints"),
      service,
      enabled: block.includes("traefik.enable=true"),
    }))
);

const isPublic = (router: Router): boolean => router.enabled && router.entrypoint === "websecure";

const escapeCell = (text: string): string => text.replaceAll("|", "\\|");

const roles = (access: "all" | string[] | undefined): string =>
  access === undefined ? "not proxied" : access === "all" ? "all roles" : access.join(", ");

const row = (cells: readonly string[]): string => `| ${cells.map(escapeCell).join(" | ")} |`;

const table = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  [row(header), row(header.map(() => "---")), ...rows.map(row)].join("\n");

function generate(): string {
  const exposed = ROUTERS.filter(isPublic);
  const internal = ROUTERS.filter((r) => !isPublic(r));
  return [
    "### Public routers",
    "",
    table(
      ["Router", "Rule", "Container"],
      exposed.map((r) => [r.name, `\`${r.rule}\``, r.service])
    ),
    "",
    "### Internal routers (not served by Traefik)",
    "",
    table(
      ["Router", "Rule", "Container", "Minimum roles through the gateway proxy"],
      internal.map((r) => [
        r.name,
        `\`${r.rule}\``,
        r.service,
        roles(ROLE_MATRIX.proxy[r.service] ?? ROLE_MATRIX.proxy[r.name]),
      ])
    ),
  ].join("\n");
}

const embed = (doc: string, body: string): string =>
  `${doc.slice(0, doc.indexOf(START) + START.length)}\n\n${body}\n\n${doc.slice(doc.indexOf(END))}`;

test("[exposure] the router inventory is found in compose.prod.yml", () => {
  assertEquals(ROUTERS.length >= MIN_ROUTERS, true);
  assertEquals(
    ROUTERS.filter((r) => r.rule === "" || r.entrypoint === "").map((r) => r.name),
    []
  );
});

test("[exposure] a router served by Traefik is on the TLS entrypoint", () => {
  assertEquals(
    ROUTERS.filter((r) => r.enabled && r.entrypoint !== "websecure").map(
      (r) => `${r.name}: ${r.entrypoint}`
    ),
    []
  );
});

test("[exposure] the route exposure page matches compose.prod.yml and the role matrix", () => {
  const current = readFileSync(DOC_URL, "utf8");
  const expected = embed(current, generate());
  if (REGENERATE) writeFileSync(DOC_URL, expected);
  assertEquals(
    current === expected || REGENERATE,
    true,
    "reference/route-exposure.md is stale; regenerate with UPDATE_ROUTE_EXPOSURE=1"
  );
});
