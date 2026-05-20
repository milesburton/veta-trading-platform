import { gatewayHostEnvBlock, SERVICE_REGISTRY } from "../shared/serviceRegistry.ts";

const composePath = new URL("../compose.yml", import.meta.url).pathname;

const composeText = Deno.readTextFileSync(composePath);
const lines = composeText.split("\n");

let gatewayStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === "  gateway:") {
    gatewayStart = i;
    break;
  }
}
if (gatewayStart === -1) {
  console.error("Could not find 'gateway:' service in compose.yml");
  Deno.exit(1);
}

let nextServiceStart = lines.length;
for (let i = gatewayStart + 1; i < lines.length; i++) {
  if (/^  [a-z][a-z0-9-]+:$/.test(lines[i])) {
    nextServiceStart = i;
    break;
  }
}

let blockStart = -1;
let blockEnd = -1;
for (let i = gatewayStart + 1; i < nextServiceStart; i++) {
  const isHostLine = /^      [A-Z_]+_HOST: /.test(lines[i]);
  const isPortLine = /^      [A-Z_]+_PORT: /.test(lines[i]);
  if (blockStart === -1) {
    if (isHostLine) {
      blockStart = i;
      blockEnd = i;
    }
  } else {
    if (isHostLine || isPortLine) {
      blockEnd = i;
    } else {
      break;
    }
  }
}

if (blockStart === -1 || blockEnd === -1) {
  console.error("Could not locate HOST/PORT block inside gateway service");
  Deno.exit(1);
}

const before = lines.slice(0, blockStart).join("\n");
const after = lines.slice(blockEnd + 1).join("\n");
const newBlock = gatewayHostEnvBlock();

Deno.writeTextFileSync(composePath, `${before}\n${newBlock}\n${after}`);

console.log(
  `Regenerated gateway HOST env block in compose.yml ` +
    `(${SERVICE_REGISTRY.filter((s) => !s.excludeFromGatewayHostEnv).length} services, ` +
    `lines ${blockStart + 1}-${blockEnd + 1}).`,
);
