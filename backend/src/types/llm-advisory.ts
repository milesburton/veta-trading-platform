export type LlmJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type AdvisoryStatus =
  | "not-requested"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "stale";

export enum AdvisoryTriggerReason {
  HIGH_CONVICTION_SIGNAL = "HIGH_CONVICTION_SIGNAL",
  RECOMMENDATION_CHANGED = "RECOMMENDATION_CHANGED",
  SCENARIO_RUN = "SCENARIO_RUN",
  UI_REQUEST = "UI_REQUEST",
  STALENESS_REFRESH = "STALENESS_REFRESH",
}

export interface LlmJob {
  id: string;
  symbol: string;
  triggerReason: AdvisoryTriggerReason;
  status: LlmJobStatus;
  contextHash: string;
  priority: number;
  requestedBy: string | null;
  createdAt: number;
  claimedAt: number | null;
  completedAt: number | null;
  workerSessionId: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface AdvisoryNote {
  id: string;
  jobId: string;
  symbol: string;
  content: string;
  provider: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  signalSnapshot: string;
  recommendationSnapshot: string | null;
  createdAt: number;
}

export interface LlmPromptAudit {
  id: string;
  jobId: string;
  promptText: string;
  systemPromptHash: string;
  contextSizeChars: number;
  ts: number;
}

export interface LlmResponseAudit {
  id: string;
  jobId: string;
  rawResponse: string;
  parsedSuccessfully: boolean;
  parseErrorMessage: string | null;
  ts: number;
}

export interface LlmWorkerSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  provider: string;
  modelId: string;
  jobsProcessed: number;
  jobsFailed: number;
  pid: number;
}

export interface LlmPolicy {
  enabled: boolean;
  provider: string;
  modelId: string;
  ollamaBaseUrl: string;
  maxConcurrentJobs: number;
  maxNoteAgeMs: number;
  signalConvictionThreshold: number;
  confidenceThreshold: number;
  dedupeWindowMs: number;
  autoTriggerEnabled: boolean;
}

export interface LlmProviderResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  rawResponse: string;
}

export interface ILlmProvider {
  readonly providerId: string;
  readonly modelId: string;
  generate(prompt: string, systemPrompt: string): Promise<LlmProviderResponse>;
  isAvailable(): Promise<boolean>;
}
