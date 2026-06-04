// fallow-ignore-file unused-file
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { Signal } from "@veta/types/intelligence";
import {
  listPlaybooks,
  type PlaybookContext,
  playbookById,
  selectPlaybook,
} from "../llm-advisory/playbooks/index.ts";

function signal(direction: Signal["direction"], confidence = 0.8): Signal {
  return {
    symbol: "AAPL",
    direction,
    score: 0.5,
    confidence,
    factors: [],
    ts: Date.now(),
  };
}

function ctx(overrides: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    symbol: "AAPL",
    signal: signal("neutral"),
    features: null,
    recommendation: null,
    recentCloses: [],
    ...overrides,
  };
}

Deno.test("[playbooks] listPlaybooks returns the three seeds", () => {
  const ids = listPlaybooks().map((p) => p.id);
  assertEquals(ids.length, 3);
  assert(ids.includes("bullish-momentum"));
  assert(ids.includes("bearish-reversal"));
  assert(ids.includes("neutral-context"));
});

Deno.test("[playbooks] playbookById returns null for unknown id", () => {
  assertEquals(playbookById("does-not-exist"), null);
});

Deno.test("[playbooks] selectPlaybook picks bullish when signal long + uptrend", () => {
  const c = ctx({
    signal: signal("long"),
    recentCloses: [100, 101, 102, 104],
  });
  const pb = selectPlaybook(c);
  assertEquals(pb?.id, "bullish-momentum");
});

Deno.test("[playbooks] bullish playbook requires recent uptrend, not just long signal", () => {
  const c = ctx({
    signal: signal("long"),
    recentCloses: [104, 102, 101, 100],
  });
  const pb = selectPlaybook(c);
  assertEquals(pb?.id, "neutral-context");
});

Deno.test("[playbooks] selectPlaybook picks bearish on short signal", () => {
  const pb = selectPlaybook(ctx({ signal: signal("short") }));
  assertEquals(pb?.id, "bearish-reversal");
});

Deno.test("[playbooks] selectPlaybook picks neutral on neutral signal", () => {
  const pb = selectPlaybook(ctx({ signal: signal("neutral") }));
  assertEquals(pb?.id, "neutral-context");
});

Deno.test("[playbooks] selectPlaybook picks neutral on low-confidence long signal", () => {
  const pb = selectPlaybook(ctx({ signal: signal("long", 0.2), recentCloses: [100, 101] }));
  assertEquals(pb?.id, "neutral-context");
});

Deno.test("[playbooks] every playbook's systemPrompt ends with the disclaimer", () => {
  for (const pb of listPlaybooks()) {
    assert(
      pb.systemPrompt.includes("educational purposes only"),
      `${pb.id}: missing educational-purposes disclaimer`
    );
  }
});

Deno.test("[playbooks] bullish contextLines includes the percent move", () => {
  const c = ctx({
    signal: signal("long"),
    recentCloses: [100, 102, 103, 105],
  });
  const lines = playbookById("bullish-momentum")?.contextLines(c) ?? [];
  const joined = lines.join(" ");
  assert(joined.includes("+5.00%"), `expected '+5.00%' in: ${joined}`);
});

Deno.test("[playbooks] bearish contextLines includes drawdown percent", () => {
  const c = ctx({
    signal: signal("short"),
    recentCloses: [110, 108, 105, 100],
  });
  const lines = playbookById("bearish-reversal")?.contextLines(c) ?? [];
  const joined = lines.join(" ");
  assert(joined.includes("-9.09%"), `expected '-9.09%' in: ${joined}`);
});

Deno.test("[playbooks] bearish-reversal.contextLines returns [] with fewer than 3 closes", () => {
  const pb = playbookById("bearish-reversal");
  assert(pb, "bearish-reversal playbook must exist");
  assertEquals(pb.contextLines(ctx({ recentCloses: [100, 95] })), []);
});

Deno.test("[playbooks] bearish-reversal.contextLines returns [] when high is 0", () => {
  const pb = playbookById("bearish-reversal");
  assert(pb);
  assertEquals(pb.contextLines(ctx({ recentCloses: [0, 0, 0] })), []);
});

Deno.test("[playbooks] bearish-reversal.contextLines returns [] when closes include NaN", () => {
  const pb = playbookById("bearish-reversal");
  assert(pb);
  assertEquals(pb.contextLines(ctx({ recentCloses: [100, NaN, 90] })), []);
});

Deno.test("[playbooks] neutral-context.contextLines always returns []", () => {
  const pb = playbookById("neutral-context");
  assert(pb);
  assertEquals(pb.contextLines(ctx({ recentCloses: [100, 99, 101, 102, 103] })), []);
});
