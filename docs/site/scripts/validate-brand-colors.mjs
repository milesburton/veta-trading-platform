import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import process from "node:process";

const CUSTOM_CSS = resolve(import.meta.dirname, "../src/styles/custom.css");

if (!existsSync(CUSTOM_CSS)) {
  console.error(`Not found: ${CUSTOM_CSS}`);
  process.exit(1);
}

// Guards the fix in PR #557: custom.css maps the app's own background/accent
// tokens (frontend/src/index.css) onto Starlight's --sl-color-* variables so
// the two sites share one palette instead of Starlight's built-in defaults.
// A regression here is silent, the page still builds and renders, just with
// the wrong colour, so this asserts the mapping exists in source rather than
// relying on someone noticing the drift visually.
const REQUIRED_MAPPINGS = [
  { starlightVar: "--sl-color-bg", appVar: "--gray-950" },
  { starlightVar: "--sl-color-bg-nav", appVar: "--gray-900" },
  { starlightVar: "--sl-color-bg-sidebar", appVar: "--gray-900" },
  { starlightVar: "--sl-color-accent", appVar: "--semantic-cross" },
];

const css = await readFile(CUSTOM_CSS, "utf8");

const errors = [];

for (const { starlightVar, appVar } of REQUIRED_MAPPINGS) {
  const escapedStarlight = starlightVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedApp = appVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escapedStarlight}:\\s*rgb\\(\\s*var\\(\\s*${escapedApp}\\s*\\)`);
  if (!re.test(css)) {
    errors.push(`${starlightVar} does not map to rgb(var(${appVar})) in ${CUSTOM_CSS}.`);
  }
}

if (errors.length > 0) {
  console.error("Brand colour validation failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Brand colour validation passed (${REQUIRED_MAPPINGS.length} mapping(s) checked).`);
