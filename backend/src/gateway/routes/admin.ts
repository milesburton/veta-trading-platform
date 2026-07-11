import { CORS_HEADERS } from "@veta/http";
import { type AuthResult, type GatewayContext, isResponse } from "../context.ts";

type OrderSpec = {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPriceFactor: number;
  strategy: string;
  algoParams: Record<string, unknown>;
  expiresAt: number;
  delayMs: number;
};

function requireAdmin(auth: AuthResult): Response | null {
  if (auth.user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  return null;
}

function requireAdminOrOncall(auth: AuthResult): Response | null {
  if (auth.user.role !== "admin" && auth.user.role !== "oncall") {
    return new Response(JSON.stringify({ error: "Admin or oncall role required" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  return null;
}

function busUnavailable(producerReady: boolean): Response | null {
  if (producerReady) return null;
  return new Response(JSON.stringify({ error: "Bus unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Synthetic orders emitted by admin/oncall tooling (load-test, demo-day) must
// be attributed to a real trader persona, never to the invoking admin —
// administrators must never appear as the originator of a trade in the
// pipeline. The personas come from LOAD_TEST_USER_IDS (existing trader ids).
export function testTraderIds(): string[] {
  return (Deno.env.get("LOAD_TEST_USER_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Uniform float in [0, 1) used only for *simulation jitter* in the
// admin load-generator below (order side/size/strategy spread, delays).
// It is not used for keys, tokens, nonces or any security decision.
//
// The construction is the canonical full-precision 53-bit mantissa form:
// take 53 random bits (27 + 26) and divide by 2^53. Every representable
// double in [0, 1) is produced with equal probability, so the result is
// unbiased — there is no rounding or modulo that could skew the
// distribution.
//
// codeql[js/biased-cryptographic-random]: false positive — this is the
// standard unbiased 53-bit-to-double conversion, not a biased
// division/modulo, and the value is non-cryptographic simulation jitter.
function secureRandomFloat(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const hi = buf[0] >>> 5; // top 27 bits
  const lo = buf[1] >>> 6; // top 26 bits
  return (hi * 2 ** 26 + lo) * 2 ** -53;
}

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function makeWave(
  assets: string[],
  count: number,
  strategyMix: Array<{ strategy: string; algoParams: Record<string, unknown>; weight: number }>,
  sideRatio = 0.6,
  baseDelay = 0,
  spreadMs = 8_000
): OrderSpec[] {
  const totalWeight = strategyMix.reduce((s, m) => s + m.weight, 0);
  const orders: OrderSpec[] = [];
  for (let i = 0; i < count; i++) {
    const asset = assets[i % assets.length];
    const side: "BUY" | "SELL" = secureRandomFloat() < sideRatio ? "BUY" : "SELL";
    const tier = secureRandomFloat();
    const quantity =
      tier < 0.6
        ? Math.round(10 + secureRandomFloat() * 90)
        : tier < 0.9
          ? Math.round(100 + secureRandomFloat() * 400)
          : Math.round(500 + secureRandomFloat() * 1500);
    const spread = secureRandomFloat() * 0.03 * (side === "BUY" ? 1 : -1);
    const limitPriceFactor = 1 + spread;
    let r = secureRandomFloat() * totalWeight;
    let chosen = strategyMix[0];
    for (const m of strategyMix) {
      r -= m.weight;
      if (r <= 0) {
        chosen = m;
        break;
      }
    }
    orders.push({
      asset,
      side,
      quantity,
      limitPriceFactor,
      strategy: chosen.strategy,
      algoParams: chosen.algoParams,
      expiresAt: 300 + Math.round(secureRandomFloat() * 600),
      delayMs: baseDelay + Math.round(secureRandomFloat() * spreadMs),
    });
  }
  return orders;
}

async function handleLoadTest(req: Request, ctx: GatewayContext): Promise<Response> {
  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  const adminRej = requireAdmin(auth);
  if (adminRej) return adminRej;
  const busRej = busUnavailable(ctx.producer.isReady());
  if (busRej) return busRej;

  let body: { symbols?: string[]; orderCount?: number; strategy?: string; quantityRange?: [number, number] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Expanded symbol pool to prevent concentration on a few tickers (incident 2026-05-19).
  // When the caller does not supply symbols, we rotate across a larger pool so that
  // repeated load-test invocations naturally spread orders across many assets.
  const ALL_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
    "NVDA", "META", "JPM", "GS", "V", "MA",
    "UNH", "HD", "BAC", "DIS", "NFLX", "ADBE",
    "CRM", "CSCO", "PEP", "INTC", "AMD",
  ];
  const symbols = body.symbols ?? ALL_SYMBOLS;
  const orderCount = Math.min(body.orderCount ?? 100, 500);
  const strategy = body.strategy ?? "LIMIT";
  const jobId = `load-${Date.now()}`;

  const [qtyMin, qtyMax] = body.quantityRange ?? [10, 99];
  const MAX_QUANTITY = 1_000_000;
  const quantityRangeValid =
    Number.isInteger(qtyMin) &&
    Number.isInteger(qtyMax) &&
    qtyMin >= 0 &&
    qtyMax > qtyMin &&
    qtyMax <= MAX_QUANTITY;
  if (!quantityRangeValid) {
    return new Response(
      JSON.stringify({
        error: `quantityRange must be integers with 0 <= min < max <= ${MAX_QUANTITY}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const loadTestUserIds = Deno.env.get("LOAD_TEST_USER_IDS");
  if (!loadTestUserIds) {
    return new Response(
      JSON.stringify({
        error:
          "LOAD_TEST_USER_IDS env var must be set on the gateway " +
          "with a comma-separated list of existing trader user IDs.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
  const LOAD_TEST_USERS = loadTestUserIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ORDERS_PER_SECOND_PER_USER = Number(
    Deno.env.get("LOAD_TEST_ORDERS_PER_SEC_PER_USER") ?? "5"
  );

  let prices: Record<string, number> = {};
  try {
    const res = await fetch(`${ctx.urls.marketSim}/prices`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) prices = (await res.json()) as Record<string, number>;
  } catch {
    /* fall through to defaults */
  }

  const FALLBACK_REF: Record<string, number> = {
    AAPL: 180,
    MSFT: 420,
    GOOGL: 170,
    AMZN: 200,
    TSLA: 250,
  };
  const refPrice = (sym: string) => prices[sym] ?? FALLBACK_REF[sym] ?? 100;

  const stride = 1000 / (ORDERS_PER_SECOND_PER_USER * LOAD_TEST_USERS.length);
  // Non-cryptographic synthetic-order generator. All randomness below
  // (pickFrom, side coin-flip, jitter, clientOrderId suffix, quantity)
  // is for shaping fake test traffic, NOT for any security/auth decision.
  // The picked trader id is a fixed test persona from LOAD_TEST_USER_IDS;
  // requireAdmin(auth) above gates who can invoke this endpoint, so the
  // randomness is post-auth.
  const pickFrom = <T>(xs: readonly T[]): T => xs[secureRandomInt(xs.length)];
  (async () => {
    for (let i = 0; i < orderCount; i++) {
      const symbol = pickFrom(symbols);
      const side = secureRandomFloat() < 0.5 ? "BUY" : "SELL";
      const attributedTrader = pickFrom(LOAD_TEST_USERS);
      const mid = refPrice(symbol);
      const jitter = 1 + (secureRandomFloat() - 0.5) * 0.04;
      const limitPrice =
        side === "BUY"
          ? Number((mid * jitter * 1.02).toFixed(2))
          : Number((mid * jitter * 0.98).toFixed(2));

      const quantity = qtyMin + secureRandomInt(qtyMax - qtyMin + 1);

      ctx.producer
        .send("orders.new", {
          clientOrderId: `${jobId}-${i}-${crypto.randomUUID().slice(0, 8)}`,
          asset: symbol,
          side,
          quantity,
          limitPrice,
          expiresAt: 300,
          strategy,
          algoParams: { strategy },
          userId: attributedTrader,
          userRole: "trader",
          _loadTestJobId: jobId,
        })
        .catch(() => {});

      if (i + 1 < orderCount && stride > 0) {
        await new Promise((r) => setTimeout(r, stride));
      }
    }
  })();

  ctx.publishAccessEvent({
    action: "http_request",
    userId: auth.user.id,
    userRole: auth.user.role,
    path: "/load-test",
  });

  return new Response(
    JSON.stringify({ jobId, submitted: orderCount, symbols, strategy, paced: true }),
    { status: 202, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}

export async function handleDemoDay(req: Request, ctx: GatewayContext): Promise<Response> {
  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  const adminRej = requireAdminOrOncall(auth);
  if (adminRej) return adminRej;
  const busRej = busUnavailable(ctx.producer.isReady());
  if (busRej) return busRej;

  // Demo-day orders are synthetic and must be attributed to a trader persona,
  // never to the invoking admin/oncall account — admins must not appear as the
  // originator of a trade.
  const demoTraders = testTraderIds();
  if (demoTraders.length === 0) {
    return new Response(
      JSON.stringify({
        error:
          "LOAD_TEST_USER_IDS env var must be set on the gateway with a " +
          "comma-separated list of existing trader user IDs to attribute demo orders to.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  let body: { scenario?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const scenario = body.scenario ?? "standard";

  const livePrices: Record<string, number> = {};
  try {
    const priceRes = await fetch(`${ctx.urls.marketSim}/assets`);
    if (priceRes.ok) {
      const assets = (await priceRes.json()) as { symbol: string; price: number }[];
      for (const a of assets) livePrices[a.symbol] = a.price;
    }
  } catch {
    /* fall back to defaults */
  }

  const defaultPrices: Record<string, number> = {
    AAPL: 189,
    MSFT: 421,
    GOOGL: 175,
    AMZN: 185,
    TSLA: 172,
    NVDA: 870,
    META: 510,
    JPM: 195,
    GS: 460,
    V: 275,
  };
  const priceFor = (symbol: string) => livePrices[symbol] ?? defaultPrices[symbol] ?? 100;

  const ALL_ASSETS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "GS", "V"];
  const LARGE_CAP = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META"];
  const FIN_ASSETS = ["JPM", "GS", "V"];

  const limitMix = [
    { strategy: "LIMIT", algoParams: { strategy: "LIMIT" }, weight: 4 },
    {
      strategy: "TWAP",
      algoParams: { strategy: "TWAP", slices: 4, intervalSeconds: 15 },
      weight: 2,
    },
    { strategy: "POV", algoParams: { strategy: "POV", povRate: 0.08 }, weight: 1 },
    { strategy: "VWAP", algoParams: { strategy: "VWAP", intervalSeconds: 20 }, weight: 1 },
  ];
  const algoHeavyMix = [
    { strategy: "LIMIT", algoParams: { strategy: "LIMIT" }, weight: 1 },
    {
      strategy: "TWAP",
      algoParams: { strategy: "TWAP", slices: 5, intervalSeconds: 10 },
      weight: 3,
    },
    { strategy: "POV", algoParams: { strategy: "POV", povRate: 0.1 }, weight: 2 },
    { strategy: "VWAP", algoParams: { strategy: "VWAP", intervalSeconds: 15 }, weight: 2 },
    { strategy: "ICEBERG", algoParams: { strategy: "ICEBERG", visibleQty: 100 }, weight: 1 },
    { strategy: "SNIPER", algoParams: { strategy: "SNIPER" }, weight: 1 },
    { strategy: "IS", algoParams: { strategy: "IS", urgency: 0.6 }, weight: 1 },
    { strategy: "MOMENTUM", algoParams: { strategy: "MOMENTUM", entryThresholdBps: 8 }, weight: 1 },
  ];
  const volatilityMix = [
    { strategy: "SNIPER", algoParams: { strategy: "SNIPER" }, weight: 3 },
    { strategy: "ICEBERG", algoParams: { strategy: "ICEBERG", visibleQty: 50 }, weight: 2 },
    { strategy: "ARRIVAL_PRICE", algoParams: { strategy: "ARRIVAL_PRICE" }, weight: 2 },
    {
      strategy: "MOMENTUM",
      algoParams: { strategy: "MOMENTUM", entryThresholdBps: 5, urgency: 0.8 },
      weight: 1,
    },
    { strategy: "LIMIT", algoParams: { strategy: "LIMIT" }, weight: 1 },
  ];

  let waves: OrderSpec[];
  let scenarioLabel: string;

  switch (scenario) {
    case "market-open": {
      scenarioLabel = "Market Open";
      waves = [
        ...makeWave(
          ALL_ASSETS,
          60,
          [
            { strategy: "LIMIT", algoParams: { strategy: "LIMIT" }, weight: 5 },
            { strategy: "SNIPER", algoParams: { strategy: "SNIPER" }, weight: 3 },
          ],
          0.65,
          0,
          3_000
        ),
        ...makeWave(ALL_ASSETS, 40, limitMix, 0.55, 4_000, 10_000),
        ...makeWave(LARGE_CAP, 20, algoHeavyMix, 0.5, 15_000, 8_000),
      ];
      break;
    }
    case "volatile": {
      scenarioLabel = "Volatile Session";
      waves = [
        ...makeWave(ALL_ASSETS, 40, volatilityMix, 0.7, 0, 5_000),
        ...makeWave(ALL_ASSETS, 40, volatilityMix, 0.65, 6_000, 5_000),
        ...makeWave(ALL_ASSETS, 20, limitMix, 0.5, 12_000, 5_000),
      ];
      break;
    }
    case "institutional": {
      scenarioLabel = "Institutional Flow";
      waves = [
        ...makeWave(
          LARGE_CAP,
          30,
          [
            {
              strategy: "TWAP",
              algoParams: { strategy: "TWAP", slices: 8, intervalSeconds: 20 },
              weight: 3,
            },
            { strategy: "VWAP", algoParams: { strategy: "VWAP", intervalSeconds: 25 }, weight: 3 },
            {
              strategy: "ICEBERG",
              algoParams: { strategy: "ICEBERG", visibleQty: 200 },
              weight: 2,
            },
          ],
          0.5,
          0,
          12_000
        ),
        ...makeWave(
          FIN_ASSETS,
          20,
          [
            { strategy: "ARRIVAL_PRICE", algoParams: { strategy: "ARRIVAL_PRICE" }, weight: 2 },
            {
              strategy: "TWAP",
              algoParams: { strategy: "TWAP", slices: 6, intervalSeconds: 15 },
              weight: 2,
            },
            {
              strategy: "ICEBERG",
              algoParams: { strategy: "ICEBERG", visibleQty: 150 },
              weight: 1,
            },
          ],
          0.45,
          5_000,
          10_000
        ),
      ];
      break;
    }
    default: {
      scenarioLabel = "Standard Trading Day";
      waves = [
        ...makeWave(ALL_ASSETS, 30, limitMix, 0.55, 0, 6_000),
        ...makeWave(ALL_ASSETS, 25, algoHeavyMix, 0.5, 7_000, 8_000),
        ...makeWave(LARGE_CAP, 20, limitMix, 0.6, 16_000, 6_000),
        ...makeWave(ALL_ASSETS, 15, volatilityMix, 0.45, 23_000, 5_000),
        ...makeWave(FIN_ASSETS, 10, algoHeavyMix, 0.5, 29_000, 4_000),
      ];
      break;
    }
  }

  const jobId = `demo-${Date.now()}`;
  const total = waves.length;

  for (const [i, spec] of waves.entries()) {
    const price = priceFor(spec.asset) * spec.limitPriceFactor;
    const order = {
      clientOrderId: `${jobId}-${i}`,
      asset: spec.asset,
      side: spec.side,
      quantity: spec.quantity,
      limitPrice: Math.round(price * 100) / 100,
      expiresAt: spec.expiresAt,
      strategy: spec.strategy,
      algoParams: spec.algoParams,
      userId: demoTraders[secureRandomInt(demoTraders.length)],
      userRole: "trader",
      _demoDayJobId: jobId,
    };
    if (spec.delayMs === 0) {
      await ctx.producer.send("orders.new", order);
    } else {
      setTimeout(() => {
        ctx.producer.send("orders.new", order).catch(() => {});
      }, spec.delayMs);
    }
  }

  ctx.publishAccessEvent({
    action: "http_request",
    userId: auth.user.id,
    userRole: auth.user.role,
    path: "/demo-day",
  });

  return new Response(JSON.stringify({ jobId, submitted: total, scenario: scenarioLabel }), {
    status: 202,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleLoadGenStart(req: Request, ctx: GatewayContext): Promise<Response> {
  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  const rej = requireAdminOrOncall(auth);
  if (rej) return rej;
  const busRej = busUnavailable(ctx.producer.isReady());
  if (busRej) return busRej;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const status = ctx.loadAgent.start(body, { userId: auth.user.id, role: auth.user.role });
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 409,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleLoadGenStop(req: Request, ctx: GatewayContext): Promise<Response> {
  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  const rej = requireAdminOrOncall(auth);
  if (rej) return rej;

  const status = ctx.loadAgent.stop({ userId: auth.user.id, role: auth.user.role });
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleLoadGenStatus(req: Request, ctx: GatewayContext): Promise<Response> {
  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  const rej = requireAdminOrOncall(auth);
  if (rej) return rej;

  return new Response(JSON.stringify(ctx.loadAgent.status()), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function handleAdminRoute(
  req: Request,
  path: string,
  ctx: GatewayContext
): Promise<Response | null> | null {
  if (path === "/load-test" && req.method === "POST") {
    return handleLoadTest(req, ctx);
  }
  if (path === "/demo-day" && req.method === "POST") {
    return handleDemoDay(req, ctx);
  }
  if (path === "/load-gen/start" && req.method === "POST") {
    return handleLoadGenStart(req, ctx);
  }
  if (path === "/load-gen/stop" && req.method === "POST") {
    return handleLoadGenStop(req, ctx);
  }
  if (path === "/load-gen/status" && req.method === "GET") {
    return handleLoadGenStatus(req, ctx);
  }
  return null;
}
