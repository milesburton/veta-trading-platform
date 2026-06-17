#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Scaffolds a new dashboard panel.
 *
 * Automates the deterministic steps of the add-dashboard-panel playbook:
 * creates the component and its test, and patches every PanelId-keyed map in
 * panelRegistry.ts plus the registerPanel call in panelComponents.ts. The one
 * step it does not automate is placing the panel into a workspace layout
 * (layoutModels.ts), which is a design choice rather than boilerplate.
 *
 * Usage:
 *   deno run -A frontend/scripts/new-panel.ts <panel-id> "<Title>" [--desc "..."]
 *   deno task new:panel <panel-id> "<Title>"
 *
 * Re-running with the same id is a no-op (idempotent), so it is safe to retry.
 */

const ROOT = new URL("../", import.meta.url).pathname;
const REGISTRY = `${ROOT}src/components/dashboard/panelRegistry.ts`;
const COMPONENTS = `${ROOT}src/components/dashboard/panelComponents.ts`;
const PICKER = `${ROOT}src/components/ComponentPicker.tsx`;

interface Args {
  id: string;
  title: string;
  description: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let description = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--desc") {
      description = argv[++i] ?? "";
    } else {
      positional.push(argv[i]);
    }
  }
  const [id, title] = positional;
  if (!id || !title) {
    console.error('Usage: deno task new:panel <panel-id> "<Title>" [--desc "<description>"]');
    Deno.exit(1);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error(`Panel id must be kebab-case (got: ${id})`);
    Deno.exit(1);
  }
  return { id, title, description: description || title };
}

function pascalCase(id: string): string {
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function componentName(id: string): string {
  const base = pascalCase(id);
  return base.endsWith("Panel") ? base : `${base}Panel`;
}

function insertBefore(source: string, marker: string, line: string): string {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Could not find anchor: ${marker}`);
  return source.slice(0, idx) + line + source.slice(idx);
}

function patchRegistry(src: string, a: Args): string {
  if (src.includes(`"${a.id}"`)) {
    console.log(`  panelRegistry.ts already has "${a.id}" — skipping`);
    return src;
  }
  const title = a.title.replace(/"/g, '\\"');
  const desc = a.description.replace(/"/g, '\\"');

  let out = src;
  out = insertBefore(out, "] as const;", `  "${a.id}",\n`);
  out = out.replace(
    /(export const PANEL_TITLES: Record<PanelId, string> = \{\n)/,
    `$1  "${a.id}": "${title}",\n`
  );
  out = out.replace(
    /(export const PANEL_DESCRIPTIONS: Record<PanelId, string> = \{\n)/,
    `$1  "${a.id}": "${desc}",\n`
  );
  out = out.replace(
    /(export const PANEL_CHANNEL_CAPS: Record<PanelId, \{ out: boolean; in: boolean \}> = \{\n)/,
    `$1  "${a.id}": { out: false, in: false },\n`
  );
  out = out.replace(
    /(export const PANEL_PERMISSIONS: Record<PanelId, ReadonlySet<AuthRole>> = \{\n)/,
    `$1  "${a.id}": new Set<AuthRole>(ALL_READ_ROLES),\n`
  );
  return out;
}

function patchPicker(src: string, a: Args): string {
  if (src.includes(`"${a.id}"`)) {
    console.log(`  ComponentPicker.tsx already has "${a.id}" — skipping`);
    return src;
  }
  const desc = a.description.replace(/"/g, '\\"');
  return src.replace(
    /(const PANEL_DESCRIPTIONS: Record<PanelId, string> = \{\n)/,
    `$1  "${a.id}": "${desc}",\n`
  );
}

function patchComponents(src: string, a: Args): string {
  const name = componentName(a.id);
  if (src.includes(`registerPanel("${a.id}"`)) {
    console.log(`  panelComponents.ts already registers "${a.id}" — skipping`);
    return src;
  }
  const importLine = `import { ${name} } from "@veta/frontend/components/${name}.tsx";\n`;
  const lastImport = src.lastIndexOf('} from "@veta/frontend/components/');
  const importEnd = src.indexOf("\n", lastImport) + 1;
  const withImport = src.slice(0, importEnd) + importLine + src.slice(importEnd);

  return `${withImport.trimEnd()}\nregisterPanel("${a.id}", ${name});\n`;
}

function componentTemplate(a: Args): string {
  const name = componentName(a.id);
  return `import { useSignal } from "@preact/signals-react";

export function ${name}() {
  const ready = useSignal(true);

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          ${a.title}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {ready.value ? (
          <p className="text-muted">${a.description}</p>
        ) : (
          <div className="flex h-full items-center justify-center text-divider text-[11px]">
            No data yet
          </div>
        )}
      </div>
    </div>
  );
}
`;
}

function testTemplate(a: Args): string {
  const name = componentName(a.id);
  return `import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ${name} } from "@veta/frontend/components/${name}";

describe("${name}", () => {
  it("renders the panel header", () => {
    render(<${name} />);
    expect(screen.getByText("${a.title}")).toBeInTheDocument();
  });

  it("renders its placeholder content", () => {
    render(<${name} />);
    expect(screen.getByText("${a.description}")).toBeInTheDocument();
  });
});
`;
}

async function writeIfAbsent(path: string, contents: string): Promise<void> {
  try {
    await Deno.stat(path);
    console.log(`  ${path.replace(ROOT, "")} already exists — skipping`);
  } catch {
    await Deno.writeTextFile(path, contents);
    console.log(`  created ${path.replace(ROOT, "")}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args);
  const name = componentName(args.id);

  console.log(`Scaffolding panel "${args.id}" (${name})`);

  await writeIfAbsent(`${ROOT}src/components/${name}.tsx`, componentTemplate(args));
  await writeIfAbsent(`${ROOT}src/components/__tests__/${name}.test.tsx`, testTemplate(args));

  const registry = await Deno.readTextFile(REGISTRY);
  await Deno.writeTextFile(REGISTRY, patchRegistry(registry, args));
  console.log("  patched panelRegistry.ts");

  const components = await Deno.readTextFile(COMPONENTS);
  await Deno.writeTextFile(COMPONENTS, patchComponents(components, args));
  console.log("  patched panelComponents.ts");

  const picker = await Deno.readTextFile(PICKER);
  await Deno.writeTextFile(PICKER, patchPicker(picker, args));
  console.log("  patched ComponentPicker.tsx");

  console.log("\nNext steps (not automated — these are design choices):");
  console.log(`  1. Add "${args.id}" to a workspace in src/components/dashboard/layoutModels.ts`);
  console.log(`  2. Flesh out src/components/${name}.tsx`);
  console.log(
    `  3. Run: npx biome check --write src/components/${name}.tsx src/components/dashboard`
  );
  console.log(`  4. Test: npx vitest run src/components/__tests__/${name}.test.tsx`);
}

if (import.meta.main) {
  await main();
}
