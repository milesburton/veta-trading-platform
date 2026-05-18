import type {
  KillOrdersPayload,
  KillScope,
  ResumeOrdersPayload,
} from "@veta/frontend/store/ordersSlice.ts";

export interface BuildPayloadInputs {
  scope: KillScope;
  scopeValues: string[];
  isAdmin: boolean;
  targetUserId: string;
}

function userTarget(inputs: BuildPayloadInputs): string | undefined {
  if (inputs.scope === "user" && inputs.isAdmin && inputs.targetUserId) {
    return inputs.targetUserId;
  }
  return undefined;
}

export function buildKillPayloads(inputs: BuildPayloadInputs): KillOrdersPayload[] {
  const targetUserId = userTarget(inputs);
  if (inputs.scopeValues.length === 0) {
    const payload: KillOrdersPayload = { scope: inputs.scope };
    if (targetUserId) payload.targetUserId = targetUserId;
    return [payload];
  }
  return inputs.scopeValues.map((scopeValue) => {
    const payload: KillOrdersPayload = { scope: inputs.scope, scopeValue };
    if (targetUserId) payload.targetUserId = targetUserId;
    return payload;
  });
}

export interface BuildResumeInputs extends BuildPayloadInputs {
  resumeMode: "immediate" | "scheduled";
  resumeMinutes: string;
}

export function buildResumePayload(inputs: BuildResumeInputs): ResumeOrdersPayload {
  const payload: ResumeOrdersPayload = { scope: inputs.scope };
  const targetUserId = userTarget(inputs);
  if (targetUserId) payload.targetUserId = targetUserId;
  if (inputs.scopeValues.length > 0) {
    payload.scopeValue = inputs.scopeValues[0];
  }
  if (inputs.resumeMode === "scheduled" && inputs.resumeMinutes) {
    payload.resumeAt = Date.now() + Number(inputs.resumeMinutes) * 60_000;
  }
  return payload;
}
