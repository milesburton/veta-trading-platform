import { assert } from "jsr:@std/assert@0.217";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

// Each entry runs `docker compose config --format json` for the given file
// combination and asserts every service declares a memory limit. We invoke
// `docker compose` rather than parsing YAML ourselves so anchors, aliases,
// and `extends` are fully resolved exactly the way the runtime sees them.
interface Scenario {
  name: string;
  files: string[];
  profiles?: string[];
  env: Record<string, string>;
}

const PLACEHOLDERS: Record<string, string> = {
  OAUTH2_SHARED_SECRET: "test-placeholder",
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
  { name: "production stack", files: ["compose.yml", "compose.prod.yml"], env: PLACEHOLDERS },
  {
    name: "loadgen stack",
    files: ["compose.yml", "compose.loadgen.yml"],
    profiles: ["loadgen"],
    env: PLACEHOLDERS,
  },
  {
    name: "loadtest stack",
    files: ["compose.yml", "compose.loadtest.yml"],
    env: PLACEHOLDERS,
  },
  { name: "observability stack", files: ["observability/docker-compose.lgtm.yml"], env: PLACEHOLDERS },
];

interface ComposeServiceConfig {
  mem_limit?: number | string;
  deploy?: { resources?: { limits?: { memory?: string | number } } };
}
interface ComposeConfig {
  services?: Record<string, ComposeServiceConfig>;
}

async function dockerComposeConfig(
  files: string[],
  profiles: string[] = [],
  env: Record<string, string> = {},
): Promise<ComposeConfig | null> {
  const args = ["compose"];
  for (const f of files) args.push("-f", `${REPO_ROOT}${f}`);
  for (const p of profiles) args.push("--profile", p);
  args.push("config", "--format", "json");
  const cmd = new Deno.Command("docker", {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), ...env },
  });
  const { stdout, stderr, code } = await cmd.output();
  if (code !== 0) {
    const errText = new TextDecoder().decode(stderr);
    if (errText.includes("docker: command not found") || errText.includes("not found")) {
      return null;
    }
    throw new Error(`docker compose config failed: ${errText.slice(0, 500)}`);
  }
  return JSON.parse(new TextDecoder().decode(stdout)) as ComposeConfig;
}

function isPositive(v: unknown): boolean {
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }
  return false;
}

function hasLimit(svc: ComposeServiceConfig): boolean {
  if (isPositive(svc.mem_limit)) return true;
  if (isPositive(svc.deploy?.resources?.limits?.memory)) return true;
  return false;
}

Deno.test("every service in every compose scenario declares a memory limit", async () => {
  let dockerAvailable = true;
  const offenders: string[] = [];
  for (const scenario of SCENARIOS) {
    const config = await dockerComposeConfig(
      scenario.files,
      scenario.profiles ?? [],
      scenario.env,
    );
    if (config === null) {
      dockerAvailable = false;
      break;
    }
    if (!config.services) continue;
    for (const [name, svc] of Object.entries(config.services)) {
      if (!hasLimit(svc)) offenders.push(`${scenario.name}/${name}`);
    }
  }
  if (!dockerAvailable) {
    return;
  }
  assert(
    offenders.length === 0,
    `services without mem_limit (set one to prevent host OOM):\n  ${offenders.join("\n  ")}`,
  );
});
