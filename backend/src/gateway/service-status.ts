import type { ServiceSpec } from "../../../shared/serviceRegistry.ts";
import {
  classifyProbe,
  countStatuses,
  isServiceUp,
  type ProbeResult,
  type ServiceStatus,
  type ServiceStatusCounts,
} from "../../../shared/serviceState.ts";

export interface ServiceStatusEntry {
  id: string;
  name: string;
  composeName: string;
  category: ServiceSpec["category"];
  tier: ServiceSpec["tier"];
  optional: boolean;
  visible: boolean;
  status: ServiceStatus;
  version: string;
  meta: Record<string, unknown>;
  checkedAt: number;
}

export interface ServicesStatusPayload {
  commit: string;
  checkedAt: number;
  counts: ServiceStatusCounts;
  services: ServiceStatusEntry[];
}

export interface ProbeTarget {
  spec: ServiceSpec;
  url: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    return asRecord(await res.json());
  } catch {
    return {};
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function probe(
  url: string,
  timeoutMs: number,
  fetchFn: FetchFn = fetch
): Promise<ProbeResult> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await readBody(res);
    return res.ok ? { kind: "ok", body } : { kind: "http", status: res.status, body };
  } catch (err) {
    return isTimeout(err) ? { kind: "timeout" } : { kind: "unreachable" };
  }
}

function metaOf(result: ProbeResult): { version: string; meta: Record<string, unknown> } {
  if (result.kind !== "ok" && result.kind !== "http") return { version: "—", meta: {} };
  const { version, service: _service, status: _status, ...meta } = result.body;
  return { version: version === undefined ? "—" : String(version), meta };
}

export function toEntry(
  spec: ServiceSpec,
  result: ProbeResult,
  checkedAt: number
): ServiceStatusEntry {
  return {
    id: spec.id,
    name: spec.displayName,
    composeName: spec.composeName,
    category: spec.category,
    tier: spec.tier,
    optional: spec.optional === true,
    visible: spec.excludeFromFrontendServices !== true,
    status: classifyProbe(spec, result),
    ...metaOf(result),
    checkedAt,
  };
}

export async function pollServices(
  targets: readonly ProbeTarget[],
  timeoutMs: number,
  fetchFn: FetchFn = fetch,
  now: () => number = Date.now
): Promise<ServiceStatusEntry[]> {
  const results = await Promise.all(targets.map(({ url }) => probe(url, timeoutMs, fetchFn)));
  const checkedAt = now();
  return targets.map(({ spec }, i) => toEntry(spec, results[i], checkedAt));
}

export function gatewayEntry(version: string, checkedAt: number): ServiceStatusEntry {
  return {
    id: "gateway",
    name: "Gateway",
    composeName: "gateway",
    category: "core",
    tier: 0,
    optional: false,
    visible: true,
    status: "ok",
    version,
    meta: {},
    checkedAt,
  };
}

export function buildServicesStatus(
  commit: string,
  entries: readonly ServiceStatusEntry[],
  checkedAt: number
): ServicesStatusPayload {
  const services = [gatewayEntry(commit, checkedAt), ...entries.filter((e) => e.visible)];
  return {
    commit,
    checkedAt,
    counts: countStatuses(services.map((s) => s.status)),
    services,
  };
}

export function toHealthFlags(entries: readonly ServiceStatusEntry[]): Record<string, boolean> {
  return Object.fromEntries(entries.map((e) => [e.id, isServiceUp(e.status)]));
}
