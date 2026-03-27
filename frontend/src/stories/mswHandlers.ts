import { HttpResponse, http } from "msw";
import { MOCK_ASSETS } from "./mockData.ts";

export const defaultHandlers = [
  http.get("/api/gateway/assets", () => {
    return HttpResponse.json(MOCK_ASSETS);
  }),

  http.get("/api/gateway/market-data/sources", () => {
    return HttpResponse.json([
      { symbol: "AAPL", source: "alpha-vantage" },
      { symbol: "MSFT", source: "synthetic" },
    ]);
  }),

  http.get("/api/gateway/market-data/overrides", () => {
    return HttpResponse.json({ overrides: {} });
  }),

  http.post("/api/gateway/analytics/quote", () => {
    return HttpResponse.json({
      price: 8.42,
      delta: 0.52,
      gamma: 0.018,
      theta: -0.045,
      vega: 0.23,
      rho: 0.031,
      impliedVol: 0.285,
    });
  }),

  http.post("/api/gateway/analytics/bond-price", () => {
    return HttpResponse.json({
      price: 98.75,
      yieldToMaturity: 0.0487,
      duration: 7.34,
      convexity: 62.1,
      dv01: 0.0071,
    });
  }),

  http.post("/api/gateway/demo-day", () => {
    return HttpResponse.json({
      success: true,
      submitted: 42,
      scenario: "standard",
      elapsedMs: 350,
    });
  }),

  http.post("/api/gateway/grid/query", () => {
    return HttpResponse.json({ rows: [], total: 0 });
  }),
];
