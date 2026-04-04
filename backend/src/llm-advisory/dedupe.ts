import type { JobStore } from "./job-store.ts";
import type { LlmPolicy } from "../types/llm-advisory.ts";

export async function computeContextHash(parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
    .slice(0, 16);
}

export async function shouldEnqueueJob(
  store: JobStore,
  contextHash: string,
  policy: LlmPolicy,
): Promise<boolean> {
  if (!policy.enabled) return false;
  return !(await store.hasRecentJob(contextHash, policy.dedupeWindowMs));
}
