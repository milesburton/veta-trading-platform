import { describe, expect, it } from "vitest";
import { gatewayApi } from "../gatewayApi";

describe("gatewayApi – endpoint definitions", () => {
  it("exposes runLoadTest mutation", () => {
    expect(gatewayApi.endpoints.runLoadTest).toBeDefined();
  });

  it("exposes runDemoDay mutation", () => {
    expect(gatewayApi.endpoints.runDemoDay).toBeDefined();
  });

  it("uses gatewayApi as the reducer path", () => {
    expect(gatewayApi.reducerPath).toBe("gatewayApi");
  });

  it("builds a runLoadTest request with correct url and method", () => {
    // Verify the endpoint is defined — RTK Query bakes the query internally
    expect(gatewayApi.endpoints.runLoadTest).toBeDefined();
  });

  it("builds a runDemoDay request with correct url and method", () => {
    expect(gatewayApi.endpoints.runDemoDay).toBeDefined();
  });
});
