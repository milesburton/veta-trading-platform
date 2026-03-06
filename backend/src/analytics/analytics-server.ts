/**
 * Analytics Service — port 5014
 *
 * Endpoints (all POST, JSON body):
 *   POST /quote        — Black-Scholes option price + Greeks
 *   POST /scenario     — Scenario matrix (spot/vol shocks) with Monte Carlo
 *   POST /recommend    — Rule-based trade recommendations
 *   GET  /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { blackScholes } from "./black-scholes.ts";
import { monteCarlo } from "./monte-carlo.ts";
import { DEFAULT_EXPIRIES_SECS, generateStrikes, scoreOption } from "./recommendation-engine.ts";
import type {
  OptionQuoteRequest,
  OptionQuoteResponse,
  RecommendationRequest,
  RecommendationResponse,
  ScenarioCell,
  ScenarioRequest,
  ScenarioResponse,
} from "./types.ts";
import { estimateVol, fetchSpotPrice } from "./volatility-estimator.ts";

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

    const { symbol, riskFreeRate = 0.05, strikes: reqStrikes, expiries: reqExpiries } = body;
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
          recommendations.push(scoreOption(optionType, spot, K, T, riskFreeRate, sigma));
        }
      }
    }

    // Sort by score descending
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

  return new Response("Not Found", { status: 404, headers: CORS });
});

console.log(`[analytics] Analytics service running on port ${PORT}`);
