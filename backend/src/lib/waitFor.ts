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
  const onAttemptMs = opts.onAttemptMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  const tryOnce = async (): Promise<boolean> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(onAttemptMs) });
      return res.ok;
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
