import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface ScenarioSpec {
  seed: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  strategy: string;
  algoParams?: Record<string, unknown>;
  durationMs?: number;
}

export interface ScenarioExpected {
  fillCount?: number;
  totalFilled?: number;
  avgFillPriceBps?: number;
  slippageBps?: number;
  tolerance?: { fillCount?: number; totalFilled?: number; bps?: number };
}

export interface Scenario {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  spec: ScenarioSpec;
  expected: ScenarioExpected | null;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "pending" | "completed" | "failed" | "mismatched";

export interface ScenarioActual {
  fillCount: number;
  totalFilled: number;
  avgFillPrice: number;
  avgFillPriceBps: number;
  slippageBps: number;
  childOrderIds: string[];
  durationMs: number;
}

export interface ScenarioDiff {
  matched: boolean;
  fields: Record<string, { expected: unknown; actual: unknown; withinTolerance: boolean }>;
}

export interface ScenarioRun {
  id: string;
  scenarioId: string;
  userId: string;
  triggeredAt: string;
  completedAt: string | null;
  parentOrderId: string | null;
  actual: ScenarioActual | null;
  diff: ScenarioDiff | null;
  status: RunStatus;
  error: string | null;
}

interface ScenarioCreateInput {
  name: string;
  description?: string;
  spec: ScenarioSpec;
  expected?: ScenarioExpected;
}

export const scenariosApi = createApi({
  reducerPath: "scenariosApi",
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway",
    credentials: "include",
  }),
  tagTypes: ["Scenarios", "ScenarioRuns"],
  endpoints: (builder) => ({
    listScenarios: builder.query<Scenario[], void>({
      query: () => "/scenarios",
      transformResponse: (res: { scenarios: Scenario[] }) => res.scenarios,
      providesTags: (scenarios) =>
        scenarios
          ? [...scenarios.map((s) => ({ type: "Scenarios" as const, id: s.id })), "Scenarios"]
          : ["Scenarios"],
    }),
    createScenario: builder.mutation<Scenario, ScenarioCreateInput>({
      query: (body) => ({ url: "/scenarios", method: "POST", body }),
      transformResponse: (res: { scenario: Scenario }) => res.scenario,
      invalidatesTags: ["Scenarios"],
    }),
    deleteScenario: builder.mutation<void, string>({
      query: (id) => ({ url: `/scenarios/${id}`, method: "DELETE" }),
      invalidatesTags: ["Scenarios"],
    }),
    runScenario: builder.mutation<ScenarioRun, string>({
      query: (id) => ({ url: `/scenarios/${id}/run`, method: "POST" }),
      transformResponse: (res: { run: ScenarioRun }) => res.run,
      invalidatesTags: (_result, _error, id) => [{ type: "ScenarioRuns", id }],
    }),
    listRuns: builder.query<ScenarioRun[], string>({
      query: (id) => `/scenarios/${id}/runs`,
      transformResponse: (res: { runs: ScenarioRun[] }) => res.runs,
      providesTags: (_runs, _error, id) => [{ type: "ScenarioRuns", id }],
    }),
  }),
});

export const {
  useListScenariosQuery,
  useCreateScenarioMutation,
  useDeleteScenarioMutation,
  useRunScenarioMutation,
  useListRunsQuery,
} = scenariosApi;
