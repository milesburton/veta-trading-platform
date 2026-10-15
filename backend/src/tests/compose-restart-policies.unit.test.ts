import { runCommand } from "../lib/process.ts";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

interface Scenario {
  name: string;
  files: string[];
  profiles?: string[];
  env: Record<string, string>;
}

const PLACEHOLDERS: Record<string, string> = {
  OAUTH2_SHARED_SECRET: "test-placeholder",
  INTERNAL_SERVICE_TOKEN: "test-placeholder",
  LOADGEN_OAUTH_PASSWORD: "test-placeholder",
  GRAFANA_ADMIN_PASSWORD: "test-placeholder",
  DISCORD_WEBHOOK_URL: "https://example.invalid/test",
  ALPHA_VANTAGE_API_KEY: "test",
  TIINGO_API_KEY: "test",
  POLYGON_API_KEY: "test",
  FRED_API_KEY: "test",
  OPENAI_API_KEY: "test",
  ANTHROPIC_API_KEY: "test",
};

const SCENARIOS: Scenario[] = [
  {
    name: "production stack",
    files: ["compose.yml", "compose.prod.yml"],
    profiles: ["trading"],
    env: PLACEHOLDERS,
  },
  {
    name: "loadgen stack",
    files: ["compose.yml", "compose.loadgen.yml"],
    profiles: ["loadgen"],
    env: PLACEHOLDERS,
  },
  {
    name: "observability stack",
    files: ["observability/docker-compose.lgtm.yml"],
    env: PLACEHOLDERS,
  },
];

// Services that are legitimately one-shot — init containers, migrations,
// model downloads, etc. These run to completion and exit zero; auto-restart
// would loop them forever, so `restart: no` is correct.
const ONE_SHOT_SERVICES = new Set([
  "db-migrate",
  "redpanda-init",
  "ollama-model-pull",
  "minio-init",
]);

interface ComposeServiceConfig {
  restart?: string;
}
interface ComposeConfig {
  services?: Record<string, ComposeServiceConfig>;
}

async function dockerComposeConfig(
  files: string[],
  profiles: string[] = [],
  env: Record<string, string> = {}
): Promise<ComposeConfig | null> {
  const args = ["compose"];
  for (const f of files) args.push("-f", `${REPO_ROOT}${f}`);
  for (const p of profiles) args.push("--profile", p);
  args.push("config", "--format", "json");
  const { stdout, stderr, code } = await runCommand("docker", args, {
    env: { ...process.env, ...env },
  });
  if (code !== 0) {
    const errText = stderr;
    if (errText.includes("docker: command not found") || errText.includes("not found")) {
      return null;
    }
    throw new Error(`docker compose config failed: ${errText.slice(0, 500)}`);
  }
  return JSON.parse(stdout) as ComposeConfig;
}

function autoRestarts(restart: string | undefined): boolean {
  return restart === "unless-stopped" || restart === "always" || restart === "on-failure";
}

test("every long-running service has an auto-restart policy", async () => {
  let dockerAvailable = true;
  const offenders: string[] = [];
  for (const scenario of SCENARIOS) {
    const config = await dockerComposeConfig(scenario.files, scenario.profiles ?? [], scenario.env);
    if (config === null) {
      dockerAvailable = false;
      break;
    }
    if (!config.services) continue;
    for (const [name, svc] of Object.entries(config.services)) {
      if (ONE_SHOT_SERVICES.has(name)) continue;
      if (!autoRestarts(svc.restart)) {
        offenders.push(`${scenario.name}/${name} (restart=${JSON.stringify(svc.restart)})`);
      }
    }
  }
  if (!dockerAvailable) {
    return;
  }
  assert(
    offenders.length === 0,
    `services without an auto-restart policy (set restart: unless-stopped):\n  ${offenders.join("\n  ")}\n\nIf a service is genuinely one-shot, add its name to ONE_SHOT_SERVICES in this test.`
  );
});
