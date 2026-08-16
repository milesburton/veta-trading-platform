import { assertEquals } from "jsr:@std/assert@0.217";
import { extractTickers, scoreSentiment, slugify } from "../news/news-analysis.ts";

// ── scoreSentiment ───────────────────────────────────────────────────────────

Deno.test("[news-analysis] an all-positive headline scores positive", () => {
  const result = scoreSentiment("Strong growth and record profit beat expectations");
  assertEquals(result.sentiment, "positive");
  assertEquals(result.score > 0, true);
});

Deno.test("[news-analysis] an all-negative headline scores negative", () => {
  const result = scoreSentiment("Bankruptcy fears loom as losses and layoffs mount");
  assertEquals(result.sentiment, "negative");
  assertEquals(result.score < 0, true);
});

Deno.test("[news-analysis] a headline with no lexicon words is neutral", () => {
  const result = scoreSentiment("The quarterly meeting is scheduled for Tuesday");
  assertEquals(result.sentiment, "neutral");
  assertEquals(result.score, 0);
});

Deno.test("[news-analysis] equal positive and negative words cancel to neutral", () => {
  const result = scoreSentiment("strong growth but weak losses");
  assertEquals(result.sentiment, "neutral");
  assertEquals(result.score, 0);
});

Deno.test("[news-analysis] scoring is case-insensitive", () => {
  const lower = scoreSentiment("strong growth");
  const upper = scoreSentiment("STRONG GROWTH");
  assertEquals(lower.score, upper.score);
  assertEquals(upper.sentiment, "positive");
});

Deno.test("[news-analysis] an empty string is neutral", () => {
  const result = scoreSentiment("");
  assertEquals(result.sentiment, "neutral");
  assertEquals(result.score, 0);
});

Deno.test("[news-analysis] hyphenated lexicon words are recognised", () => {
  const result = scoreSentiment("A cost-effective and cutting-edge solution");
  assertEquals(result.sentiment, "positive");
  assertEquals(result.score >= 2, true, `expected at least 2 positive hits, got ${result.score}`);
});

Deno.test("[news-analysis] punctuation does not prevent word matches", () => {
  const result = scoreSentiment("Growth, profit, and success!");
  assertEquals(result.sentiment, "positive");
});

// ── extractTickers ───────────────────────────────────────────────────────────

Deno.test("[news-analysis] extracts uppercase 2-5 letter ticker candidates", () => {
  const tickers = extractTickers("AAPL and MSFT both rallied today");
  assertEquals(tickers.includes("AAPL"), true);
  assertEquals(tickers.includes("MSFT"), true);
});

Deno.test("[news-analysis] lowercase text never matches as a ticker", () => {
  const tickers = extractTickers("aapl rallied today");
  assertEquals(tickers.length, 0);
});

Deno.test("[news-analysis] common financial acronyms are filtered out as false positives", () => {
  const tickers = extractTickers("The CEO discussed GDP and Q1 EPS with the SEC");
  assertEquals(tickers.length, 0);
});

Deno.test("[news-analysis] a ticker appearing twice is deduped", () => {
  const tickers = extractTickers("AAPL rose after AAPL announced earnings");
  assertEquals(tickers.filter((t) => t === "AAPL").length, 1);
});

Deno.test("[news-analysis] results are capped at 5 tickers", () => {
  const tickers = extractTickers("AAA BBB CCC DDD EEE FFF GGG");
  assertEquals(tickers.length, 5);
});

Deno.test("[news-analysis] a single-letter uppercase token is not matched (below the 2-char minimum)", () => {
  const tickers = extractTickers("A rally in F and T shares");
  assertEquals(tickers.length, 0);
});

Deno.test("[news-analysis] a 6+ letter uppercase run is not matched (above the 5-char maximum)", () => {
  const tickers = extractTickers("NASDAQINDEX surged today");
  assertEquals(tickers.length, 0);
});

// ── slugify ──────────────────────────────────────────────────────────────────

Deno.test("[news-analysis] slugify lowercases and hyphenates", () => {
  assertEquals(slugify("Yahoo Finance"), "yahoo-finance");
});

Deno.test("[news-analysis] slugify collapses runs of non-alphanumeric characters", () => {
  assertEquals(slugify("Foo & Bar!!  Baz"), "foo-bar-baz");
});

Deno.test("[news-analysis] slugify trims leading and trailing hyphens", () => {
  assertEquals(slugify("--Hello World--"), "hello-world");
});

Deno.test("[news-analysis] slugify of an all-symbol input is an empty string", () => {
  assertEquals(slugify("!!!"), "");
});
