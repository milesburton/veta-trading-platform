import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@0.217";
import { parse as parseJsonc } from "jsr:@std/jsonc@0.224";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const DEVCONTAINER_JSON = `${REPO_ROOT}.devcontainer/devcontainer.json`;
const POST_START_SH = `${REPO_ROOT}.devcontainer/post-start.sh`;

type DevcontainerConfig = {
  workspaceFolder?: string;
  postCreateCommand?: string;
  postStartCommand?: string;
};

async function loadDevcontainer(): Promise<DevcontainerConfig> {
  const raw = await Deno.readTextFile(DEVCONTAINER_JSON);
  return parseJsonc(raw) as DevcontainerConfig;
}

Deno.test("[devcontainer] devcontainer.json parses as valid JSONC", async () => {
  const cfg = await loadDevcontainer();
  if (!cfg.workspaceFolder) {
    throw new Error("workspaceFolder must be set");
  }
});

Deno.test("[devcontainer] post-start.sh has no hardcoded workspace path that diverges from workspaceFolder", async () => {
  const cfg = await loadDevcontainer();
  const script = await Deno.readTextFile(POST_START_SH);
  const workspace = cfg.workspaceFolder;

  const match = script.match(/^workspace_dir=["']?([^"'$\n]+)["']?/m);
  if (match) {
    const literalPath = match[1];
    assertEquals(
      literalPath,
      workspace,
      `post-start.sh hardcodes workspace_dir="${literalPath}" but devcontainer.json sets workspaceFolder="${workspace}". ` +
        `If you must hardcode, use the same path; better, read CONTAINER_WORKSPACE_FOLDER from the environment.`
    );
  }

  const badPaths = ["/workspaces/project", "/workspace", "/code"];
  for (const bad of badPaths) {
    assert(
      !script.includes(`workspace_dir="${bad}"`) &&
        !script.includes(`cd "${bad}"`) &&
        !script.includes(`cd ${bad}`),
      `post-start.sh references "${bad}" which is a template path that does not exist in this repo`
    );
  }
});

Deno.test("[devcontainer] post-start.sh is syntactically valid bash", async () => {
  const cmd = new Deno.Command("bash", { args: ["-n", POST_START_SH] });
  const { code, stderr } = await cmd.output();
  assertEquals(
    code,
    0,
    `bash -n reported syntax errors in post-start.sh:\n${new TextDecoder().decode(stderr)}`
  );
});

Deno.test("[devcontainer] postStartCommand passes CONTAINER_WORKSPACE_FOLDER so the script does not need to hardcode it", async () => {
  const cfg = await loadDevcontainer();
  const cmd = cfg.postStartCommand ?? "";
  assertStringIncludes(
    cmd,
    `CONTAINER_WORKSPACE_FOLDER=\${containerWorkspaceFolder}`,
    `postStartCommand should pass CONTAINER_WORKSPACE_FOLDER=\${containerWorkspaceFolder} into the script — this is how post-start.sh learns the real workspace path without hardcoding it.`
  );
});

Deno.test("[devcontainer] postCreateCommand does not use husky's deprecated 'install <dir>' form", async () => {
  const cfg = await loadDevcontainer();
  const cmd = cfg.postCreateCommand ?? "";
  assert(
    !/husky\s+install\b/.test(cmd),
    `postCreateCommand uses 'husky install ...' — this is deprecated in husky v9 and removed in v10. ` +
      `Use plain './frontend/node_modules/.bin/husky' (auto-detects .husky/).`
  );
});

Deno.test("[devcontainer] postCreateCommand and postStartCommand reference paths that exist", async () => {
  const cfg = await loadDevcontainer();
  const checks = [
    { hook: "postCreateCommand", cmd: cfg.postCreateCommand ?? "", paths: ["frontend", ".husky"] },
    {
      hook: "postStartCommand",
      cmd: cfg.postStartCommand ?? "",
      paths: [".devcontainer/post-start.sh"],
    },
  ];
  for (const { hook, cmd, paths } of checks) {
    for (const p of paths) {
      if (!cmd.includes(p)) continue;
      const fullPath = `${REPO_ROOT}${p}`;
      try {
        await Deno.stat(fullPath);
      } catch {
        throw new Error(`${hook} references "${p}" but ${fullPath} does not exist`);
      }
    }
  }
});
