import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { NewsSentimentSchema, NewsSignalSchema } from "./news.ts";

test("[news-schema] accepts valid sentiment literals", () => {
  assertEquals(NewsSentimentSchema.safeParse("positive").success, true);
  assertEquals(NewsSentimentSchema.safeParse("negative").success, true);
  assertEquals(NewsSentimentSchema.safeParse("neutral").success, true);
});

test("[news-schema] validates a signal payload and rejects an invalid sentiment", () => {
  const valid = NewsSignalSchema.safeParse({
    symbol: "AAPL",
    sentiment: "positive",
    score: 0.75,
    headline: "AAPL guidance raised",
    source: "wire",
    ts: 1_700_000_000_000,
  });
  assertEquals(valid.success, true);

  const invalid = NewsSignalSchema.safeParse({
    symbol: "AAPL",
    sentiment: "mixed",
    score: 0.75,
  });
  assertEquals(invalid.success, false);
});
