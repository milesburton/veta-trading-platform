/**
 * Generates frontend-component-dependencies.json by scanning all .ts/.tsx files
 * under frontend/src/ (excluding __tests__/ and *.test.*), extracting import
 * relationships, and emitting a structured graph.
 *
 * Output: docs/site/src/data/frontend-component-dependencies.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const frontendSrc = path.join(repoRoot, "frontend/src");
const outputPath = path.resolve(docsSiteRoot, "src/data/frontend-component-dependencies.json");

// --- File walking ---

function walk(dir, filter = () => true) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, __tests__, and test directories
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "tests") continue;
      results.push(...walk(full, filter));
    } else if (entry.isFile() && filter(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
function isSourceFile(name) {
  const ext = path.extname(name);
  return SOURCE_EXTENSIONS.has(ext) && !name.includes(".test.") && !name.includes("__tests__");
}

// --- Import parsing ---

function extractImports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const imports = [];

  // Match: import ... from '...'
  const fromRe = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = fromRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Match: import('...') dynamic imports
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Match: export ... from '...'
  const exportFromRe = /export\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = exportFromRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  return imports;
}

function resolveImport(importPath, sourceFile) {
  // Skip non-relative imports (node_modules, external packages)
  if (!importPath.startsWith(".")) return null;

  const sourceDir = path.dirname(sourceFile);
  let resolved = path.resolve(sourceDir, importPath);

  // Try extensions
  const extensions = [".tsx", ".ts", "/index.tsx", "/index.ts"];
  for (const ext of extensions) {
    if (fs.existsSync(resolved + ext)) {
      return resolved + ext;
    }
  }

  // Try as-is (might be a directory with index)
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

// --- Build graph ---

function buildGraph() {
  const files = walk(frontendSrc, isSourceFile);
  const nodes = new Map(); // filePath -> { name, path, imports, importedBy }
  const edges = []; // { from, to }

  // First pass: collect all nodes
  for (const file of files) {
    const relPath = path.relative(frontendSrc, file);
    const name = path.basename(file, path.extname(file));
    nodes.set(file, {
      name,
      path: relPath,
      imports: [],
      importedBy: [],
    });
  }

  // Second pass: resolve imports
  for (const file of files) {
    const node = nodes.get(file);
    if (!node) continue;

    const rawImports = extractImports(file);
    for (const imp of rawImports) {
      const resolved = resolveImport(imp, file);
      if (resolved && nodes.has(resolved)) {
        // Avoid duplicates
        if (!node.imports.includes(resolved)) {
          node.imports.push(resolved);
        }
        const target = nodes.get(resolved);
        if (!target.importedBy.includes(file)) {
          target.importedBy.push(file);
        }
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

// --- Output ---

function generateMarkdown(graph) {
  const lines = [];
  lines.push("```mermaid");
  lines.push("graph TD");

  // Define node styles by category
  const nodeIds = [];
  for (const node of graph.nodes) {
    const id = node.path.replace(/[^a-zA-Z0-9]/g, "_");
    nodeIds.push({ id, path: node.path, name: node.name });

    // Determine node style based on location
    let style = "fill:#f9f9f9,stroke:#333,stroke-width:1px";
    if (node.path.includes("/components/")) {
      style = "fill:#e1f5fe,stroke:#0288d1,stroke-width:2px";
    } else if (node.path.includes("/store/")) {
      style = "fill:#fff3e0,stroke:#f57c00,stroke-width:2px";
    } else if (node.path.includes("/hooks/")) {
      style = "fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px";
    } else if (node.path.includes("/lib/")) {
      style = "fill:#e8f5e9,stroke:#388e3c,stroke-width:2px";
    } else if (node.path.includes("/types/")) {
      style = "fill:#fce4ec,stroke:#c2185b,stroke-width:2px";
    }

    const displayName = node.name;
    lines.push(`  ${id}["${displayName}"]:::default`);
  }

  // Add edge styles
  lines.push("  classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;");
  lines.push("  classDef component fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;");
  lines.push("  classDef store fill:#fff3e0,stroke:#f57c00,stroke-width:2px;");
  lines.push("  classDef hook fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;");
  lines.push("  classDef lib fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;");
  lines.push("  classDef types fill:#fce4ec,stroke:#c2185b,stroke-width:2px;");

  // Add edges
  for (const node of graph.nodes) {
    const fromId = node.path.replace(/[^a-zA-Z0-9]/g, "_");
    for (const imp of node.imports) {
      const toId = imp.replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`  ${fromId} -->|imports| ${toId}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}

function generateTable(graph) {
  const lines = [];
  lines.push("| Component | Path | Imports | Imported By |");
  lines.push("|--|--|--|--|");

  const sorted = [...graph.nodes].sort((a, b) => a.path.localeCompare(b.path));
  for (const node of sorted) {
    const importCount = node.imports.length;
    const importedByCount = node.importedBy.length;
    const importList = importCount > 0
      ? node.imports.map((i) => path.basename(i, path.extname(i))).join(", ")
      : "—";
    const importedByList = importedByCount > 0
      ? node.importedBy.map((i) => path.basename(i, path.extname(i))).join(", ")
      : "—";
    lines.push(
      `| ${node.name} | \`${node.path}\` | ${importCount} (${importList}) | ${importedByCount} (${importedByList}) |`
    );
  }
  return lines.join("\n");
}

// --- Main ---

const graph = buildGraph();

// Write JSON data file. No timestamp: this file is committed and checked by
// the docs drift gate, which re-runs `generate` and diffs — a per-run
// timestamp would make it perpetually "out of sync".
const data = {
  totalComponents: graph.nodes.length,
  totalEdges: graph.nodes.reduce((sum, n) => sum + n.imports.length, 0),
  nodes: graph.nodes.map((n) => ({
    name: n.name,
    path: n.path,
    importCount: n.imports.length,
    importedByCount: n.importedBy.length,
  })),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n");

// Write Mermaid diagram to docs
const diagramPath = path.resolve(docsSiteRoot, "src/content/docs/development/components/component-dependency-graph.mdx");
const diagramContent = `---
title: "Frontend Component Dependency Graph"
description: "Auto-generated visualization of import relationships between frontend components."
---

{/*This page is generated by docs/site/scripts/generate-component-graph.mjs. Edits will be lost; change the source files instead.*/}

## Overview

This diagram shows the import relationships between all frontend components in the \`frontend/src/\` directory.
It is auto-generated from the source code and updated on every build.

- **Blue** nodes: React components
- **Orange** nodes: Zustand stores
- **Purple** nodes: Custom hooks
- **Green** nodes: Utility libraries
- **Pink** nodes: TypeScript types

\`\`\`mermaid
graph TD
  classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;
  classDef component fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
  classDef store fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
  classDef hook fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
  classDef lib fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
  classDef types fill:#fce4ec,stroke:#c2185b,stroke-width:2px;
\`\`\`

## Component Inventory

\`${data.totalComponents}\` components analyzed.

${generateTable(graph)}

## Legend

| Color | Category |
|--|--|
| <span style="display:inline-block;width:12px;height:12px;background:#e1f5fe;border:1px solid #0288d1;border-radius:2px"></span> | React Components |
| <span style="display:inline-block;width:12px;height:12px;background:#fff3e0;border:1px solid #f57c00;border-radius:2px"></span> | Zustand Stores |
| <span style="display:inline-block;width:12px;height:12px;background:#f3e5f5;border:1px solid #7b1fa2;border-radius:2px"></span> | Custom Hooks |
| <span style="display:inline-block;width:12px;height:12px;background:#e8f5e9;border:1px solid #388e3c;border-radius:2px"></span> | Utility Libraries |
| <span style="display:inline-block;width:12px;height:12px;background:#fce4ec;border:1px solid #c2185b;border-radius:2px"></span> | TypeScript Types |

## How to Regenerate

Run \`npm run generate\` in \`docs/site/\` to regenerate this page and the underlying data file.
`;

fs.mkdirSync(path.dirname(diagramPath), { recursive: true });
fs.writeFileSync(diagramPath, diagramContent);

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} (${data.totalComponents} components, ${data.totalEdges} edges)`
);
console.log(`Generated ${path.relative(repoRoot, diagramPath)}`);
