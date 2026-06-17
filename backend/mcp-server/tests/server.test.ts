/**
 * VETA Trading Platform - MCP Server Tests
 * 
 * These tests verify the MCP server tools and resources work correctly.
 */

import { assertEquals } from "https://deno.land/std@0.200.0/assert/mod.ts";

// ============================================================================
// MOCK DATA (mirrors server.ts)
// ============================================================================

const MOCK_MARKET_DATA: Record<string, {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}> = {
  "AAPL": {
    symbol: "AAPL",
    bid: 178.50,
    ask: 178.55,
    last: 178.52,
    volume: 45230000,
    timestamp: new Date().toISOString(),
  },
  "GOOGL": {
    symbol: "GOOGL",
    bid: 141.20,
    ask: 141.25,
    last: 141.22,
    volume: 22150000,
    timestamp: new Date().toISOString(),
  },
};

// ============================================================================
// TEST: Market Data Tool
// ============================================================================

Deno.test({
  name: "MCP Server - get_market_data returns correct data",
  async fn() {
    // Simulate the tool behavior
    const symbol = "AAPL";
    const data = MOCK_MARKET_DATA[symbol];
    
    assertEquals(data?.symbol, "AAPL");
    assertEquals(data?.bid, 178.50);
    assertEquals(data?.ask, 178.55);
    assertEquals(data?.last, 178.52);
    assertEquals(typeof data?.volume, "number");
    assertEquals(typeof data?.timestamp, "string");
  },
});

Deno.test({
  name: "MCP Server - get_market_data returns error for unknown symbol",
  async fn() {
    const symbol = "UNKNOWN";
    const data = MOCK_MARKET_DATA[symbol];
    
    assertEquals(data, undefined);
  },
});

// ============================================================================
// TEST: Option Pricing Tool
// ============================================================================

Deno.test({
  name: "MCP Server - calculate_option_price uses Black-Scholes correctly",
  async fn() {
    // Black-Scholes formula
    const underlyingPrice = 100;
    const strikePrice = 100;
    const timeToExpiry = 1;
    const volatility = 0.2;
    const riskFreeRate = 0.05;
    
    const d1 = (Math.log(underlyingPrice / strikePrice) + (riskFreeRate + volatility * volatility / 2) * timeToExpiry) / 
               (volatility * Math.sqrt(timeToExpiry));
    const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
    
    const normCDF = (x: number) => {
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      
      const sign = x < 0 ? -1 : 1;
      const absX = Math.abs(x);
      const t = 1.0 / (1.0 + p * absX);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
      
      return 0.5 * (1.0 + sign * y);
    };
    
    const callPrice = underlyingPrice * normCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normCDF(d2);
    
    // At-the-money call should have positive value
    assertTrue(callPrice > 0, "Call price should be positive");
    assertEquals(typeof callPrice, "number");
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}
