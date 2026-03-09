/**
 * tcp-proxy.ts — minimal TCP port forwarder.
 *
 * Usage:  deno run --allow-net scripts/tcp-proxy.ts <listenPort> <targetPort>
 *
 * Replaces `socat TCP-LISTEN:<listenPort>,fork,reuseaddr TCP:localhost:<targetPort>`
 * for environments where socat is not available (e.g. devcontainer without sudo).
 */

const listenPort = Number(Deno.args[0]);
const targetPort = Number(Deno.args[1]);

if (!listenPort || !targetPort) {
  console.error("Usage: tcp-proxy.ts <listenPort> <targetPort>");
  Deno.exit(1);
}

const listener = Deno.listen({ port: listenPort, hostname: "0.0.0.0" });
console.log(`[tcp-proxy] ${listenPort} → localhost:${targetPort}`);

for await (const inbound of listener) {
  handleConn(inbound).catch(() => {});
}

async function handleConn(inbound: Deno.TcpConn) {
  let outbound: Deno.TcpConn | undefined;
  try {
    outbound = await Deno.connect({ hostname: "127.0.0.1", port: targetPort });
    await Promise.all([
      inbound.readable.pipeTo(outbound.writable).catch(() => {}),
      outbound.readable.pipeTo(inbound.writable).catch(() => {}),
    ]);
  } catch {
    // connection closed or target unavailable — silently drop
  } finally {
    try { inbound.close(); } catch { /* ignore */ }
    try { outbound?.close(); } catch { /* ignore */ }
  }
}
