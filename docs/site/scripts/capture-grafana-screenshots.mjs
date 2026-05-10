import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");

const GRAFANA_URL = process.env.GRAFANA_URL ?? "http://localhost:3000";
const GRAFANA_USER = process.env.GRAFANA_USER ?? "admin";
const GRAFANA_PASS = process.env.GRAFANA_PASS ?? "admin";
const FROM = process.env.GRAFANA_FROM ?? "now-30m";
const TO = process.env.GRAFANA_TO ?? "now";
const WIDTH = Number(process.env.GRAFANA_WIDTH ?? "1400");
const HEIGHT = Number(process.env.GRAFANA_HEIGHT ?? "600");
const THEME = process.env.GRAFANA_THEME ?? "dark";

const dashboardsDir = path.resolve(
  repoRoot,
  "observability/grafana/provisioning/dashboards/json",
);
const outDir = path.resolve(repoRoot, "docs/screenshots/grafana");

const includedDashboards = new Set([
  "veta-services-otel",
  "veta-order-pipeline-traces",
  "trading",
]);

const SKIPPED_PANEL_TYPES = new Set(["table", "logs", "nodeGraph"]);

function readDashboards() {
  const files = fs
    .readdirSync(dashboardsDir)
    .filter((f) => f.endsWith(".json"));
  const out = [];
  for (const file of files) {
    const fullPath = path.join(dashboardsDir, file);
    const dash = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!dash.uid || !includedDashboards.has(dash.uid)) continue;
    out.push({
      uid: dash.uid,
      title: dash.title ?? dash.uid,
      description: dash.description ?? "",
      panels: (dash.panels ?? [])
        .filter((p) => p.type !== "row" && !SKIPPED_PANEL_TYPES.has(p.type))
        .map((p) => ({
          id: p.id,
          title: p.title ?? `panel-${p.id}`,
          description: p.description ?? "",
          gridPos: p.gridPos ?? null,
        })),
    });
  }
  return out;
}

const RENDER_TIMEOUT_MS = Number(process.env.GRAFANA_RENDER_TIMEOUT_MS ?? "30000");

async function fetchPanelPng(uid, panelId) {
  const params = new URLSearchParams({
    orgId: "1",
    panelId: String(panelId),
    from: FROM,
    to: TO,
    width: String(WIDTH),
    height: String(HEIGHT),
    theme: THEME,
    tz: "UTC",
    timeout: String(Math.floor(RENDER_TIMEOUT_MS / 1000)),
  });
  const url = `${GRAFANA_URL}/render/d-solo/${uid}/_?${params.toString()}`;
  const auth = Buffer.from(`${GRAFANA_USER}:${GRAFANA_PASS}`).toString("base64");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), RENDER_TIMEOUT_MS + 5_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) {
      throw new Error(`Suspiciously small render (${buf.length} bytes) for panel ${panelId}`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const dashboards = readDashboards();
  if (dashboards.length === 0) {
    console.error("No dashboards matched the include list");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const manifest = { capturedAt: new Date().toISOString(), dashboards: [] };
  let failed = 0;

  for (const dash of dashboards) {
    const dashSlug = slug(dash.uid);
    const dashDir = path.join(outDir, dashSlug);
    fs.mkdirSync(dashDir, { recursive: true });

    const dashEntry = {
      uid: dash.uid,
      slug: dashSlug,
      title: dash.title,
      description: dash.description,
      panels: [],
    };

    console.log(`\n=== ${dash.title} (${dash.uid}) — ${dash.panels.length} panels ===`);

    for (const panel of dash.panels) {
      const fileName = `${panel.id}-${slug(panel.title)}.png`;
      const filePath = path.join(dashDir, fileName);
      try {
        const png = await fetchPanelPng(dash.uid, panel.id);
        if (
          !(png instanceof Uint8Array || Buffer.isBuffer(png)) ||
          png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47
        ) {
          throw new Error("Invalid PNG data received from network");
        }
        fs.writeFileSync(filePath, png);
        console.log(`  ✓ ${panel.title} → ${fileName} (${png.length} B)`);
        dashEntry.panels.push({
          id: panel.id,
          title: panel.title,
          description: panel.description,
          file: `${dashSlug}/${fileName}`,
        });
      } catch (err) {
        console.error(`  ✗ ${panel.title} (${panel.id}): ${err.message}`);
        failed++;
      }
    }

    manifest.dashboards.push(dashEntry);
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(`\nDone. Captured ${manifest.dashboards.flatMap((d) => d.panels).length} panels.`);
  if (failed > 0) {
    console.error(`${failed} panel(s) failed to render.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
