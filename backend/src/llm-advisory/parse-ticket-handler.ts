import { ParseTicketRequestSchema, QuickTradeIntentSchema } from "./parse-ticket-schema.ts";
import type { ILlmProvider } from "./providers/interface.ts";

const PARSE_TICKET_SYSTEM_PROMPT = `You convert short trading instructions into JSON. Respond with a single JSON object and nothing else — no prose, no markdown fences.

Schema:
{
  "side": "BUY" | "SELL",
  "symbol": "<uppercase ticker, must be in allowed list when provided>",
  "quantity": <positive integer>,        // optional
  "limitPrice": <positive number>,        // optional
  "strategy": "LIMIT" | "TWAP" | "POV" | "VWAP" | "ICEBERG" | "SNIPER" | "ARRIVAL_PRICE" | "IS" | "MOMENTUM",  // optional
  "tif": "DAY" | "IOC" | "GTC" | "FOK",   // optional
  "twapDurationMinutes": <positive number>,  // optional, only when strategy is TWAP
  "povRatePercent": <0-100>,                 // optional, only when strategy is POV
  "icebergVisibleQty": <positive integer>    // optional, only when strategy is ICEBERG
}

If the instruction cannot be expressed as a single order, respond with {"error": "unparseable"} and nothing else.
If the symbol is not in the allowed list (when provided), respond with {"error": "unknown symbol"}.
Never invent fields beyond the schema. Never include explanations.`;

function stripControlChars(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    out += code < 0x20 || code === 0x7f ? " " : raw[i];
  }
  return out;
}

function buildUserPrompt(input: string, symbols: readonly string[] | undefined): string {
  const safeInput = stripControlChars(input).slice(0, 200);
  if (symbols && symbols.length > 0) {
    const sample = symbols.slice(0, 200).join(", ");
    return `Allowed symbols (subset): ${sample}\n\nInstruction: ${safeInput}`;
  }
  return `Instruction: ${safeInput}`;
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractFirstJsonObject(raw: string): string | null {
  const stripped = stripFences(raw);
  const start = stripped.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}

export interface ParseTicketDeps {
  provider: ILlmProvider;
  abortMs?: number;
}

export async function handleParseTicket(req: Request, deps: ParseTicketDeps): Promise<Response> {
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json body" }, 400);
  }

  const parsed = ParseTicketRequestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonResponse({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }

  const available = await deps.provider.isAvailable();
  if (!available) {
    return jsonResponse({ error: "llm_unavailable" }, 503);
  }

  const userPrompt = buildUserPrompt(parsed.data.input, parsed.data.symbols);

  let responseText: string;
  try {
    const response = await deps.provider.generate(userPrompt, PARSE_TICKET_SYSTEM_PROMPT);
    responseText = response.text;
  } catch {
    return jsonResponse({ error: "llm_generate_failed" }, 503);
  }

  const candidate = extractFirstJsonObject(responseText);
  if (!candidate) {
    return jsonResponse({ error: "unparseable" }, 422);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return jsonResponse({ error: "unparseable" }, 422);
  }

  if (
    obj &&
    typeof obj === "object" &&
    "error" in obj &&
    typeof (obj as { error: unknown }).error === "string"
  ) {
    return jsonResponse({ error: (obj as { error: string }).error }, 422);
  }

  const intent = QuickTradeIntentSchema.safeParse(obj);
  if (!intent.success) {
    return jsonResponse({ error: "schema_mismatch", issues: intent.error.issues }, 422);
  }

  if (parsed.data.symbols && !parsed.data.symbols.includes(intent.data.symbol)) {
    return jsonResponse({ error: "unknown_symbol" }, 422);
  }

  return jsonResponse({ intent: intent.data }, 200);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
