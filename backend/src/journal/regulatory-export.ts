import type { RegulatoryRecord } from "../lib/regulatory-records.ts";

export const REGULATORY_EXPORT_PREFIX = "orders/";
const DAY_MS = 86_400_000;
const SEQ_WIDTH = 12;
const SUFFIX = ".ndjson";

export interface RegulatoryExportStore {
  putObject: (key: string, body: string) => Promise<void>;
  listKeys: (prefix: string) => Promise<string[]>;
}

export function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function dayPrefix(dayStartMs: number): string {
  const [year, month, day] = new Date(dayStartMs).toISOString().slice(0, 10).split("-");
  return `${REGULATORY_EXPORT_PREFIX}${year}/${month}/${day}/`;
}

export function exportKey(dayStartMs: number, firstSeq: number, lastSeq: number): string {
  const pad = (n: number) => String(n).padStart(SEQ_WIDTH, "0");
  return `${dayPrefix(dayStartMs)}${pad(firstSeq)}-${pad(lastSeq)}${SUFFIX}`;
}

export function exportedWatermark(keys: readonly string[], dayStartMs: number): number {
  const prefix = dayPrefix(dayStartMs);
  return keys
    .filter((key) => key.startsWith(prefix) && key.endsWith(SUFFIX))
    .map((key) => Number(key.slice(prefix.length, -SUFFIX.length).split("-")[1]))
    .filter((seq) => Number.isFinite(seq))
    .reduce((max, seq) => Math.max(max, seq), 0);
}

export function serialiseRecords(records: readonly RegulatoryRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

export interface RegulatoryExportDeps {
  store: RegulatoryExportStore;
  fetchRecords: (fromMs: number, toMs: number) => Promise<RegulatoryRecord[]>;
  now?: () => number;
  lookbackDays?: number;
}

export async function exportMissingDays(deps: RegulatoryExportDeps): Promise<string[]> {
  const now = (deps.now ?? Date.now)();
  const lookback = deps.lookbackDays ?? 3;
  const today = utcDayStart(now);
  const keys = await deps.store.listKeys(REGULATORY_EXPORT_PREFIX);
  const written: string[] = [];
  for (let i = lookback; i >= 1; i--) {
    const dayStart = today - i * DAY_MS;
    const watermark = exportedWatermark(keys, dayStart);
    const records = await deps.fetchRecords(dayStart, dayStart + DAY_MS);
    const pending = records.filter((r) => r.seq > watermark);
    if (pending.length === 0) continue;
    const key = exportKey(dayStart, pending[0].seq, pending[pending.length - 1].seq);
    await deps.store.putObject(key, serialiseRecords(pending));
    written.push(key);
  }
  return written;
}
