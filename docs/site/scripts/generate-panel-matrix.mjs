import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const registryPath = path.join(
  repoRoot,
  "frontend/src/components/dashboard/panelRegistry.ts",
);
const targetPath = path.resolve(
  docsSiteRoot,
  "src/data/panel-matrix.json",
);

const src = fs.readFileSync(registryPath, "utf8");

function parseTradingStyles(text) {
  const m = text.match(/export type TradingStyle\s*=\s*([\s\S]*?);/);
  if (!m) throw new Error("TradingStyle union not found");
  const styles = [];
  const re = /"([a-z_]+)"/g;
  let match;
  match = re.exec(m[1]);
  while (match !== null) {
    styles.push(match[1]);
    match = re.exec(m[1]);
  }
  return styles;
}

function parsePanelTitles(text) {
  const m = text.match(
    /export const PANEL_TITLES:\s*Record<PanelId,\s*string>\s*=\s*\{([\s\S]*?)\n\};/,
  );
  if (!m) throw new Error("PANEL_TITLES not found");
  const titles = {};
  const re = /"([a-z0-9-]+)"\s*:\s*"([^"]+)"/g;
  let match;
  match = re.exec(m[1]);
  while (match !== null) {
    titles[match[1]] = match[2];
    match = re.exec(m[1]);
  }
  return titles;
}

function parsePanelStyles(text) {
  const start = text.indexOf("export const PANEL_TRADING_STYLES");
  if (start === -1) throw new Error("PANEL_TRADING_STYLES not found");
  let depth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  if (bodyStart < 0 || bodyEnd < 0) {
    throw new Error("Could not find PANEL_TRADING_STYLES body");
  }
  const body = text.slice(bodyStart, bodyEnd);
  const result = {};
  const entryRe = /"([a-z0-9-]+)"\s*:\s*new Set<TradingStyle>\(\[([\s\S]*?)\]\)/g;
  let match;
  match = entryRe.exec(body);
  while (match !== null) {
    const panelId = match[1];
    const styleList = [];
    const stRe = /"([a-z_]+)"/g;
    let stMatch;
    stMatch = stRe.exec(match[2]);
    while (stMatch !== null) {
      styleList.push(stMatch[1]);
      stMatch = stRe.exec(match[2]);
    }
    result[panelId] = styleList;
    match = entryRe.exec(body);
  }
  return result;
}

const tradingStyles = parseTradingStyles(src);
const titles = parsePanelTitles(src);
const panelStyles = parsePanelStyles(src);

const panelIds = Object.keys(panelStyles).sort((a, b) =>
  (titles[a] ?? a).localeCompare(titles[b] ?? b),
);

const data = {
  styles: tradingStyles,
  panels: panelIds.map((id) => ({
    id,
    title: titles[id] ?? id,
    allowed: panelStyles[id],
  })),
};

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + "\n");

console.log(
  `Updated ${path.relative(repoRoot, targetPath)} (${panelIds.length} panels × ${tradingStyles.length} styles)`,
);
