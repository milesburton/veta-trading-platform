import { checkPreTradeRisk, shouldTriggerRiskCheck } from "@veta/frontend/domain/ticket/async-risk";
import { describe, expect, it, vi } from "vitest";
import { makeCtx } from "./fixtures";

describe("shouldTriggerRiskCheck", () => {
  it("returns true when prev is null", () => {
    expect(shouldTriggerRiskCheck(null, makeCtx())).toBe(true);
  });

  it.each([
    ["quantity", { quantity: 200 }],
    ["limitPrice", { limitPrice: 200 }],
    ["side", { side: "SELL" as const }],
    ["strategy", { strategy: "TWAP" as const }],
  ])("returns true when %s changes", (_field, draftOverride) => {
    const prev = makeCtx();
    const next = makeCtx({ draft: { ...prev.draft, ...draftOverride } });
    expect(shouldTriggerRiskCheck(prev, next)).toBe(true);
  });

  it("returns true when symbol changes", () => {
    const prev = makeCtx();
    const next = makeCtx({
      instrument: { ...prev.instrument, symbol: "MSFT" },
    });
    expect(shouldTriggerRiskCheck(prev, next)).toBe(true);
  });

  it("returns false when nothing relevant changes", () => {
    const ctx = makeCtx();
    expect(shouldTriggerRiskCheck(ctx, ctx)).toBe(false);
  });
});

describe("checkPreTradeRisk", () => {
  it("returns idle when qty is zero", async () => {
    const result = await checkPreTradeRisk(makeCtx({ draft: { ...makeCtx().draft, quantity: 0 } }));
    expect(result.status).toBe("idle");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("returns idle when userId is undefined", async () => {
    const result = await checkPreTradeRisk(makeCtx({ userId: undefined }));
    expect(result.status).toBe("idle");
  });

  it("returns approved with no violations on 200 OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ approved: true, violations: [] }),
      })
    );

    const result = await checkPreTradeRisk(makeCtx());
    expect(result.status).toBe("approved");
    expect(result.diagnostics).toHaveLength(0);
    expect(result.checkedAt).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("returns rejected with violations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            approved: false,
            violations: [
              {
                ruleId: "credit-limit",
                message: "Credit limit exceeded",
                severity: "error",
              },
              {
                ruleId: "concentration",
                message: "Position concentration warning",
                severity: "warning",
              },
            ],
          }),
      })
    );

    const result = await checkPreTradeRisk(makeCtx());
    expect(result.status).toBe("rejected");
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].ruleId).toBe("risk.credit-limit");
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[1].severity).toBe("warning");

    vi.unstubAllGlobals();
  });

  it("returns error on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await checkPreTradeRisk(makeCtx());
    expect(result.status).toBe("error");
    expect(result.diagnostics[0].ruleId).toBe("risk.service-error");

    vi.unstubAllGlobals();
  });

  it("returns error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await checkPreTradeRisk(makeCtx());
    expect(result.status).toBe("error");
    expect(result.diagnostics[0].ruleId).toBe("risk.timeout");

    vi.unstubAllGlobals();
  });
});
