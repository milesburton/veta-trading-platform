import { connect, createServer } from "node:net";
/**
 * tcp-proxy.ts — minimal TCP port forwarder.
 *
 * Usage:  node scripts/tcp-proxy.ts <listenPort> <targetPort>
 *
 * Replaces `socat TCP-LISTEN:<listenPort>,fork,reuseaddr TCP:localhost:<targetPort>`
 * for environments where socat is not available (e.g. devcontainer without sudo).
 */

const listenPort = Number(process.argv.slice(2)[0]);
const targetPort = Number(process.argv.slice(2)[1]);

if (!listenPort || !targetPort) {
  console.error("Usage: tcp-proxy.ts <listenPort> <targetPort>");
  process.exit(1);
}

console.log(`[tcp-proxy] ${listenPort} → localhost:${targetPort}`);

createServer((inbound) => {
  const outbound = connect({ host: "127.0.0.1", port: targetPort });
  inbound.pipe(outbound);
  outbound.pipe(inbound);
  const close = () => {
    inbound.destroy();
    outbound.destroy();
  };
  inbound.on("error", close);
  outbound.on("error", close);
  inbound.on("close", close);
  outbound.on("close", close);
}).listen(listenPort, "0.0.0.0");
