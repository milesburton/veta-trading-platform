/**
 * VETA Trading Platform - MCP Client Example
 * 
 * This demonstrates how to connect to the MCP server from a client application.
 * In production, this would be used by the frontend or other services.
 */

import { McpClient } from "@modelcontextprotocol/sdk/client/mcp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ============================================================================
// MCP CLIENT SETUP
// ============================================================================

/**
 * Create an MCP client and connect to the server.
 * 
 * The client discovers what tools, resources, and prompts the server offers,
 * then can invoke them in a standardized way.
 */
async function main() {
  // Connect to the MCP server via stdio
  const transport = new StdioClientTransport({
    command: "deno",
    args: ["run", "--allow-all", "backend/mcp-server/src/server.ts"],
  });

  const client = new McpClient({
    name: "veta-mcp-client",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);

    // ====== DISCOVER CAPABILITIES ============================
    
    console.log("\n=== Discovered Tools ===");
    const tools = await client.listTools();
    tools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    console.log("\n=== Discovered Resources ===");
    const resources = await client.listResources();
    resources.forEach((resource) => {
      console.log(`  - ${resource.uri}: ${resource.name}`);
    });

    console.log("\n=== Discovered Prompts ===");
    const prompts = await client.listPrompts();
    prompts.forEach((prompt) => {
      console.log(`  - ${prompt.name}: ${prompt.description}`);
    });

    // ====== USE TOOLS ========================================
    
    console.log("\n=== Using Tool: get_market_data ===");
    const marketData = await client.callTool("get_market_data", {
      symbol: "AAPL",
    });
    console.log(marketData);

    console.log("\n=== Using Tool: list_orders ===");
    const orders = await client.callTool("list_orders", {});
    console.log(orders);

    console.log("\n=== Using Tool: calculate_option_price ===");
    const optionPrice = await client.callTool("calculate_option_price", {
      underlyingPrice: 178.52,
      strikePrice: 180,
      timeToExpiry: 0.25,
      volatility: 0.25,
      riskFreeRate: 0.05,
      optionType: "call",
    });
    console.log(optionPrice);

    // ====== READ RESOURCES ===================================
    
    console.log("\n=== Reading Resource: market_data ===");
    const resourceData = await client.readResource("veta://market_data/GOOGL");
    console.log(resourceData);

    console.log("\n=== Reading Resource: portfolio_summary ===");
    const portfolioSummary = await client.readResource("veta://portfolio_summary");
    console.log(portfolioSummary);

    // ====== USE PROMPTS ======================================
    
    console.log("\n=== Using Prompt: market_analysis ===");
    const prompt = await client.getPrompt("market_analysis", {
      symbol: "TSLA",
    });
    console.log(prompt);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

main();
