import { assert, assertEquals } from "jsr:@std/assert@0.217";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

interface ComposeService {
  command?: string[];
}
interface ComposeConfig {
  services?: Record<string, ComposeService>;
}

async function getRedpandaInitCommand(): Promise<string | null> {
  const cmd = new Deno.Command("docker", {
    args: ["compose", "-f", `${REPO_ROOT}compose.yml`, "config", "--format", "json"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await cmd.output();
  if (code !== 0) {
    const errText = new TextDecoder().decode(stderr);
    if (errText.includes("docker: command not found") || errText.includes("not found")) {
      return null;
    }
    throw new Error(`docker compose config failed: ${errText.slice(0, 500)}`);
  }
  const config = JSON.parse(new TextDecoder().decode(stdout)) as ComposeConfig;
  const command = config.services?.["redpanda-init"]?.command;
  return command?.[0] ?? null;
}

// docs: /platform/observability/alerts/
// 2026-08-24: redpanda-init used to run `rpk topic alter-config` immediately
// after `rpk topic create`, with no wait. `rpk topic create` returns once the
// create request is accepted, not once the topic is visible cluster-wide, so
// under load the alter-config calls could race topic creation and silently
// fail with topic_not_exists (the script has `set -e` and no per-call
// fallback for alter-config). This left market.ticks without its
// max.message.bytes override, falling back to Redpanda's much smaller
// cluster default and causing market-sim's producer to fail in a loop. This
// test guards against the race being reintroduced.
Deno.test("redpanda-init waits for each topic to be describable before running alter-config", async () => {
  const script = await getRedpandaInitCommand();
  if (script === null) return; // docker not available in this environment

  const createIndex = script.indexOf("rpk topic create");
  const waitIndex = script.indexOf("rpk topic describe");
  const firstAlterIndex = script.indexOf("rpk topic alter-config");

  assert(createIndex !== -1, "expected a topic create step");
  assert(waitIndex !== -1, "expected a topic describe wait-loop before alter-config");
  assert(firstAlterIndex !== -1, "expected at least one alter-config call");

  assert(createIndex < waitIndex, "topic creation must happen before the describe wait loop");
  assert(
    waitIndex < firstAlterIndex,
    "the describe wait loop must happen before any alter-config call"
  );
});

Deno.test("redpanda-init's wait loop is bounded, not an infinite retry", async () => {
  const script = await getRedpandaInitCommand();
  if (script === null) return;

  assert(
    /for attempt in \$\$?\(seq 1 \d+\)/.test(script),
    "expected a bounded seq-based retry loop, not an unbounded wait"
  );
});

Deno.test("redpanda-init still creates every topic referenced by an alter-config call", async () => {
  const script = await getRedpandaInitCommand();
  if (script === null) return;

  const alteredTopics = [...script.matchAll(/rpk topic alter-config (\S+)\s+--set/g)].map(
    (m) => m[1]
  );
  assert(alteredTopics.length > 0, "expected at least one alter-config call to check");

  for (const topic of new Set(alteredTopics)) {
    assert(
      script.includes(topic),
      `topic ${topic} is configured via alter-config but never referenced elsewhere in the script`
    );
  }
  assertEquals(new Set(alteredTopics).has("market.ticks"), true);
});
