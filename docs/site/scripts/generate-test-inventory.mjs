import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsSiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(docsSiteRoot, "..", "..");
const outputPath = path.resolve(docsSiteRoot, "src/data/test-inventory.json");

const denoJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "deno.json"), "utf8"),
);

function extractFilesFromTask(taskCmd) {
  if (!taskCmd) return [];
  const matches = taskCmd.match(/backend\/src\/tests\/[^\s&]+\.ts/g) ?? [];
  return [...new Set(matches)];
}

function countDenoTests(absPath) {
  if (!fs.existsSync(absPath)) return 0;
  const content = fs.readFileSync(absPath, "utf8");
  const denoTest = (content.match(/\bDeno\.test\s*\(/g) ?? []).length;
  const tStep = (content.match(/\bt\.step\s*\(/g) ?? []).length;
  return denoTest + tStep;
}

function walkFrontendTests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFrontendTests(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) &&
      full.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      out.push(full);
    }
  }
  return out;
}

function countVitestCases(absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  const itCalls = (content.match(/(?<![A-Za-z0-9_$])it\s*\(/g) ?? []).length;
  const testCalls = (content.match(/(?<![A-Za-z0-9_$])test\s*\(/g) ?? []).length;
  return itCalls + testCalls;
}

function countPlaywrightSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".spec.ts"))
    .map((d) => d.name);
}

function backendSuite(taskCmd) {
  const files = extractFilesFromTask(taskCmd);
  let cases = 0;
  const perFile = {};
  for (const rel of files) {
    const c = countDenoTests(path.join(repoRoot, rel));
    cases += c;
    perFile[path.basename(rel)] = c;
  }
  return { files: files.length, cases, perFile };
}

const backendUnit = backendSuite(denoJson.tasks?.test);
const backendIntegration = backendSuite(denoJson.tasks?.["test:integration"]);
const backendSmoke = backendSuite(denoJson.tasks?.["test:smoke"]);
const backendTestcontainers = backendSuite(
  denoJson.tasks?.["test:testcontainers"],
);

const frontendTestRoot = path.join(repoRoot, "frontend/src");
const frontendTestFiles = walkFrontendTests(frontendTestRoot);
const frontendUnitCases = frontendTestFiles.reduce(
  (sum, f) => sum + countVitestCases(f),
  0,
);

const playwrightSpecs = countPlaywrightSpecs(
  path.join(repoRoot, "frontend/tests"),
);
const electronSpecs = countPlaywrightSpecs(
  path.join(repoRoot, "frontend/tests-electron"),
);
const gateSmokeFile = path.join(
  repoRoot,
  "frontend/tests/gate/smoke.spec.ts",
);
const gateSmokeCases = fs.existsSync(gateSmokeFile)
  ? countVitestCases(gateSmokeFile)
  : 0;

const supervisordConf = fs.readFileSync(
  path.join(repoRoot, "supervisord.conf"),
  "utf8",
);
const supervisordServiceCount = (
  supervisordConf.match(/^\[program:[^\]]+\]/gm) ?? []
).length;

const inventory = {
  backend: {
    unit: backendUnit,
    integration: backendIntegration,
    smoke: backendSmoke,
    testcontainers: backendTestcontainers,
  },
  frontend: {
    unit: { files: frontendTestFiles.length, cases: frontendUnitCases },
    playwright: { files: playwrightSpecs.length, specs: playwrightSpecs.sort() },
    electron: { files: electronSpecs.length, specs: electronSpecs.sort() },
    gateSmoke: { cases: gateSmokeCases },
  },
  platform: {
    supervisordServices: supervisordServiceCount,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2) + "\n");

console.log(
  `Generated ${path.relative(repoRoot, outputPath)} ` +
    `(backend unit ${backendUnit.files}/${backendUnit.cases}, ` +
    `frontend unit ${frontendTestFiles.length}/${frontendUnitCases}, ` +
    `playwright ${playwrightSpecs.length}, electron ${electronSpecs.length})`,
);
