import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const outputPath = path.resolve(docsSiteRoot, "src/generated/build-info.ts");

function safe(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const manifestPath = path.join(repoRoot, ".release-please-manifest.json");
let version = "0.0.0";
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  version = manifest["."] ?? version;
} catch {}

const commitSha =
  process.env.GITHUB_SHA?.slice(0, 7) ?? safe("git rev-parse --short HEAD", "unknown");
const commitDate = safe("git log -1 --format=%cI", new Date().toISOString());
const buildDate = new Date().toISOString();

const contents = `export const BUILD_INFO = {
  version: ${JSON.stringify(version)},
  commitSha: ${JSON.stringify(commitSha)},
  commitDate: ${JSON.stringify(commitDate)},
  buildDate: ${JSON.stringify(buildDate)},
} as const;
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, contents);

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} (v${version}, ${commitSha}, built ${buildDate})`,
);
