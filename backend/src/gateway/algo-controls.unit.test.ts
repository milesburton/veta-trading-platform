import { ALGO_REGISTRY } from "#veta/algo-registry";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { buildAlgoControls } from "./algo-controls.ts";

const base = {
  riskEngineEnabled: true,
  riskConfig: { id: 4, createdAt: "2026-11-01T00:00:00.000Z", createdBy: "admin" },
  scenarioEvidence: [],
  killSwitchEvents: [],
};

test("[algo-controls] lists every registered algorithm with no evidence by default", () => {
  const report = buildAlgoControls(base);
  assertEquals(report.algorithms.length, Object.keys(ALGO_REGISTRY).length);
  assertEquals(
    report.algorithms.every((a) => a.lastScenarioRun === null),
    true
  );
  assertEquals(report.riskConfig?.id, 4);
});

test("[algo-controls] attaches the newest scenario run to its algorithm", () => {
  const report = buildAlgoControls({
    ...base,
    scenarioEvidence: [
      {
        algoId: "VETA-TWAP",
        status: "failed",
        triggeredAt: 10,
        algoVersion: "1.0.0",
        commitSha: "a",
      },
      {
        algoId: "VETA-TWAP",
        status: "passed",
        triggeredAt: 20,
        algoVersion: "1.0.0",
        commitSha: "b",
      },
    ],
  });
  const twap = report.algorithms.find((a) => a.algoId === "VETA-TWAP");
  assertEquals(twap?.lastScenarioRun?.commitSha, "b");
  assertEquals(report.algorithms.find((a) => a.algoId === "VETA-VWAP")?.lastScenarioRun, null);
});

test("[algo-controls] keeps only kill and resume events, newest first", () => {
  const report = buildAlgoControls({
    ...base,
    riskEngineEnabled: false,
    killSwitchEvents: [
      { action: "orders_kill", actorId: "a", target: "global", ts: 1 },
      { action: "market_hours_update", actorId: "a", target: null, ts: 2 },
      { action: "orders_resume", actorId: "a", target: "global", ts: 3 },
    ],
  });
  assertEquals(
    report.killSwitchHistory.map((e) => e.ts),
    [3, 1]
  );
  assertEquals(report.riskEngineEnabled, false);
});
