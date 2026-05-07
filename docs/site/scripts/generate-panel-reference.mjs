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
const componentPickerPath = path.join(
  repoRoot,
  "frontend/src/components/ComponentPicker.tsx",
);
const reportPath = path.join(
  repoRoot,
  "docs/panel-walkthrough/report.json",
);
const screenshotsSrcDir = path.join(
  repoRoot,
  "docs/panel-walkthrough/screenshots",
);
const screenshotsDestDir = path.join(
  docsSiteRoot,
  "public/screenshots/panels",
);
const targetPath = path.resolve(
  docsSiteRoot,
  "src/data/panel-reference.json",
);

function parsePanelTitles(text) {
  const m = text.match(
    /export const PANEL_TITLES:\s*Record<PanelId,\s*string>\s*=\s*\{([\s\S]*?)\n\};/,
  );
  if (!m) throw new Error("PANEL_TITLES not found in panelRegistry.ts");
  const titles = {};
  const re = /"?([a-z0-9-]+)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  match = re.exec(m[1]);
  while (match !== null) {
    titles[match[1]] = match[2];
    match = re.exec(m[1]);
  }
  return titles;
}

function parsePanelDescriptions(text) {
  const m = text.match(
    /const PANEL_DESCRIPTIONS:\s*Record<PanelId,\s*string>\s*=\s*\{([\s\S]*?)\n\};/,
  );
  if (!m) throw new Error("PANEL_DESCRIPTIONS not found in ComponentPicker.tsx");
  const body = m[1];
  const descriptions = {};
  const re = /"?([a-z0-9-]+)"?\s*:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  match = re.exec(body);
  while (match !== null) {
    descriptions[match[1]] = match[2].replace(/\\"/g, '"');
    match = re.exec(body);
  }
  return descriptions;
}

const registrySrc = fs.readFileSync(registryPath, "utf8");
const componentPickerSrc = fs.readFileSync(componentPickerPath, "utf8");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

const titles = parsePanelTitles(registrySrc);
const descriptions = parsePanelDescriptions(componentPickerSrc);

fs.mkdirSync(screenshotsDestDir, { recursive: true });

let copied = 0;
for (const entry of report.panels) {
  if (!entry.rendered) continue;
  const fileName = `${entry.panelId}.png`;
  const src = path.join(screenshotsSrcDir, fileName);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(screenshotsDestDir, fileName);
  fs.copyFileSync(src, dest);
  copied++;
}

const panels = report.panels.map((entry) => {
  const panelId = entry.panelId;
  const screenshotPublic = entry.rendered
    ? `screenshots/panels/${panelId}.png`
    : null;
  return {
    panelId,
    title: titles[panelId] ?? panelId,
    description: descriptions[panelId] ?? "",
    rendered: entry.rendered,
    notes: entry.notes ?? null,
    screenshot: screenshotPublic,
  };
});

const data = {
  generatedAt: report.generatedAt,
  totalPanels: report.totalPanels,
  rendered: report.rendered,
  skipped: report.skipped,
  panels,
};

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + "\n");

console.log(
  `Updated ${path.relative(repoRoot, targetPath)} (${panels.length} panels, ${copied} screenshots copied)`,
);
