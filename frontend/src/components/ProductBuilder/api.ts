export type ProductState = "draft" | "structured" | "issued" | "sold" | "unwound";

interface ProductResponse {
  productId?: string;
  state?: ProductState;
  error?: string;
}

export interface SavedProduct {
  productId: string;
  state: ProductState;
}

interface ParsedResult {
  ok: boolean;
  saved?: SavedProduct;
  error?: string;
}

async function parseProductResponse(res: Response, fallbackError: string): Promise<ParsedResult> {
  const data = (await res.json()) as ProductResponse;
  if (!res.ok) {
    return { ok: false, error: data.error ?? fallbackError };
  }
  return {
    ok: true,
    saved: {
      productId: data.productId as string,
      state: data.state as ProductState,
    },
  };
}

export interface ProductLegPayload {
  type: string;
  symbol: string;
  weight: number;
  isin?: string;
  optionSpec?: {
    strike: number;
    expiry: string;
    putCall: "CALL" | "PUT";
  };
}

export interface CreateProductPayload {
  name: string;
  description: string;
  targetNotional: number;
  currency: "USD";
  createdBy: string;
  legs: ProductLegPayload[];
}

export async function createProduct(payload: CreateProductPayload): Promise<ParsedResult> {
  const res = await fetch("/api/gateway/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseProductResponse(res, "Failed to create product.");
}

export async function updateProductLegs(
  productId: string,
  legs: ProductLegPayload[]
): Promise<ParsedResult> {
  const res = await fetch(`/api/gateway/products/${productId}/legs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legs }),
  });
  return parseProductResponse(res, "Failed to update legs.");
}

export async function transitionProduct(
  productId: string,
  action: "structure" | "issue"
): Promise<ParsedResult> {
  const res = await fetch(`/api/gateway/products/${productId}/${action}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return parseProductResponse(res, `Failed to ${action} product.`);
}
