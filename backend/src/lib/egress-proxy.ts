import { isIP } from "node:net";
import { Agent, type Dispatcher, ProxyAgent, setGlobalDispatcher } from "undici";

export function isExternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (isIP(host) !== 0) return false;
  return host.includes(".");
}

function hostnameOf(origin: string | URL): string {
  return typeof origin === "string" ? new URL(origin).hostname : origin.hostname;
}

export function createEgressDispatcher(
  proxyUrl: string,
  direct: Dispatcher = new Agent()
): Dispatcher {
  const proxied = new ProxyAgent(proxyUrl);
  return direct.compose((next) => (options, handler) => {
    const external = options.origin !== undefined && isExternalHost(hostnameOf(options.origin));
    return external ? proxied.dispatch(options, handler) : next(options, handler);
  });
}

export function installEgressProxy(env: NodeJS.ProcessEnv = process.env): string | null {
  const proxyUrl = env.EGRESS_PROXY_URL?.trim();
  if (!proxyUrl) return null;
  setGlobalDispatcher(createEgressDispatcher(proxyUrl));
  return proxyUrl;
}
