// fallow-ignore-file unused-file
const DEFAULT_GRAFANA_URL = "http://lgtm-grafana:3000/grafana";
const RENDER_TIMEOUT_MS = 15_000;
const MAX_PNG_BYTES = 6 * 1024 * 1024;

export interface RenderOptions {
  panelUid: string;
  panelId: number;
  width?: number;
  height?: number;
  fromMinutesAgo?: number;
  theme?: "light" | "dark";
}

function getBaseUrl(): string {
  return Deno.env.get("GRAFANA_INTERNAL_URL") ?? DEFAULT_GRAFANA_URL;
}

function buildRenderUrl(opts: RenderOptions): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  const params = new URLSearchParams({
    panelId: String(opts.panelId),
    width: String(opts.width ?? 800),
    height: String(opts.height ?? 400),
    from: `now-${opts.fromMinutesAgo ?? 15}m`,
    to: "now",
    orgId: "1",
    theme: opts.theme ?? "dark",
  });
  return `${base}/render/d-solo/${encodeURIComponent(opts.panelUid)}?${params}`;
}

export async function renderGrafanaPanel(opts: RenderOptions): Promise<Uint8Array | null> {
  if (Deno.env.get("DISCORD_ATTACH_GRAFANA_PANELS") === "false") return null;
  const url = buildRenderUrl(opts);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("image/")) return null;

    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const advertised = Number(lenHeader);
      if (Number.isFinite(advertised) && advertised > MAX_PNG_BYTES) {
        try { await res.body?.cancel(); } catch { /* already drained */ }
        return null;
      }
    }

    if (!res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_PNG_BYTES) {
        try { await reader.cancel(); } catch { /* already drained */ }
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

interface PanelRef {
  panelUid: string;
  panelId: number;
}

const SOURCE_TO_PANEL: Record<string, PanelRef> = {
  "kill-switch": { panelUid: "trading", panelId: 1 },
  "service-down": { panelUid: "trading", panelId: 1 },
  "oms": { panelUid: "trading", panelId: 1 },
  "ems": { panelUid: "trading", panelId: 1 },
  "risk-engine": { panelUid: "trading", panelId: 1 },
  "journal": { panelUid: "trading", panelId: 1 },
  "market-sim": { panelUid: "trading", panelId: 1 },
  "algo": { panelUid: "trading", panelId: 5 },
  "twap-algo": { panelUid: "trading", panelId: 5 },
  "vwap-algo": { panelUid: "trading", panelId: 5 },
  "pov-algo": { panelUid: "trading", panelId: 5 },
  "http-latency": { panelUid: "veta-services-otel", panelId: 10 },
  "http-errors": { panelUid: "veta-services-otel", panelId: 11 },
};

const DEFAULT_PANEL: PanelRef = { panelUid: "trading", panelId: 1 };

export function lookupPanel(source: string | undefined): PanelRef | null {
  if (!source) return DEFAULT_PANEL;
  const lower = source.toLowerCase();
  if (lower in SOURCE_TO_PANEL) return SOURCE_TO_PANEL[lower];
  if (lower.endsWith("-algo")) return { panelUid: "trading", panelId: 5 };
  return DEFAULT_PANEL;
}

export const _internalForTests = { buildRenderUrl };
