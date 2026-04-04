/**
 * Product Service — Structured product builder
 *
 * Manages the lifecycle of structured products (CDO-like baskets)
 * from draft through to sale via the RFQ workflow.
 *
 * State machine: draft → structured → issued → sold → unwound
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("PRODUCT_SERVICE_PORT")) || 5_030;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type ProductState = "draft" | "structured" | "issued" | "sold" | "unwound";

interface ProductLeg {
  legId: string;
  type: "equity" | "bond" | "option";
  symbol: string;
  weight: number; // fraction 0-1, must sum to 1.0 across all legs
  quantity?: number; // computed: Math.round(weight * targetNotional / price), snapped to lotSize
  estimatedPrice?: number;
  isin?: string;
  optionSpec?: { strike: number; expiry: string; putCall: "CALL" | "PUT" };
}

interface Product {
  productId: string;
  name: string;
  description: string;
  state: ProductState;
  legs: ProductLeg[];
  targetNotional: number;
  currency: string;
  createdBy: string; // userId of creator
  issuedAt?: number;
  soldTo?: string; // clientUserId when sold
  rfqId?: string; // the sell-side RFQ used to sell it
  createdAt: number;
  updatedAt: number;
}

const productStore = new Map<string, Product>();

let productSeq = 1;
function nextProductId(): string {
  return `PROD${String(productSeq++).padStart(6, "0")}`;
}

let legSeq = 1;
function nextLegId(): string {
  return `LEG${String(legSeq++).padStart(4, "0")}`;
}

const producer = await createProducer("product-service").catch(
  (err: unknown) => {
    console.warn(
      "[product-service] Kafka producer unavailable:",
      (err as Error).message,
    );
    return null;
  },
);

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/health" && method === "GET") {
    return jsonOk({
      service: "product-service",
      version: VERSION,
      status: "ok",
    });
  }

  // GET /products/stats — MUST be checked before /:id route
  if (path === "/products/stats" && method === "GET") {
    const counts: Record<ProductState, number> = {
      draft: 0,
      structured: 0,
      issued: 0,
      sold: 0,
      unwound: 0,
    };
    for (const p of productStore.values()) {
      counts[p.state] = (counts[p.state] ?? 0) + 1;
    }
    return jsonOk({ counts, total: productStore.size });
  }

  if (path === "/products" && method === "POST") {
    let body: {
      name?: string;
      description?: string;
      targetNotional?: number;
      currency?: string;
      createdBy?: string;
      legs?: Array<{
        type: "equity" | "bond" | "option";
        symbol: string;
        weight: number;
        isin?: string;
        optionSpec?: {
          strike: number;
          expiry: string;
          putCall: "CALL" | "PUT";
        };
      }>;
    };
    try {
      body = await req.json() as typeof body;
    } catch {
      return jsonErr("Invalid JSON body", 400);
    }

    if (!body.name) return jsonErr("name is required", 400);
    if (!body.createdBy) return jsonErr("createdBy is required", 400);
    if (body.targetNotional === undefined || body.targetNotional <= 0) {
      return jsonErr("targetNotional must be a positive number", 400);
    }

    const now = Date.now();
    const rawLegs = body.legs ?? [];
    const legs: ProductLeg[] = rawLegs.map((l) => ({
      legId: nextLegId(),
      type: l.type,
      symbol: l.symbol,
      weight: l.weight,
      isin: l.isin,
      optionSpec: l.optionSpec,
    }));

    const product: Product = {
      productId: nextProductId(),
      name: body.name,
      description: body.description ?? "",
      state: "draft",
      legs,
      targetNotional: body.targetNotional,
      currency: body.currency ?? "USD",
      createdBy: body.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    productStore.set(product.productId, product);
    producer?.send("products.created", product).catch(() => {});

    return jsonOk(product, 201);
  }

  if (path === "/products" && method === "GET") {
    const stateFilter = url.searchParams.get("state") as ProductState | null;
    const userIdParam = url.searchParams.get("userId");
    const userRoleParam = url.searchParams.get("userRole");

    let products = Array.from(productStore.values());

    if (userRoleParam === "external-client" && userIdParam) {
      products = products.filter((p) =>
        p.state === "issued" || p.state === "sold"
      );
    }

    if (stateFilter) {
      products = products.filter((p) => p.state === stateFilter);
    }

    products.sort((a, b) => b.createdAt - a.createdAt);

    return jsonOk(products);
  }

  const matchProduct = path.match(/^\/products\/([^/]+)$/);
  if (matchProduct && method === "GET") {
    const product = productStore.get(matchProduct[1]);
    if (!product) return jsonErr("Product not found", 404);
    return jsonOk(product);
  }

  const matchLegs = path.match(/^\/products\/([^/]+)\/legs$/);
  if (matchLegs && method === "PUT") {
    const product = productStore.get(matchLegs[1]);
    if (!product) return jsonErr("Product not found", 404);
    if (product.state !== "draft") {
      return jsonErr(
        `Cannot update legs: product is in '${product.state}' state (must be 'draft')`,
        400,
      );
    }

    let body: {
      legs?: Array<{
        type: "equity" | "bond" | "option";
        symbol: string;
        weight: number;
        isin?: string;
        optionSpec?: {
          strike: number;
          expiry: string;
          putCall: "CALL" | "PUT";
        };
      }>;
    };
    try {
      body = await req.json() as typeof body;
    } catch {
      return jsonErr("Invalid JSON body", 400);
    }

    const rawLegs = body.legs ?? [];
    const legs: ProductLeg[] = rawLegs.map((l) => ({
      legId: nextLegId(),
      type: l.type,
      symbol: l.symbol,
      weight: l.weight,
      isin: l.isin,
      optionSpec: l.optionSpec,
    }));

    product.legs = legs;
    product.updatedAt = Date.now();
    productStore.set(product.productId, product);

    return jsonOk(product);
  }

  const matchStructure = path.match(/^\/products\/([^/]+)\/structure$/);
  if (matchStructure && method === "PUT") {
    const product = productStore.get(matchStructure[1]);
    if (!product) return jsonErr("Product not found", 404);
    if (product.state !== "draft") {
      return jsonErr(
        `Cannot structure: product is in '${product.state}' state (must be 'draft')`,
        400,
      );
    }
    if (product.legs.length === 0) {
      return jsonErr("Cannot structure: product has no legs", 400);
    }

    const weightSum = product.legs.reduce((s, l) => s + l.weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.001) {
      return jsonErr(
        `Weights must sum to 1.0 (currently ${weightSum.toFixed(4)})`,
        400,
      );
    }

    product.state = "structured";
    product.updatedAt = Date.now();
    productStore.set(product.productId, product);
    producer?.send("products.updated", product).catch(() => {});

    return jsonOk(product);
  }

  const matchIssue = path.match(/^\/products\/([^/]+)\/issue$/);
  if (matchIssue && method === "PUT") {
    const product = productStore.get(matchIssue[1]);
    if (!product) return jsonErr("Product not found", 404);
    if (product.state !== "structured") {
      return jsonErr(
        `Cannot issue: product is in '${product.state}' state (must be 'structured')`,
        400,
      );
    }

    product.state = "issued";
    product.issuedAt = Date.now();
    product.updatedAt = Date.now();
    productStore.set(product.productId, product);
    producer?.send("products.updated", product).catch(() => {});

    return jsonOk(product);
  }

  const matchSell = path.match(/^\/products\/([^/]+)\/sell$/);
  if (matchSell && method === "PUT") {
    const product = productStore.get(matchSell[1]);
    if (!product) return jsonErr("Product not found", 404);
    if (product.state !== "issued") {
      return jsonErr(
        `Cannot sell: product is in '${product.state}' state (must be 'issued')`,
        400,
      );
    }

    let body: { soldTo?: string; rfqId?: string };
    try {
      body = await req.json() as typeof body;
    } catch {
      body = {};
    }

    product.state = "sold";
    product.soldTo = body.soldTo;
    product.rfqId = body.rfqId;
    product.updatedAt = Date.now();
    productStore.set(product.productId, product);
    producer?.send("products.sold", product).catch(() => {});

    return jsonOk(product);
  }

  const matchUnwind = path.match(/^\/products\/([^/]+)\/unwind$/);
  if (matchUnwind && method === "PUT") {
    const product = productStore.get(matchUnwind[1]);
    if (!product) return jsonErr("Product not found", 404);
    if (product.state !== "sold") {
      return jsonErr(
        `Cannot unwind: product is in '${product.state}' state (must be 'sold')`,
        400,
      );
    }

    product.state = "unwound";
    product.updatedAt = Date.now();
    productStore.set(product.productId, product);
    producer?.send("products.updated", product).catch(() => {});

    return jsonOk(product);
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});

console.log(`[product-service] Listening on port ${PORT}`);
