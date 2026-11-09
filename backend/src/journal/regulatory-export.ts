import type { RegulatoryRecord } from "../lib/regulatory-records.ts";

export const REGULATORY_EXPORT_PREFIX = "orders/";
const DAY_MS = 86_400_000;

export interface RegulatoryExportStore {
  putObject: (key: string, body: string) => Promise<void>;
  listKeys: (prefix: string) => Promise<string[]>;
}

export function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function exportKey(dayStartMs: number): string {
  const [year, month, day] = new Date(dayStartMs).toISOString().slice(0, 10).split("-");
  return `${REGULATORY_EXPORT_PREFIX}${year}/${month}/${day}.ndjson`;
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
  const existing = new Set(await deps.store.listKeys(REGULATORY_EXPORT_PREFIX));
  const written: string[] = [];
  for (let i = lookback; i >= 1; i--) {
    const dayStart = today - i * DAY_MS;
    const key = exportKey(dayStart);
    if (existing.has(key)) continue;
    const records = await deps.fetchRecords(dayStart, dayStart + DAY_MS);
    if (records.length === 0) continue;
    await deps.store.putObject(key, serialiseRecords(records));
    written.push(key);
  }
  return written;
}
