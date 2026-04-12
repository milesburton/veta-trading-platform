import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";
import type { NewsEvent } from "../types/intelligence.ts";
import { json, corsOptions } from "../lib/http.ts";

const PORT = Number(Deno.env.get("NEWS_AGGREGATOR_PORT")) || 5_013;
const MARKET_SIM_URL = Deno.env.get("MARKET_SIM_URL") ||
  "http://localhost:5000";
const POLL_INTERVAL_MS = Number(Deno.env.get("NEWS_POLL_INTERVAL_MS")) ||
  120_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MAX_ITEMS_PER_SYMBOL = 100;
const SOURCES_FILE = Deno.env.get("NEWS_SOURCES_FILE") ?? "./news_sources.json";

console.log(`[news-aggregator] Starting, poll=${POLL_INTERVAL_MS}ms`);

interface NewsSource {
  id: string;
  label: string;
  rssTemplate: string;
  enabled: boolean;
  symbolSpecific: boolean;
}

const DEFAULT_SOURCES: NewsSource[] = [
  {
    id: "yahoo-finance",
    label: "Yahoo Finance",
    rssTemplate:
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US",
    enabled: true,
    symbolSpecific: true,
  },
  {
    id: "marketwatch",
    label: "MarketWatch",
    rssTemplate: "https://feeds.marketwatch.com/marketwatch/topstories/",
    enabled: true,
    symbolSpecific: false,
  },
  {
    id: "investing-com",
    label: "Investing.com",
    rssTemplate: "https://www.investing.com/rss/news.rss",
    enabled: true,
    symbolSpecific: false,
  },
];

function loadSources(): NewsSource[] {
  try {
    const raw = Deno.readTextFileSync(SOURCES_FILE);
    return JSON.parse(raw) as NewsSource[];
  } catch {
    return DEFAULT_SOURCES.map((s) => ({ ...s }));
  }
}

function saveSources(): void {
  try {
    Deno.writeTextFileSync(SOURCES_FILE, JSON.stringify(SOURCES, null, 2));
  } catch (e) {
    console.warn(`[news-aggregator] Could not persist sources: ${e}`);
  }
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const SOURCES: NewsSource[] = loadSources();

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: number;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  relatedSymbols: string[];
}

// Loughran-McDonald financial sentiment lexicon (condensed).
// Source: Loughran & McDonald (2011), "When Is a Liability Not a Liability?"
const LM_POSITIVE = new Set([
  "able",
  "abundance",
  "abundant",
  "acclaimed",
  "accolade",
  "accolades",
  "accommodative",
  "accomplish",
  "accomplished",
  "achievement",
  "acumen",
  "adaptable",
  "adequate",
  "admirable",
  "advance",
  "advanced",
  "advantage",
  "advantageous",
  "affirm",
  "affordable",
  "agile",
  "agree",
  "ahead",
  "aligned",
  "allay",
  "alleviate",
  "allot",
  "ample",
  "apparent",
  "appreciate",
  "appropriate",
  "approval",
  "approve",
  "aptly",
  "assurance",
  "assure",
  "attain",
  "attractive",
  "augment",
  "balance",
  "beat",
  "beats",
  "best",
  "better",
  "beneficent",
  "beneficial",
  "benefit",
  "benefits",
  "bolster",
  "boom",
  "booming",
  "boost",
  "breakthrough",
  "bright",
  "build",
  "bullish",
  "buy",
  "capability",
  "capable",
  "captivate",
  "cash-generative",
  "celebrated",
  "certainty",
  "champion",
  "clean",
  "clear",
  "comfortable",
  "commitment",
  "competitive",
  "confidence",
  "confident",
  "constructive",
  "continue",
  "contribute",
  "control",
  "core",
  "cost-effective",
  "create",
  "credit",
  "cultivate",
  "cutting-edge",
  "deal",
  "decisive",
  "deliver",
  "demand",
  "dependable",
  "desirable",
  "differentiated",
  "disciplined",
  "discover",
  "durable",
  "dynamic",
  "earn",
  "earnings",
  "effective",
  "efficient",
  "efficiency",
  "empower",
  "endorse",
  "energize",
  "enhance",
  "excellent",
  "exceed",
  "exceptional",
  "expand",
  "expansion",
  "expedient",
  "extraordinary",
  "favorable",
  "feasible",
  "flexible",
  "flourish",
  "focus",
  "forerunner",
  "forthcoming",
  "foundation",
  "fulfil",
  "fulfill",
  "gain",
  "gains",
  "generative",
  "good",
  "growth",
  "guarantee",
  "healthy",
  "improve",
  "improved",
  "improvement",
  "innovate",
  "innovation",
  "innovative",
  "integrity",
  "invest",
  "investment",
  "lead",
  "leader",
  "leadership",
  "leverage",
  "liquid",
  "loyal",
  "lucrative",
  "milestone",
  "momentous",
  "motivated",
  "optimism",
  "optimistic",
  "organic",
  "outperform",
  "outstanding",
  "overachieve",
  "overdeliver",
  "pioneer",
  "positive",
  "potential",
  "premium",
  "productive",
  "profitability",
  "profitable",
  "profit",
  "progress",
  "progressive",
  "promising",
  "prospect",
  "prosperous",
  "proven",
  "quality",
  "raise",
  "rally",
  "rebound",
  "recovery",
  "record",
  "reliable",
  "renew",
  "resilient",
  "resolve",
  "revenue",
  "reward",
  "rise",
  "robust",
  "safe",
  "secure",
  "soar",
  "solid",
  "solution",
  "stable",
  "strength",
  "strong",
  "successful",
  "superior",
  "support",
  "surge",
  "sustainable",
  "thriving",
  "top",
  "transformative",
  "transparency",
  "trend",
  "upgrade",
  "uplift",
  "value",
  "vibrant",
  "viable",
  "win",
  "yield",
]);

// Negative terms (LM Negative word list — financial-domain subset)
const LM_NEGATIVE = new Set([
  "abandon",
  "abuse",
  "accusation",
  "adversarial",
  "adversity",
  "allegation",
  "alleges",
  "annul",
  "arrears",
  "bad",
  "bailout",
  "bankrupt",
  "bankruptcy",
  "barrier",
  "bearish",
  "below",
  "breach",
  "burden",
  "caution",
  "challenge",
  "close",
  "concern",
  "conflict",
  "contraction",
  "conviction",
  "corrupt",
  "crash",
  "crisis",
  "critical",
  "cut",
  "damage",
  "decline",
  "decrease",
  "default",
  "deficit",
  "delay",
  "delinquent",
  "deny",
  "deteriorate",
  "difficult",
  "difficulty",
  "diminish",
  "disappoint",
  "disappointing",
  "disappointment",
  "dispute",
  "disruption",
  "distress",
  "diverge",
  "doubtful",
  "down",
  "downgrade",
  "downturn",
  "drop",
  "fail",
  "failure",
  "fall",
  "falling",
  "fault",
  "fear",
  "fine",
  "force",
  "foreclosure",
  "fraud",
  "halt",
  "harm",
  "headwind",
  "impair",
  "impairment",
  "inadequate",
  "incur",
  "inferior",
  "inflate",
  "instability",
  "insufficient",
  "investigation",
  "issue",
  "lag",
  "late",
  "layoff",
  "liability",
  "liquidate",
  "litigate",
  "litigation",
  "loss",
  "losses",
  "miss",
  "missed",
  "misstep",
  "negative",
  "non-compliant",
  "obsolete",
  "obstacle",
  "penalty",
  "pessimistic",
  "plunge",
  "poor",
  "problem",
  "probe",
  "reduce",
  "redundancy",
  "regulatory",
  "reject",
  "retreat",
  "risk",
  "sale",
  "sanction",
  "scandal",
  "sell",
  "shortfall",
  "shrink",
  "slump",
  "struggle",
  "substandard",
  "suffer",
  "surplus",
  "suspect",
  "suspend",
  "trouble",
  "turbulence",
  "uncertain",
  "uncertainty",
  "undermine",
  "underperform",
  "unfavourable",
  "unfavorable",
  "unprofitable",
  "unreliable",
  "unsustainable",
  "violate",
  "violation",
  "volatile",
  "vulnerability",
  "warn",
  "warning",
  "weak",
  "weakness",
  "withdraw",
  "worse",
  "worsen",
  "writedown",
  "writeoff",
]);
const IGNORE_TICKERS = new Set([
  "CEO",
  "CFO",
  "COO",
  "CTO",
  "IPO",
  "ETF",
  "GDP",
  "USD",
  "EUR",
  "GBP",
  "UK",
  "US",
  "EU",
  "AI",
  "IT",
  "FY",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "SEC",
  "FED",
  "ECB",
  "IMF",
  "WTI",
  "LNG",
  "EPS",
  "PE",
  "PB",
  "ROE",
  "YTD",
  "QOQ",
  "YOY",
  "MOM",
  "EST",
  "EDT",
  "PST",
]);

function scoreSentiment(
  text: string,
): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const words =
    text.toLowerCase().match(/\b[a-z][a-z-]*[a-z]\b|\b[a-z]{2,}\b/g) ?? [];
  let score = 0;
  for (const w of words) {
    if (LM_POSITIVE.has(w)) score++;
    else if (LM_NEGATIVE.has(w)) score--;
  }
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  return { sentiment, score };
}

function extractTickers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  return [...new Set(matches.filter((m) => !IGNORE_TICKERS.has(m)))].slice(
    0,
    5,
  );
}

const newsBySymbol = new Map<string, NewsItem[]>();
const seenIds = new Set<string>();
const SEEN_IDS_MAX = 50_000;
let knownSymbols: string[] = [];

function storeItem(item: NewsItem): void {
  const list = newsBySymbol.get(item.symbol) ?? [];
  list.unshift(item);
  if (list.length > MAX_ITEMS_PER_SYMBOL) list.length = MAX_ITEMS_PER_SYMBOL;
  newsBySymbol.set(item.symbol, list);
}

function totalItems(): number {
  return [...newsBySymbol.values()].reduce((sum, v) => sum + v.length, 0);
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string;
  description?: string;
}

async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json() as { status: string; items?: RssItem[] };
    if (data.status !== "ok" || !Array.isArray(data.items)) return [];
    return data.items;
  } catch {
    return [];
  }
}

const producer = await createProducer("news-aggregator").catch((err) => {
  console.warn("[news-aggregator] Redpanda unavailable:", err.message);
  return null;
});

async function publishItem(item: NewsItem): Promise<void> {
  if (!producer) return;
  await producer.send("news.feed", item).catch(() => {});
  await producer.send("news.signal", {
    symbol: item.symbol,
    sentiment: item.sentiment,
    score: item.sentimentScore,
    headline: item.headline,
    source: item.source,
    ts: item.publishedAt,
  }).catch(() => {});
  const normScore = Math.max(-1, Math.min(1, item.sentimentScore / 3));
  const newsEvent: NewsEvent = {
    id: item.id,
    source: item.source,
    headline: item.headline,
    tickers: [item.symbol, ...item.relatedSymbols].filter((v, i, a) =>
      a.indexOf(v) === i
    ).slice(0, 5),
    sentiment: item.sentiment,
    sentimentScore: normScore,
    relevanceScore: item.relatedSymbols.length > 0 ? 0.8 : 0.5,
    publishedAt: item.publishedAt,
    ts: Date.now(),
  };
  await producer.send("news.events.normalised", newsEvent).catch(() => {});
}

async function pollSourceForSymbol(
  source: NewsSource,
  symbol: string,
): Promise<void> {
  const url = source.symbolSpecific
    ? source.rssTemplate.replace("{symbol}", encodeURIComponent(symbol))
    : source.rssTemplate;

  const items = await fetchRss(url);
  let newCount = 0;

  for (const raw of items) {
    const headline = raw.title ?? "";
    if (!headline) continue;

    if (!source.symbolSpecific) {
      const tickers = extractTickers(headline + " " + (raw.description ?? ""));
      if (!tickers.includes(symbol)) continue;
    }

    const id = raw.guid ?? raw.link ?? headline;
    const itemKey = `${source.id}:${id}`;
    if (seenIds.has(itemKey)) continue;
    if (seenIds.size >= SEEN_IDS_MAX) {
      [...seenIds].slice(0, Math.floor(SEEN_IDS_MAX / 4)).forEach((k) =>
        seenIds.delete(k)
      );
    }
    seenIds.add(itemKey);

    const { sentiment, score } = scoreSentiment(headline);
    const relatedSymbols = extractTickers(headline);

    const item: NewsItem = {
      id: itemKey,
      symbol,
      headline,
      source: source.label,
      url: raw.link ?? "",
      publishedAt: raw.pubDate ? new Date(raw.pubDate).getTime() : Date.now(),
      sentiment,
      sentimentScore: score,
      relatedSymbols,
    };

    storeItem(item);
    await publishItem(item);
    newCount++;
  }

  if (newCount > 0) {
    console.log(
      `[news-aggregator] ${source.label} → ${symbol}: +${newCount} items`,
    );
  }
}

async function pollAll(): Promise<void> {
  const enabledSources = SOURCES.filter((s) => s.enabled);
  if (enabledSources.length === 0 || knownSymbols.length === 0) return;

  const symbolSpecific = enabledSources.filter((s) => s.symbolSpecific);
  const general = enabledSources.filter((s) => !s.symbolSpecific);

  const tasks: Promise<void>[] = [];

  for (const source of symbolSpecific) {
    for (const symbol of knownSymbols) {
      tasks.push(pollSourceForSymbol(source, symbol));
    }
  }

  for (const source of general) {
    for (const symbol of knownSymbols) {
      tasks.push(pollSourceForSymbol(source, symbol));
    }
  }

  await Promise.allSettled(tasks);
}

async function loadSymbols(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_SIM_URL}/assets`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return;
    const assets = await res.json() as { symbol: string }[];
    knownSymbols = assets.map((a) => a.symbol);
    console.log(`[news-aggregator] Loaded ${knownSymbols.length} symbols`);
  } catch {
    console.warn("[news-aggregator] Could not load symbols from market-sim");
  }
}

(async () => {
  await loadSymbols();
  await pollAll();
  setInterval(async () => {
    await loadSymbols();
    await pollAll();
  }, POLL_INTERVAL_MS);
})();

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return corsOptions();
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({
      service: "news-aggregator",
      version: VERSION,
      status: "ok",
      sources: SOURCES.map(({ id, label, enabled }) => ({
        id,
        label,
        enabled,
      })),
      itemCount: totalItems(),
      symbolCount: knownSymbols.length,
    });
  }

  if (req.method === "GET" && path === "/news") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? 20),
      MAX_ITEMS_PER_SYMBOL,
    );
    if (!symbol) return json({ error: "symbol is required" }, 400);
    const items = (newsBySymbol.get(symbol) ?? []).slice(0, limit);
    return json(items);
  }

  if (req.method === "GET" && path === "/sources") {
    return json(SOURCES.map(({ id, label, enabled, symbolSpecific }) => ({
      id,
      label,
      enabled,
      symbolSpecific,
    })));
  }

  const sourceMatch = path.match(
    /^\/sources\/([^/]+)\/(enable|disable|toggle)$/,
  );
  if (req.method === "POST" && sourceMatch) {
    const [, id, action] = sourceMatch;
    const source = SOURCES.find((s) => s.id === id);
    if (!source) return json({ error: "source not found" }, 404);
    if (action === "enable") source.enabled = true;
    else if (action === "disable") source.enabled = false;
    else source.enabled = !source.enabled;
    saveSources();
    console.log(`[news-aggregator] Source ${id} → enabled=${source.enabled}`);
    return json({
      id: source.id,
      label: source.label,
      enabled: source.enabled,
      symbolSpecific: source.symbolSpecific,
    });
  }

  // POST /sources — create a new source
  if (req.method === "POST" && path === "/sources") {
    let body: Partial<NewsSource>;
    try {
      body = await req.json() as Partial<NewsSource>;
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { label, rssTemplate, symbolSpecific = false, enabled = true } = body;
    if (!label || !rssTemplate) {
      return json({ error: "label and rssTemplate are required" }, 400);
    }
    const id = slugify(label) || `source-${Date.now()}`;
    if (SOURCES.some((s) => s.id === id)) {
      return json({ error: "source with this id already exists" }, 409);
    }
    const newSource: NewsSource = {
      id,
      label,
      rssTemplate,
      enabled,
      symbolSpecific,
    };
    SOURCES.push(newSource);
    saveSources();
    console.log(`[news-aggregator] Source created: ${id}`);
    return json(newSource, 201);
  }

  // PUT /sources/:id — update label, rssTemplate, symbolSpecific
  const putMatch = path.match(/^\/sources\/([^/]+)$/);
  if (req.method === "PUT" && putMatch) {
    const [, id] = putMatch;
    const source = SOURCES.find((s) => s.id === id);
    if (!source) return json({ error: "source not found" }, 404);
    let body: Partial<NewsSource>;
    try {
      body = await req.json() as Partial<NewsSource>;
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (body.label !== undefined) source.label = body.label;
    if (body.rssTemplate !== undefined) source.rssTemplate = body.rssTemplate;
    if (body.symbolSpecific !== undefined) {
      source.symbolSpecific = body.symbolSpecific;
    }
    if (body.enabled !== undefined) source.enabled = body.enabled;
    saveSources();
    console.log(`[news-aggregator] Source updated: ${id}`);
    return json(source);
  }

  // DELETE /sources/:id — remove a source
  if (req.method === "DELETE" && putMatch) {
    const [, id] = putMatch;
    const idx = SOURCES.findIndex((s) => s.id === id);
    if (idx === -1) return json({ error: "source not found" }, 404);
    SOURCES.splice(idx, 1);
    saveSources();
    console.log(`[news-aggregator] Source deleted: ${id}`);
    return corsOptions();
  }

  return json({ error: "Not Found" }, 404);
});
