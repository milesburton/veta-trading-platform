import { assertEquals } from "jsr:@std/assert@0.217";

const CONF_PATH = new URL("../../../supervisord.conf", import.meta.url).pathname;

function readConf(): string {
  return Deno.readTextFileSync(CONF_PATH);
}

function programBlock(conf: string, program: string): string {
  const start = conf.indexOf(`[program:${program}]`);
  if (start === -1) throw new Error(`[program:${program}] not found`);
  const nextSection = conf.indexOf("\n[", start + 1);
  return conf.slice(start, nextSection === -1 ? undefined : nextSection);
}

function groupPrograms(conf: string, group: string): string[] {
  const match = conf.match(new RegExp(`\\[group:${group}\\]\\nprograms=([^\\n]+)`));
  if (!match) throw new Error(`[group:${group}] not found`);
  return match[1].split(",").map((p) => p.trim());
}

Deno.test("[supervisord.conf] every program is defined exactly once", () => {
  const conf = readConf();
  const names = [...conf.matchAll(/^\[program:([a-z0-9-]+)\]/gm)].map((m) => m[1]);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of names) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  assertEquals(duplicates, []);
});

Deno.test("[supervisord.conf] risk-engine and fix-exchange autostart and are not in any group", () => {
  const conf = readConf();
  for (const program of ["risk-engine", "fix-exchange"]) {
    const block = programBlock(conf, program);
    assertEquals(/autostart=true/.test(block), true, `${program} must autostart=true`);
    assertEquals(/autorestart=true/.test(block), true, `${program} must autorestart=true`);
  }

  for (const group of ["algos", "microstructure", "analytics", "aux"]) {
    const members = groupPrograms(conf, group);
    assertEquals(members.includes("risk-engine"), false, `risk-engine must not be in [group:${group}]`);
    assertEquals(members.includes("fix-exchange"), false, `fix-exchange must not be in [group:${group}]`);
  }
});

Deno.test("[supervisord.conf] the always-on core block matches the intended Tier 0 program set", () => {
  const conf = readConf();
  const allGroupMembers = new Set([
    ...groupPrograms(conf, "algos"),
    ...groupPrograms(conf, "microstructure"),
    ...groupPrograms(conf, "analytics"),
    ...groupPrograms(conf, "aux"),
  ]);
  const allNames = [...conf.matchAll(/^\[program:([a-z0-9-]+)\]/gm)].map((m) => m[1]);
  const ungrouped = allNames.filter((n) => !allGroupMembers.has(n));

  const expectedCore = new Set([
    "db-migrate",
    "redpanda",
    "market-sim",
    "journal",
    "user-service",
    "ems",
    "oms",
    "gateway",
    "frontend-proxy",
    "frontend",
    "risk-engine",
    "fix-exchange",
  ]);
  assertEquals(new Set(ungrouped), expectedCore);
});

Deno.test("[supervisord.conf] every idle-safe group member has autostart=false", () => {
  const conf = readConf();
  for (const group of ["algos", "microstructure", "analytics", "aux"]) {
    for (const program of groupPrograms(conf, group)) {
      const block = programBlock(conf, program);
      assertEquals(
        /autostart=false/.test(block),
        true,
        `${program} in [group:${group}] must have autostart=false`
      );
    }
  }
});
