// API Documentation Generator for VETA System
// This script analyzes the gateway routes to extract endpoint information

import { join } from "https://deno.land/std@0.210.0/path/mod.ts";

// Define the routes directory
const ROUTES_DIR = "./backend/src/gateway/routes";

// Define the output file
const OUTPUT_FILE = "./docs/api-endpoints.md";

// Define service mappings
const SERVICE_MAPPINGS = {
  "user-service": "User Service",
  "analytics": "Analytics Service",
  "market-data": "Market Data Service",
  "feature-engine": "Feature Engine",
  "signal-engine": "Signal Engine",
  "recommendation-engine": "Recommendation Engine",
  "scenario-engine": "Scenario Engine",
  "llm-advisory": "LLM Advisory Service",
  "ems": "EMS (Execution Management System)",
  "oms": "OMS (Order Management System)",
  "journal": "Journal Service",
  "market-sim": "Market Simulator",
  "fix-archive": "FIX Archive",
  "fix-gateway": "FIX Gateway",
  "kafka-relay": "Kafka Relay",
  "news-aggregator": "News Aggregator",
  "dark-pool": "Dark Pool",
  "ccp-service": "CCP Service",
  "rfq-service": "RFQ Service",
  "product-service": "Product Service",
  "replay": "Replay Service",
  "risk-engine": "Risk Engine",
};

// Extract endpoints from a route file by parsing the actual code structure
async function extractEndpointsFromRoute(routeFile: string): Promise<Array<{path: string, method: string, description: string, service?: string, requiresAuth: boolean}>> {
  const endpoints: Array<{path: string, method: string, description: string, service?: string, requiresAuth: boolean}> = [];
  
  try {
    const content = await Deno.readTextFile(routeFile);
    
    // Split content into lines for easier parsing
    const lines = content.split('\n');
    
    // Look for patterns in the code that define endpoints
    let currentPath = "";
    let currentMethod = "";
    let currentDescription = "";
    let currentService = "";
    let requiresAuth = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for path matching patterns
      const pathMatch = line.match(/path\s*===\s*"([^"]+)"/);
      if (pathMatch) {
        currentPath = pathMatch[1];
      }
      
      // Look for method matching patterns
      const methodMatch = line.match(/req\.method\s*===\s*"([^"]+)"/);
      if (methodMatch) {
        currentMethod = methodMatch[1];
      }
      
      // Look for service references
      const serviceMatch = line.match(/ctx\.urls\.([a-zA-Z0-9_-]+)/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
      }
      
      // Look for authentication requirements
      const authMatch = line.match(/await ctx\.requireAuth\(req\)/);
      if (authMatch) {
        requiresAuth = true;
      }
      
      // Look for comment lines that might contain descriptions
      if (line.startsWith("//") && !line.includes("function") && !line.includes("if (path") && !line.includes("return null")) {
        const comment = line.substring(2).trim();
        if (comment && !comment.startsWith("function")) {
          currentDescription = comment;
        }
      }
      
      // When we have a complete endpoint definition
      if (currentPath && currentMethod) {
        // Skip empty descriptions
        if (!currentDescription || currentDescription === "") {
          currentDescription = `Endpoint for ${currentPath}`;
        }
        
        const endpoint = {
          path: currentPath,
          method: currentMethod,
          description: currentDescription,
          service: SERVICE_MAPPINGS[currentService] || undefined,
          requiresAuth
        };
        
        endpoints.push(endpoint);
        
        // Reset for next endpoint
        currentPath = "";
        currentMethod = "";
        currentDescription = "";
        currentService = "";
        requiresAuth = false;
      }
    }
  } catch (error) {
    console.error(`Error reading ${routeFile}:`, error);
  }
  
  return endpoints;
}

// Extract endpoints from all route files
async function extractAllEndpoints(): Promise<Array<{path: string, method: string, description: string, service?: string, requiresAuth: boolean}>> {
  const endpoints: Array<{path: string, method: string, description: string, service?: string, requiresAuth: boolean}> = [];
  
  try {
    const routeFiles = await Deno.readDir(ROUTES_DIR);
    
    for await (const file of routeFiles) {
      if (file.isFile && file.name.endsWith(".ts")) {
        const routeFile = join(ROUTES_DIR, file.name);
        const fileEndpoints = await extractEndpointsFromRoute(routeFile);
        endpoints.push(...fileEndpoints);
      }
    }
  } catch (error) {
    console.error("Error reading route files:", error);
  }
  
  return endpoints;
}

// Generate markdown documentation
async function generateDocumentation(): Promise<void> {
  const endpoints = await extractAllEndpoints();
  
  let markdownContent = `# API Endpoints Documentation\n\n`;
  markdownContent += `This document describes all available API endpoints in the VETA system.\n\n`;
  
  // Group by service
  const groupedEndpoints: Record<string, Array<{path: string, method: string, description: string, service?: string, requiresAuth: boolean}>> = {};
  
  for (const endpoint of endpoints) {
    const service = endpoint.service || "General";
    if (!groupedEndpoints[service]) {
      groupedEndpoints[service] = [];
    }
    groupedEndpoints[service].push(endpoint);
  }
  
  // Generate documentation for each service
  for (const [service, serviceEndpoints] of Object.entries(groupedEndpoints)) {
    markdownContent += `## ${service}\n\n`;
    markdownContent += `| Method | Path | Description | Auth |\n`;
    markdownContent += `|--------|------|-------------|------|\n`;
    
    for (const endpoint of serviceEndpoints) {
      const authStatus = endpoint.requiresAuth ? "✅" : "❌";
      markdownContent += `| ${endpoint.method} | ${endpoint.path} | ${endpoint.description} | ${authStatus} |\n`;
    }
    
    markdownContent += `\n`;
  }
  
  // Add a summary table
  markdownContent += `## Summary\n\n`;
  markdownContent += `| Service | Endpoints | Auth Required |\n`;
  markdownContent += `|---------|-----------|---------------|\n`;
  
  for (const [service, serviceEndpoints] of Object.entries(groupedEndpoints)) {
    const authEndpoints = serviceEndpoints.filter(e => e.requiresAuth);
    const authStatus = authEndpoints.length > 0 ? "✅" : "❌";
    markdownContent += `| ${service} | ${serviceEndpoints.length} | ${authStatus} |\n`;
  }
  
  // Write to file
  await Deno.writeTextFile(OUTPUT_FILE, markdownContent);
  console.log(`Documentation generated successfully at ${OUTPUT_FILE}`);
}

// Run the documentation generation
await generateDocumentation();