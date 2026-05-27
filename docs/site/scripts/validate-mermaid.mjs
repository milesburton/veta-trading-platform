import { readFile, glob } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

const FENCE_RE = /^([ \t]*)```mermaid[^\n]*\n([\s\S]*?)\n\1```/gm;
const DOCS_ROOT = resolve(import.meta.dirname, "../..");

async function collectFiles() {
  const paths = [];
  for await (const entry of glob("**/*.{md,mdx}", { cwd: DOCS_ROOT })) {
    if (entry.includes("node_modules") || entry.includes("/dist/")) continue;
    paths.push(entry);
  }
  return paths.sort();
}

function locate(source, blockStart, lineWithinBlock) {
  const before = source.slice(0, blockStart);
  const baseLine = before.split("\n").length;
  return baseLine + lineWithinBlock;
}

const files = await collectFiles();
let totalBlocks = 0;
let failed = 0;
const failures = [];

for (const rel of files) {
  const path = `${DOCS_ROOT}/${rel}`;
  const src = await readFile(path, "utf8");
  const matches = [...src.matchAll(FENCE_RE)];
  for (const m of matches) {
    totalBlocks++;
    const body = m[2];
    const blockStart = m.index;
    try {
      await mermaid.parse(body);
    } catch (err) {
      failed++;
      const msg = (err.message ?? String(err)).split("\n")[0];
      const lineMatch = err.message?.match(/line (\d+)/);
      const lineWithinBlock = lineMatch ? Number(lineMatch[1]) : 1;
      const fileLine = locate(src, blockStart, lineWithinBlock);
      failures.push({ rel, line: fileLine, msg });
    }
  }
}

console.log(`Validated ${totalBlocks} mermaid block(s) across ${files.length} doc file(s)`);
if (failed > 0) {
  console.error(`\n${failed} mermaid block(s) failed to parse:\n`);
  for (const f of failures) {
    console.error(`  ${f.rel}:${f.line}  ${f.msg}`);
  }
  process.exit(1);
}
