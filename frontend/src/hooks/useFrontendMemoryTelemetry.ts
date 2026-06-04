import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

export interface MemorySnapshot {
  usedMb: number;
  totalMb: number;
  limitMb: number;
  pct: number;
}

const POLL_INTERVAL_MS = 30_000;
const TELEMETRY_ENDPOINT = "/api/gateway/telemetry/frontend";

function readPerformanceMemory(): PerformanceMemory | null {
  const perf = performance as PerformanceWithMemory;
  return perf.memory ?? null;
}

function toMb(bytes: number): number {
  return bytes / 1024 / 1024;
}

async function postSample(memory: PerformanceMemory): Promise<void> {
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsHeapSizeUsed: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      }),
    });
  } catch {
    // best-effort, don't surface telemetry failures to the user
  }
}

export function useFrontendMemoryTelemetry(): MemorySnapshot | null {
  const snapshot = useSignal<MemorySnapshot | null>(null);

  useEffect(() => {
    const memory = readPerformanceMemory();
    if (!memory) return;

    function sample(): void {
      const m = readPerformanceMemory();
      if (!m) return;
      const usedMb = toMb(m.usedJSHeapSize);
      const totalMb = toMb(m.totalJSHeapSize);
      const limitMb = toMb(m.jsHeapSizeLimit);
      snapshot.value = {
        usedMb,
        totalMb,
        limitMb,
        pct: m.jsHeapSizeLimit > 0 ? (m.usedJSHeapSize / m.jsHeapSizeLimit) * 100 : 0,
      };
      void postSample(m);
    }

    sample();
    const handle = globalThis.setInterval(sample, POLL_INTERVAL_MS);
    return () => globalThis.clearInterval(handle);
  }, [snapshot]);

  return snapshot.value;
}
