import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const rbacSrc = path.join(repoRoot, "frontend/src/auth/rbac.ts");
const outputPath = path.resolve(
  docsSiteRoot,
  "src/data/rbac-roles.json",
);

const src = fs.readFileSync(rbacSrc, "utf8");

function captureArray(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const m = src.match(re);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter((s) => s.length > 0 && !s.startsWith("//"));
}

function captureSet(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*new Set<[^>]+>\\(\\[([\\s\\S]*?)\\]\\)`);
  const m = src.match(re);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
      .filter((s) => s.length > 0 && !s.startsWith("//")),
  );
}

function captureRecord(name) {
  const re = new RegExp(`export const ${name}\\s*:[^=]+=\\s*\\{([\\s\\S]*?)\\}\\s*;`);
  const m = src.match(re);
  if (!m) return {};
  const result = {};
  const entryRe = /["']?([\w-]+)["']?\s*:\s*["']([^"']+)["']/g;
  let entry;
  entry = entryRe.exec(m[1]);
  while (entry !== null) {
    result[entry[1]] = entry[2];
    entry = entryRe.exec(m[1]);
  }
  return result;
}

const roles = captureArray("AUTH_ROLES");
const nonTrading = captureSet("NON_TRADING_ROLES");
const labels = captureRecord("ROLE_LABELS");

const rows = roles.map((role) => ({
  id: role,
  label: labels[role] ?? role,
  canTrade: !nonTrading.has(role),
}));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ roles: rows }, null, 2)}\n`);

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} (${rows.length} roles)`,
);
