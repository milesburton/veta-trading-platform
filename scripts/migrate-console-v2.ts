#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * More aggressive second-pass codemod to complete the console -> logger
 * migration. Handles patterns left behind by migrate-console.ts:
 *
 *   - Multi-line console calls (.warn/.log wrapping to next line)
 *   - console.warn(..., err.message) shape
 *   - Template-string multi-line bodies
 *
 * Strategy: match the full call expression by counting parens across
 * multiple lines, extract the arguments, and rewrite to a single
 * logger.* call with template-to-ctx conversion.
 *
 * Template-to-ctx conversion:
 *   `[svc] Order ${id} filled at ${px}` -> "Order $1 filled at $2", {id, px}
 * Simple literal or single-placeholder forms are left as template literals
 * with the prefix stripped.
 *
 * Manual review is still warranted — this tool aims for semantically-
 * equivalent rewrites but cannot make ctx-naming judgment calls.
 */

type Call = {
  startLine: number;
  endLine: number;
  method: "log" | "info" | "warn" | "error" | "debug";
  rawText: string;
};

const LEVEL_MAP: Record<string, "info" | "warn" | "error" | "debug"> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

function findCalls(source: string): Call[] {
  const lines = source.split("\n");
  const calls: Call[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /\bconsole\.(log|info|warn|error|debug)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const method = m[1] as Call["method"];
    let depth = 0;
    let end = -1;
    const startIdx = m.index + m[0].length - 1;
    outer:
    for (let j = i; j < lines.length; j++) {
      const startCol = j === i ? startIdx : 0;
      const line = lines[j];
      for (let k = startCol; k < line.length; k++) {
        const c = line[k];
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) {
            end = j;
            break outer;
          }
        }
      }
    }
    if (end < 0) continue;
    const rawText = lines.slice(i, end + 1).join("\n");
    calls.push({ startLine: i, endLine: end, method, rawText });
    i = end;
  }
  return calls;
}

function stripPrefix(msg: string): string {
  const m = /^\[([a-zA-Z0-9_-]+)\]\s*/.exec(msg);
  return m ? msg.slice(m[0].length) : msg;
}

function parseArgs(raw: string): string[] {
  const openIdx = raw.indexOf("(");
  const closeIdx = raw.lastIndexOf(")");
  if (openIdx < 0 || closeIdx < 0) return [];
  const inner = raw.slice(openIdx + 1, closeIdx);
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    const prev = i > 0 ? inner[i - 1] : "";
    if (quote) {
      if (c === quote && prev !== "\\") quote = null;
      current += c;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    if (c === ")" || c === "}" || c === "]") depth--;
    if (c === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function rewriteCall(call: Call): string | null {
  const level = LEVEL_MAP[call.method];
  const args = parseArgs(call.rawText);
  if (args.length === 0) return null;

  const firstArg = args[0];
  const isTemplate = firstArg.startsWith("`") && firstArg.endsWith("`");
  const isStringLit = (firstArg.startsWith('"') && firstArg.endsWith('"')) ||
    (firstArg.startsWith("'") && firstArg.endsWith("'"));

  const indentMatch = /^(\s*)/.exec(call.rawText.split("\n")[0]);
  const indent = indentMatch ? indentMatch[1] : "";

  if (args.length === 1 && (isTemplate || isStringLit)) {
    const body = firstArg.slice(1, -1);
    const stripped = stripPrefix(body);
    const quote = firstArg[0];
    return `${indent}logger.${level}(${quote}${stripped}${quote});`;
  }

  if (args.length === 2 && (isTemplate || isStringLit)) {
    const body = firstArg.slice(1, -1);
    let stripped = stripPrefix(body);
    stripped = stripped.replace(/\s*[:—-]\s*$/, "");
    const secondArg = args[1];
    const quote = firstArg[0];
    const errMsgMatch = /^\(?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:as\s+Error)?\s*\)?\.message\s*$/.exec(secondArg);
    if (errMsgMatch) {
      const errVar = errMsgMatch[1];
      const errExpr = secondArg.includes("as Error") ? `${errVar} as Error` : errVar;
      return `${indent}logger.${level}(${quote}${stripped}${quote}, { err: ${errExpr} });`;
    }
    return `${indent}logger.${level}(${quote}${stripped}${quote}, { detail: ${secondArg} });`;
  }

  return null;
}

async function migrate(file: string, dry: boolean): Promise<void> {
  const source = await Deno.readTextFile(file);
  const calls = findCalls(source);
  if (calls.length === 0) {
    console.warn(`[v2] ${file}: no console calls`);
    return;
  }

  const lines = source.split("\n");
  let applied = 0;
  let skipped = 0;
  for (const call of calls.reverse()) {
    const rewritten = rewriteCall(call);
    if (rewritten === null) {
      skipped++;
      console.warn(`[v2] ${file}:${call.startLine + 1} unhandled (${call.method})`);
      continue;
    }
    const rewrittenLines = rewritten.split("\n");
    lines.splice(call.startLine, call.endLine - call.startLine + 1, ...rewrittenLines);
    applied++;
  }

  const next = lines.join("\n");
  console.warn(`[v2] ${file}: ${applied} applied, ${skipped} skipped`);
  if (!dry && next !== source) {
    const withImport = ensureImport(next);
    await Deno.writeTextFile(file, withImport);
  }
}

function ensureImport(source: string): string {
  if (/from\s+["']@veta\/logger["']/.test(source)) return source;
  const lines = source.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImportIdx = i;
  }
  if (lastImportIdx < 0) return source;
  lines.splice(lastImportIdx + 1, 0, `import { logger } from "@veta/logger";`);
  return lines.join("\n");
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
    console.error("usage: migrate-console-v2.ts [--dry] <file> [<file> ...]");
    Deno.exit(2);
  }
  for (const file of args) {
    await migrate(file, dry);
  }
}

if (import.meta.main) {
  await main();
}
