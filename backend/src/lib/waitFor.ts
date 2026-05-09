export interface WaitForOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onAttemptMs?: number;
}

export async function waitForUrl(
  url: string,
  opts: WaitForOptions = {},
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 1_000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = Number(parsed.port) ||
    (parsed.protocol === "https:" ? 443 : 80);

  const tryOnce = async (): Promise<boolean> => {
    try {
      const conn = await Deno.connect({ hostname, port });
      conn.close();
      return true;
    } catch {
      return false;
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    if (await tryOnce()) return true;
    await sleep(intervalMs);
  }
  return false;
}
