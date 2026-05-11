import { z } from "zod";

export const QuickTradeIntentSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Z][A-Z0-9._-]*$/),
  quantity: z.number().int().positive().max(100_000_000).optional(),
  limitPrice: z.number().positive().max(1_000_000_000).optional(),
  strategy: z
    .enum(["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE", "IS", "MOMENTUM"])
    .optional(),
  tif: z.enum(["DAY", "IOC", "GTC", "FOK"]).optional(),
  twapDurationMinutes: z.number().positive().max(1440).optional(),
  povRatePercent: z.number().positive().max(100).optional(),
  icebergVisibleQty: z.number().int().positive().max(100_000_000).optional(),
});

export type QuickTradeIntent = z.infer<typeof QuickTradeIntentSchema>;

const BUY_WORDS = new Set(["buy", "b", "long", "bid"]);
const SELL_WORDS = new Set(["sell", "s", "short", "offer", "ask"]);

const STRATEGY_WORDS: Record<string, QuickTradeIntent["strategy"]> = {
  limit: "LIMIT",
  lim: "LIMIT",
  twap: "TWAP",
  pov: "POV",
  vwap: "VWAP",
  iceberg: "ICEBERG",
  ice: "ICEBERG",
  sniper: "SNIPER",
  arrival: "ARRIVAL_PRICE",
  ap: "ARRIVAL_PRICE",
  is: "IS",
  momentum: "MOMENTUM",
  mom: "MOMENTUM",
};

const TIF_WORDS: Record<string, QuickTradeIntent["tif"]> = {
  day: "DAY",
  ioc: "IOC",
  gtc: "GTC",
  fok: "FOK",
};

function parseQuantity(token: string): number | null {
  const m = token.match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([km])?$/i);
  if (!m) return null;
  const intPart = m[1].replace(/,/g, "");
  const fracPart = m[2] ?? "";
  const suffix = (m[3] ?? "").toLowerCase();
  const base = Number(`${intPart}.${fracPart || "0"}`);
  if (!Number.isFinite(base)) return null;
  const mult = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1;
  const qty = Math.round(base * mult);
  return qty > 0 ? qty : null;
}

function parsePrice(token: string): number | null {
  const cleaned = token.replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDurationMinutes(token: string): number | null {
  const m = token.match(/^(\d+(?:\.\d+)?)(s|m|h)$/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;
  const mins = unit === "s" ? value / 60 : unit === "h" ? value * 60 : value;
  return Math.round(mins * 100) / 100;
}

function parsePercent(token: string): number | null {
  const m = token.match(/^(\d{1,3}(?:\.\d+)?)%$/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : null;
}

export interface ParseQuickTradeContext {
  knownSymbols?: ReadonlySet<string>;
}

export function parseQuickTrade(
  input: string,
  ctx: ParseQuickTradeContext = {}
): QuickTradeIntent | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 200) return null;

  const tokens = raw
    .replace(/@/g, " @ ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length < 2) return null;

  let side: "BUY" | "SELL" | undefined;
  let symbol: string | undefined;
  let quantity: number | undefined;
  let limitPrice: number | undefined;
  let strategy: QuickTradeIntent["strategy"];
  let tif: QuickTradeIntent["tif"];
  let twapDurationMinutes: number | undefined;
  let povRatePercent: number | undefined;
  let icebergVisibleQty: number | undefined;
  let priceComesNext = false;

  for (const tok of tokens) {
    const lower = tok.toLowerCase();

    if (priceComesNext) {
      const px = parsePrice(tok);
      priceComesNext = false;
      if (px !== null) {
        limitPrice = px;
        continue;
      }
    }

    if (lower === "@") {
      priceComesNext = true;
      continue;
    }

    if (BUY_WORDS.has(lower)) {
      side = "BUY";
      continue;
    }
    if (SELL_WORDS.has(lower)) {
      side = "SELL";
      continue;
    }
    if (STRATEGY_WORDS[lower]) {
      strategy = STRATEGY_WORDS[lower];
      continue;
    }
    if (TIF_WORDS[lower]) {
      tif = TIF_WORDS[lower];
      continue;
    }

    if (strategy === "TWAP") {
      const mins = parseDurationMinutes(tok);
      if (mins !== null) {
        twapDurationMinutes = mins;
        continue;
      }
    }
    if (strategy === "POV") {
      const pct = parsePercent(tok);
      if (pct !== null) {
        povRatePercent = pct;
        continue;
      }
    }
    if (strategy === "ICEBERG") {
      const m = tok.match(/^visible=(\d+)$/i);
      if (m) {
        const v = Number(m[1]);
        if (Number.isFinite(v) && v > 0) {
          icebergVisibleQty = v;
          continue;
        }
      }
    }

    const qty = parseQuantity(tok);
    if (qty !== null && quantity === undefined) {
      quantity = qty;
      continue;
    }

    if (symbol === undefined && /^[A-Za-z][A-Za-z0-9._-]{0,15}$/.test(tok)) {
      symbol = tok.toUpperCase();
    }
  }

  if (!side || !symbol) return null;
  if (ctx.knownSymbols && !ctx.knownSymbols.has(symbol)) return null;

  const candidate = {
    side,
    symbol,
    quantity,
    limitPrice,
    strategy,
    tif,
    twapDurationMinutes,
    povRatePercent,
    icebergVisibleQty,
  };

  const parsed = QuickTradeIntentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
