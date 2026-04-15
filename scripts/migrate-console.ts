#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Bulk-migrate trivial console.log/warn/error calls in backend Deno files
 * to the new @veta/logger module.
 *
 * Strategy:
 *   - Parse source line-by-line with a narrow regex for single-line calls
 *   - Convert simple literal / template-string cases automatically
 *   - Mark multi-line / multi-arg calls with a // LOGGER_TODO comment for
 *     manual follow-up
 *   - Inject `import { logger } from "@veta/logger";` after the last
 *     existing import line (idempotent)
 *   - Drop the `[prefix]` convention — the logger picks up `service` from
 *     OTEL_SERVICE_NAME at runtime
 *
 * Usage:
 *   deno run -A scripts/migrate-console.ts <file> [<file> ...]
 *   deno run -A scripts/migrate-console.ts --dry <file>
 *
 * This is a one-shot helper deleted at the end of the migration PR.
 */

type Rewrite =
  | { kind: "auto"; oldLine: string; newLine: string }
  | { kind: "manual"; line: string; reason: string; lineNo: number };

const LEVEL_MAP: Record<string, "info" | "warn" | "error" | "debug"> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

const SINGLE_LITERAL = /^(\s*)console\.(log|info|warn|error|debug)\(\s*(['"`])([\s\S]*?)\3\s*\);?\s*$/;
const PREFIX = /^\[([a-zA-Z0-9_-]+)\]\s*(.*)$/;

function stripPrefix(msg: string): string {
  const m = PREFIX.exec(msg);
  return m ? m[2].trim() : msg;
}

function analyze(source: string): { rewrites: Rewrite[]; hasConsole: boolean } {
  const lines = source.split("\n");
  const rewrites: Rewrite[] = [];
  let hasConsole = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bconsole\.(log|info|warn|error|debug)\b/.test(line)) continue;
    hasConsole = true;

    const single = SINGLE_LITERAL.exec(line);
    if (single) {
      const [, indent, method, , rawMsg] = single;
      const level = LEVEL_MAP[method];
      const stripped = stripPrefix(rawMsg).replace(/`/g, "\\`");
      const newLine = `${indent}logger.${level}(\`${stripped}\`);`;
      rewrites.push({ kind: "auto", oldLine: line, newLine });
    } else {
      rewrites.push({
        kind: "manual",
        line,
        reason: "multi-arg or multi-line — requires manual ctx hoisting",
        lineNo: i + 1,
      });
    }
  }

  return { rewrites, hasConsole };
}

function ensureLoggerImport(source: string): string {
  if (/from\s+["']@veta\/logger["']/.test(source)) return source;
  const lines = source.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^import\s*["']/.test(lines[i])) {
      lastImportIdx = i;
    }
  }
  if (lastImportIdx < 0) return source;
  lines.splice(lastImportIdx + 1, 0, `import { logger } from "@veta/logger";`);
  return lines.join("\n");
}

function applyAutoRewrites(source: string, rewrites: Rewrite[]): string {
  let out = source;
  for (const r of rewrites) {
    if (r.kind !== "auto") continue;
    out = out.replace(r.oldLine, r.newLine);
  }
  return out;
}

async function migrate(file: string, dry: boolean): Promise<void> {
  const source = await Deno.readTextFile(file);
  const { rewrites, hasConsole } = analyze(source);
  if (!hasConsole) {
    console.warn(`[migrate] ${file}: no console calls found`);
    return;
  }

  const autos = rewrites.filter((r): r is Extract<Rewrite, { kind: "auto" }> => r.kind === "auto");
  const manuals = rewrites.filter((r): r is Extract<Rewrite, { kind: "manual" }> => r.kind === "manual");

  console.warn(
    `[migrate] ${file}: ${autos.length} auto, ${manuals.length} manual`,
  );
  for (const m of manuals) {
    console.warn(`  line ${m.lineNo}: ${m.line.trim()}`);
  }

  if (dry) return;

  let next = applyAutoRewrites(source, rewrites);
  next = ensureLoggerImport(next);
  if (next !== source) {
    await Deno.writeTextFile(file, next);
  }
}

async function main(): Promise<void> {
  const args = [...Deno.args];
  let dry = false;
  const dryIdx = args.indexOf("--dry");
  if (dryIdx >= 0) {
    dry = true;
    args.splice(dryIdx, 1);
  }
  if (args.length === 0) {
    console.error("usage: migrate-console.ts [--dry] <file> [<file> ...]");
    Deno.exit(2);
  }
  for (const file of args) {
    await migrate(file, dry);
  }
}

if (import.meta.main) {
  await main();
}
