import { connect } from "node:net";
export interface WaitForOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onAttemptMs?: number;
}

export async function waitForUrl(url: string, opts: WaitForOptions = {}): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 1_000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const onAttemptMs = opts.onAttemptMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);

  const tcpOpen = async (): Promise<boolean> => {
    try {
      await new Promise<void>((resolve, reject) => {
        const conn = connect({ host: hostname, port }, () => {
          conn.destroy();
          resolve();
        });
        conn.on("error", reject);
      });
      return true;
    } catch {
      return false;
    }
  };

  const httpOk = async (): Promise<boolean> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(onAttemptMs) });
      return res.ok;
    } catch {
      return false;
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    if ((await tcpOpen()) && (await httpOk())) return true;
    await sleep(intervalMs);
  }
  return false;
}
