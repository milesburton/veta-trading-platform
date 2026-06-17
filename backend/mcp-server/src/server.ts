/**
 * VETA Trading Platform - MCP Server
 * 
 * This is a simple Model Context Protocol (MCP) server that demonstrates
 * how AI models can securely interact with the VETA trading platform.
 * 
 * MCP provides a standardized way for AI models to:
 * - Access tools (functions they can invoke)
 * - Read resources (data they can query)
 * - Use prompts (predefined conversation templates)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Market data snapshot for a symbol */
interface MarketSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

/** Order status information */
interface OrderInfo {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  status: "pending" | "filled" | "cancelled" | "rejected";
  fillPrice?: number;
}

/** Trading signal from the intelligence pipeline */
interface TradingSignal {
  symbol: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  reason: string;
}

// ============================================================================
// SIMULATED DATA (In production, this would connect to real services)
// ============================================================================

const MOCK_MARKET_DATA: Record<string, MarketSnapshot> = {
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
  "MSFT": {
    symbol: "MSFT",
    bid: 378.90,
    ask: 378.95,
    last: 378.92,
    volume: 18760000,
    timestamp: new Date().toISOString(),
  },
  "TSLA": {
    symbol: "TSLA",
    bid: 248.50,
    ask: 248.60,
    last: 248.55,
    volume: 98450000,
    timestamp: new Date().toISOString(),
  },
  "AMZN": {
    symbol: "AMZN",
    bid: 178.10,
    ask: 178.15,
    last: 178.12,
    volume: 38920000,
    timestamp: new Date().toISOString(),
  },
};

const MOCK_ORDERS: OrderInfo[] = [
  {
    orderId: "ORD-001",
    symbol: "AAPL",
    side: "buy",
    quantity: 100,
    status: "filled",
    fillPrice: 178.45,
  },
  {
    orderId: "ORD-002",
    symbol: "GOOGL",
    side: "sell",
    quantity: 50,
    status: "pending",
  },
  {
    orderId: "ORD-003",
    symbol: "MSFT",
    side: "buy",
    quantity: 75,
    status: "rejected",
  },
];

const MOCK_SIGNALS: TradingSignal[] = [
  {
    symbol: "AAPL",
    direction: "bullish",
    confidence: 0.78,
    reason: "Positive momentum with increasing volume and breaking resistance",
  },
  {
    symbol: "TSLA",
    direction: "bearish",
    confidence: 0.65,
    reason: "Declining RSI with decreasing volume on up days",
  },
  {
    symbol: "GOOGL",
    direction: "neutral",
    confidence: 0.52,
    reason: "Mixed signals from technical indicators",
  },
];

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

/**
 * Create the MCP server instance.
 * 
 * The server name and version are used by MCP clients to identify
 * and connect to this service.
 */
const server = new McpServer({
  name: "veta-trading-platform",
  version: "1.0.0",
});

// ============================================================================
// TOOLS - Functions the AI can invoke
// ============================================================================

/**
 * Tool: get_market_data
 * 
 * This tool allows the AI to retrieve current market data for any symbol.
 * In a real implementation, this would call your market-data service.
 */
server.tool(
  "get_market_data",
  "Get current market data (bid, ask, last price, volume) for a trading symbol",
  {
    symbol: z.string().describe("Trading symbol (e.g., AAPL, GOOGL, MSFT)"),
  },
  async ({ symbol }) => {
    const data = MOCK_MARKET_DATA[symbol.toUpperCase()];
    
    if (!data) {
      return {
        content: [
          {
            type: "text",
            text: `No market data available for symbol: ${symbol}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: list_orders
 * 
 * This tool allows the AI to retrieve order information.
 */
server.tool(
  "list_orders",
  "List all orders with their current status",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(MOCK_ORDERS, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: get_trading_signals
 * 
 * This tool allows the AI to retrieve trading signals from the intelligence pipeline.
 */
server.tool(
  "get_trading_signals",
  "Get current trading signals from the intelligence pipeline",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(MOCK_SIGNALS, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: calculate_option_price
 * 
 * This tool demonstrates how the AI can use Black-Scholes pricing.
 */
server.tool(
  "calculate_option_price",
  "Calculate option price using Black-Scholes model",
  {
    underlyingPrice: z.number().describe("Current price of the underlying asset"),
    strikePrice: z.number().describe("Option strike price"),
    timeToExpiry: z.number().describe("Time to expiry in years"),
    volatility: z.number().describe("Annualized volatility (e.g., 0.25 for 25%)"),
    riskFreeRate: z.number().describe("Risk-free interest rate (e.g., 0.05 for 5%)"),
    optionType: z.enum(["call", "put"]).describe("Option type: call or put"),
  },
  async ({ underlyingPrice, strikePrice, timeToExpiry, volatility, riskFreeRate, optionType }) => {
    // Black-Scholes formula
    const d1 = (Math.log(underlyingPrice / strikePrice) + (riskFreeRate + volatility * volatility / 2) * timeToExpiry) / 
               (volatility * Math.sqrt(timeToExpiry));
    const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
    
    const normCDF = (x: number) => {
      // Approximation of standard normal CDF
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
    
    const price = optionType === "call"
      ? underlyingPrice * normCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normCDF(d2)
      : strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * (1 - normCDF(d2)) - underlyingPrice * (1 - normCDF(d1));
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            optionType,
            underlyingPrice,
            strikePrice,
            timeToExpiry,
            volatility,
            riskFreeRate,
            theoreticalPrice: Math.round(price * 100) / 100,
          }, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// RESOURCES - Data the AI can read
// ============================================================================

/**
 * Resource: market_data://{symbol}
 * 
 * Resources allow the AI to read data without invoking a tool.
 * This is useful for static or frequently-accessed data.
 */
server.resource(
  "market_data",
  "veta://market_data/{symbol}",
  async (uri) => {
    const symbol = uri.pathname.split("/").pop();
    const data = MOCK_MARKET_DATA[symbol?.toUpperCase() || ""];
    
    if (!data) {
      throw new Error(`No market data for symbol: ${symbol}`);
    }
    
    return {
      contents: [
        {
          uri: uri.href,
          name: `Market Data for ${symbol}`,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

/**
 * Resource: portfolio_summary
 * 
 * A summary resource that provides an overview of the trading portfolio.
 */
server.resource(
  "portfolio_summary",
  "veta://portfolio_summary",
  async () => {
    const summary = {
      totalOrders: MOCK_ORDERS.length,
      filledOrders: MOCK_ORDERS.filter(o => o.status === "filled").length,
      pendingOrders: MOCK_ORDERS.filter(o => o.status === "pending").length,
      availableSymbols: Object.keys(MOCK_MARKET_DATA),
      activeSignals: MOCK_SIGNALS.length,
    };
    
    return {
      contents: [
        {
          uri: "veta://portfolio_summary",
          name: "Portfolio Summary",
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// PROMPTS - Predefined conversation templates
// ============================================================================

/**
 * Prompt: market_analysis
 * 
 * A predefined prompt template for market analysis conversations.
 */
server.prompt(
  "market_analysis",
  "Analyze the current market conditions for a given symbol",
  {
    symbol: {
      description: "The trading symbol to analyze",
      required: true,
    },
  },
  ({ symbol }) => {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please analyze the current market conditions for ${symbol}. Consider the bid-ask spread, volume, and any available trading signals.`,
          },
        },
      ],
    };
  }
);

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the MCP server using stdio transport.
 * 
 * Stdio transport means the server communicates via standard input/output.
 * This is the simplest transport mechanism and works well for local tools.
 * 
 * In production, you might use HTTP transport instead:
 *   const server = new McpServer({ name: "veta", version: "1.0.0" });
 *   const httpServer = createServer((req, res) => {
 *     // Handle MCP requests over HTTP
 *   });
 *   httpServer.listen(3001);
 */
async function main() {
  const transport = new StdioServerTransport();
  
  console.error("Starting VETA MCP Server...");
  console.error("Available tools:");
  console.error("  - get_market_data: Get market data for a symbol");
  console.error("  - list_orders: List all orders");
  console.error("  - get_trading_signals: Get trading signals");
  console.error("  - calculate_option_price: Calculate option price using Black-Scholes");
  console.error("");
  console.error("Available resources:");
  console.error("  - veta://market_data/{symbol}: Market data for a symbol");
  console.error("  - veta://portfolio_summary: Portfolio summary");
  console.error("");
  console.error("Available prompts:");
  console.error("  - market_analysis: Analyze market conditions");
  
  await server.connect(transport);
  console.error("VETA MCP Server started successfully.");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
