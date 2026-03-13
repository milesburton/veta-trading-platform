/**
 * Analytics Service — port 5014
 *
 * Endpoints:
 *   POST /quote                    — Black-Scholes option price + Greeks
 *   POST /scenario                 — Scenario matrix (spot/vol shocks) with Monte Carlo
 *   POST /recommend                — Trade recommendations (rule-based or signal-driven)
 *   GET  /vol-profile/:symbol      — EWMA vol trend series for charting
 *   GET  /greeks-surface/:symbol   — Greeks across strike range at given expiry
 *   POST /bond-price               — Bond pricing (DCF, duration, convexity, DV01)
 *   POST /yield-curve              — Nelson-Siegel spot curve + forward rates
 *   GET  /price-fan/:symbol        — GBM forward price fan (p5/p25/p50/p75/p95)
 *   POST /spread-analysis          — Z-spread, G-spread, OAS vs Nelson-Siegel curve
 *   POST /duration-ladder          — Key-rate DV01 ladder for a bond portfolio
 *   GET  /vol-surface/:symbol      — Implied vol surface (5 expiries × 9 strikes)
 *   GET  /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { blackScholes } from "./black-scholes.ts";
import { priceBond } from "./bond-pricing.ts";
import { monteCarlo } from "./monte-carlo.ts";
import { priceFan } from "./price-fan.ts";
import {
  DEFAULT_EXPIRIES_SECS,
  generateStrikes,
  scoreOption,
  scoreOptionWithSignal,
} from "./recommendation-engine.ts";
import type {
  BondPriceRequest,
  BondPriceResponse,
  GreeksSurfacePoint,
  GreeksSurfaceResponse,
  OptionQuoteRequest,
  OptionQuoteResponse,
  PriceFanResponse,
  RecommendationRequest,
  RecommendationResponse,
  ScenarioCell,
  ScenarioRequest,
  ScenarioResponse,
  VolProfileResponse,
  YieldCurveRequest,
  YieldCurveResponse,
} from "./types.ts";
import { estimateVol, estimateVolProfile, fetchSpotPrice } from "./volatility-estimator.ts";
import { buildYieldCurveResponse, fetchFredParams } from "./yield-curve.ts";
import { computeSpreadAnalysis } from "./spread-analysis.ts";
import type { SpreadAnalysisRequest } from "./spread-analysis.ts";
import { computeDurationLadder } from "./duration-ladder.ts";
import type { BondPosition } from "./duration-ladder.ts";
import { buildVolSurface } from "./vol-surface.ts";

const PORT = Number(Deno.env.get("ANALYTICS_PORT")) || 5_014;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${Deno.env.get("JOURNAL_PORT") ?? "5009"}`;
const MARKET_SIM_URL = `http://${Deno.env.get("MARKET_SIM_HOST") ?? "localhost"}:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ── Spot price resolution ─────────────────────────────────────────────────────

/** Asset initial prices from market-sim — cached for the life of the process. */
const assetPriceCache = new Map<string, number>();

async function resolveSpot(symbol: string): Promise<number | null> {
  // 1. Try journal (most recent traded price)
  const spot = await fetchSpotPrice(JOURNAL_URL, symbol);
  if (spot !== null) return spot;

  // 2. Fallback to market-sim asset list (initialPrice)
  if (assetPriceCache.has(symbol)) return assetPriceCache.get(symbol)!;
  try {
    const res = await fetch(`${MARKET_SIM_URL}/assets`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const assets = await res.json() as { symbol: string; initialPrice: number }[];
      for (const a of assets) assetPriceCache.set(a.symbol, a.initialPrice);
      if (assetPriceCache.has(symbol)) return assetPriceCache.get(symbol)!;
    }
  } catch { /* ignore */ }

  return null;
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (path === "/health" && req.method === "GET") {
    return json({ service: "analytics", version: VERSION, status: "ok" });
  }

  // ── POST /quote ─────────────────────────────────────────────────────────────
  if (path === "/quote" && req.method === "POST") {
    let body: OptionQuoteRequest;
    try {
      body = await req.json() as OptionQuoteRequest;
    } catch {
      return err("Invalid JSON body");
    }

    const { symbol, optionType, strike, expirySecs, riskFreeRate = 0.05 } = body;
    if (!symbol || !optionType || !strike || !expirySecs) {
      return err("Missing required fields: symbol, optionType, strike, expirySecs");
    }

    const spot = await resolveSpot(symbol);
    if (spot === null) return err(`Cannot resolve spot price for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    const T = expirySecs / (365 * 86400);
    const { price, greeks } = blackScholes(optionType, spot, strike, T, riskFreeRate, sigma);

    const response: OptionQuoteResponse = {
      symbol,
      optionType,
      strike,
      expirySecs,
      spotPrice: spot,
      impliedVol: sigma,
      price,
      greeks,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── POST /scenario ──────────────────────────────────────────────────────────
  if (path === "/scenario" && req.method === "POST") {
    let body: ScenarioRequest;
    try {
      body = await req.json() as ScenarioRequest;
    } catch {
      return err("Invalid JSON body");
    }

    const {
      symbol, optionType, strike, expirySecs, riskFreeRate = 0.05,
      spotShocks, volShocks, timeDays = 0, paths = 1000,
    } = body;

    if (!symbol || !optionType || !strike || !expirySecs || !spotShocks?.length || !volShocks?.length) {
      return err("Missing required fields");
    }

    const spot = await resolveSpot(symbol);
    if (spot === null) return err(`Cannot resolve spot price for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    const baseT = expirySecs / (365 * 86400);
    const timeElapsed = timeDays / 365;
    const adjustedT = Math.max(0, baseT - timeElapsed);

    const { price: baselinePrice } = blackScholes(optionType, spot, strike, baseT, riskFreeRate, sigma);

    const cells: ScenarioCell[][] = spotShocks.map((spotPct) => {
      const shockedSpot = spot * (1 + spotPct);
      return volShocks.map((volPct) => {
        const shockedSigma = Math.max(0.001, sigma + volPct);
        const { price: optionPrice } = blackScholes(optionType, shockedSpot, strike, adjustedT, riskFreeRate, shockedSigma);
        const pnl = optionPrice - baselinePrice;
        const pnlPct = baselinePrice > 0 ? pnl / baselinePrice : 0;
        const seedKey = `${symbol}-${optionType}-${strike}-${expirySecs}-${spotPct.toFixed(3)}-${volPct.toFixed(3)}`;
        const mc = monteCarlo(optionType, shockedSpot, strike, adjustedT, riskFreeRate, shockedSigma, paths, seedKey);
        return { spotPct, volPct, optionPrice, pnl, pnlPct, ...mc };
      });
    });

    const response: ScenarioResponse = {
      symbol, optionType, strike, expirySecs,
      spotPrice: spot, impliedVol: sigma, baselinePrice,
      spotShocks, volShocks, cells,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── POST /recommend ─────────────────────────────────────────────────────────
  if (path === "/recommend" && req.method === "POST") {
    let body: RecommendationRequest;
    try {
      body = await req.json() as RecommendationRequest;
    } catch {
      return err("Invalid JSON body");
    }

    const { symbol, riskFreeRate = 0.05, strikes: reqStrikes, expiries: reqExpiries, signal } = body;
    if (!symbol) return err("Missing required field: symbol");

    const spot = await resolveSpot(symbol);
    if (spot === null) return err(`Cannot resolve spot price for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    const strikes = reqStrikes ?? generateStrikes(spot);
    const expiries = reqExpiries ?? DEFAULT_EXPIRIES_SECS;

    const recommendations = [];
    for (const K of strikes) {
      for (const expirySecs of expiries) {
        const T = expirySecs / (365 * 86400);
        for (const optionType of ["call", "put"] as const) {
          const rec = signal
            ? scoreOptionWithSignal(optionType, spot, K, T, riskFreeRate, sigma, signal)
            : scoreOption(optionType, spot, K, T, riskFreeRate, sigma);
          recommendations.push(rec);
        }
      }
    }

    recommendations.sort((a, b) => b.score - a.score);

    const response: RecommendationResponse = {
      symbol,
      spotPrice: spot,
      impliedVol: sigma,
      recommendations,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── GET /vol-profile/:symbol ─────────────────────────────────────────────────
  if (path.startsWith("/vol-profile/") && req.method === "GET") {
    const symbol = decodeURIComponent(path.slice("/vol-profile/".length));
    if (!symbol) return err("Missing symbol");

    const profile = await estimateVolProfile(JOURNAL_URL, symbol);
    if (!profile) return err(`Insufficient candle data for ${symbol}`, 404);

    const spot = await resolveSpot(symbol);

    const response: VolProfileResponse = {
      symbol,
      spotPrice: spot,
      ewmaVol: profile.ewmaVol,
      rollingVol: profile.rollingVol,
      series: profile.ewmaSeries,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── GET /greeks-surface/:symbol ──────────────────────────────────────────────
  if (path.startsWith("/greeks-surface/") && req.method === "GET") {
    const symbol = decodeURIComponent(path.slice("/greeks-surface/".length));
    if (!symbol) return err("Missing symbol");

    const expirySecs = Number(url.searchParams.get("expirySecs")) || 30 * 86400;
    const riskFreeRate = Number(url.searchParams.get("riskFreeRate")) || 0.05;

    const spot = await resolveSpot(symbol);
    if (!spot) return err(`Cannot resolve spot for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    const T = expirySecs / (365 * 86400);

    // 25 strikes from 70% to 130% of spot
    const strikePoints: GreeksSurfacePoint[] = Array.from({ length: 25 }, (_, i) => {
      const K = spot * (0.70 + i * (0.60 / 24));
      const { price: callPrice, greeks } = blackScholes("call", spot, K, T, riskFreeRate, sigma);
      return {
        strike: K,
        moneyness: K / spot,
        callDelta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
        callPrice,
      };
    });

    const response: GreeksSurfaceResponse = {
      symbol,
      spotPrice: spot,
      impliedVol: sigma,
      expirySecs,
      strikes: strikePoints,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── POST /bond-price ──────────────────────────────────────────────────────────
  if (path === "/bond-price" && req.method === "POST") {
    let body: BondPriceRequest;
    try {
      body = await req.json() as BondPriceRequest;
    } catch {
      return err("Invalid JSON body");
    }

    const { couponRate, totalPeriods, yieldAnnual } = body;
    if (couponRate == null || totalPeriods == null || yieldAnnual == null) {
      return err("Missing required fields: couponRate, totalPeriods, yieldAnnual");
    }

    const response: BondPriceResponse = priceBond(body);
    return json(response);
  }

  // ── POST /yield-curve ─────────────────────────────────────────────────────────
  if (path === "/yield-curve" && req.method === "POST") {
    let body: YieldCurveRequest = {};
    try {
      body = await req.json() as YieldCurveRequest;
    } catch { /* empty body is fine */ }

    // Use real FRED Treasury rates when available; caller params override
    const fredParams = await fetchFredParams();
    const response: YieldCurveResponse = buildYieldCurveResponse({ ...fredParams, ...body.params });
    return json(response);
  }

  // ── GET /price-fan/:symbol ────────────────────────────────────────────────────
  if (path.startsWith("/price-fan/") && req.method === "GET") {
    const symbol = decodeURIComponent(path.slice("/price-fan/".length));
    if (!symbol) return err("Missing symbol");

    const steps = Math.max(1, Math.min(200, Number(url.searchParams.get("steps")) || 24));
    const stepSecs = Math.max(60, Number(url.searchParams.get("stepSecs")) || 3600);
    const paths = Math.max(100, Math.min(2000, Number(url.searchParams.get("paths")) || 500));
    const riskFreeRate = Number(url.searchParams.get("riskFreeRate")) || 0.05;

    const spot = await resolveSpot(symbol);
    if (spot === null) return err(`Cannot resolve spot price for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    const seedKey = `fan-${symbol}-${steps}-${stepSecs}`;

    const fanSteps = priceFan(spot, sigma, riskFreeRate, steps, stepSecs, paths, seedKey);

    const response: PriceFanResponse = {
      symbol,
      spotPrice: spot,
      impliedVol: sigma,
      riskFreeRate,
      steps: fanSteps,
      computedAt: Date.now(),
    };
    return json(response);
  }

  // ── POST /spread-analysis ────────────────────────────────────────────────────
  if (path === "/spread-analysis" && req.method === "POST") {
    let body: SpreadAnalysisRequest;
    try {
      body = await req.json() as SpreadAnalysisRequest;
    } catch {
      return err("Invalid JSON body");
    }
    const { couponRate, totalPeriods, yieldAnnual } = body;
    if (couponRate == null || totalPeriods == null || yieldAnnual == null) {
      return err("Missing required fields: couponRate, totalPeriods, yieldAnnual");
    }
    return json(computeSpreadAnalysis(body));
  }

  // ── POST /duration-ladder ─────────────────────────────────────────────────────
  if (path === "/duration-ladder" && req.method === "POST") {
    let body: { positions: BondPosition[] };
    try {
      body = await req.json() as { positions: BondPosition[] };
    } catch {
      return err("Invalid JSON body");
    }
    if (!body.positions?.length) {
      return err("positions array required and must be non-empty");
    }
    return json(computeDurationLadder(body.positions));
  }

  // ── GET /vol-surface/:symbol ──────────────────────────────────────────────────
  if (path.startsWith("/vol-surface/") && req.method === "GET") {
    const symbol = decodeURIComponent(path.slice("/vol-surface/".length));
    if (!symbol) return err("Missing symbol");

    const spot = await resolveSpot(symbol);
    if (spot === null) return err(`Cannot resolve spot price for ${symbol}`, 404);

    const sigma = await estimateVol(JOURNAL_URL, symbol);
    return json(buildVolSurface(symbol, spot, sigma));
  }

  return new Response("Not Found", { status: 404, headers: CORS });
});

console.log(`[analytics] Analytics service running on port ${PORT}`);
