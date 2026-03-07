import type { Signal, TradeRecommendation } from "../types/intelligence.ts";
import type { LlmPolicy } from "../types/llm-advisory.ts";
import { AdvisoryTriggerReason } from "../types/llm-advisory.ts";
import { canAutoTrigger, meetsConvictionThreshold } from "./policy.ts";
import { computeContextHash } from "./dedupe.ts";

export interface TriggerCandidate {
  symbol: string;
  triggerReason: AdvisoryTriggerReason;
  contextHash: string;
  priority: number;
  requestedBy: string | null;
}

export async function evaluateSignalTrigger(
  policy: LlmPolicy,
  signal: Signal,
): Promise<TriggerCandidate | null> {
  if (!canAutoTrigger(policy)) return null;
  if (!meetsConvictionThreshold(policy, signal)) return null;
  const hash = await computeContextHash([
    signal.symbol,
    signal.direction,
    String(Math.round(signal.score * 10) / 10),
  ]);
  return {
    symbol: signal.symbol,
    triggerReason: AdvisoryTriggerReason.HIGH_CONVICTION_SIGNAL,
    contextHash: hash,
    priority: 0,
    requestedBy: null,
  };
}

export async function evaluateRecommendationTrigger(
  policy: LlmPolicy,
  newRec: TradeRecommendation,
  prevRec: TradeRecommendation | undefined,
): Promise<TriggerCandidate | null> {
  if (!canAutoTrigger(policy)) return null;
  const actionChanged = prevRec !== undefined && prevRec.action !== newRec.action;
  const qtyChangedMaterially =
    prevRec !== undefined &&
    prevRec.suggestedQty > 0 &&
    Math.abs(newRec.suggestedQty - prevRec.suggestedQty) / prevRec.suggestedQty > 0.2;
  if (!actionChanged && !qtyChangedMaterially) return null;
  const hash = await computeContextHash([
    newRec.symbol,
    newRec.action,
    String(Math.round(newRec.confidence * 10)),
  ]);
  return {
    symbol: newRec.symbol,
    triggerReason: AdvisoryTriggerReason.RECOMMENDATION_CHANGED,
    contextHash: hash,
    priority: 0,
    requestedBy: null,
  };
}

export async function evaluateUiRequestTrigger(
  policy: LlmPolicy,
  symbol: string,
  requestedBy: string,
): Promise<TriggerCandidate | null> {
  if (!policy.enabled) return null;
  const hash = await computeContextHash([
    symbol,
    "ui_request",
    String(Math.floor(Date.now() / policy.dedupeWindowMs)),
  ]);
  return {
    symbol,
    triggerReason: AdvisoryTriggerReason.UI_REQUEST,
    contextHash: hash,
    priority: 1,
    requestedBy,
  };
}

export async function evaluateScenarioTrigger(
  policy: LlmPolicy,
  symbol: string,
  shockFactors: string[],
): Promise<TriggerCandidate | null> {
  if (!policy.enabled) return null;
  const hash = await computeContextHash([
    symbol,
    "scenario",
    String(shockFactors.length),
    shockFactors.slice().sort().join(","),
  ]);
  return {
    symbol,
    triggerReason: AdvisoryTriggerReason.SCENARIO_RUN,
    contextHash: hash,
    priority: 1,
    requestedBy: null,
  };
}

export async function evaluateStalenessRefreshTrigger(
  policy: LlmPolicy,
  symbol: string,
  latestNoteCreatedAt: number | null,
): Promise<TriggerCandidate | null> {
  if (!canAutoTrigger(policy)) return null;
  if (latestNoteCreatedAt !== null && Date.now() - latestNoteCreatedAt < policy.maxNoteAgeMs) {
    return null;
  }
  const hash = await computeContextHash([
    symbol,
    "staleness",
    String(Math.floor(Date.now() / policy.maxNoteAgeMs)),
  ]);
  return {
    symbol,
    triggerReason: AdvisoryTriggerReason.STALENESS_REFRESH,
    contextHash: hash,
    priority: -1,
    requestedBy: null,
  };
}
