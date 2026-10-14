export function nextDelayMs(minMs: number, maxMs: number, random: () => number = Math.random): number {
  return minMs + random() * (maxMs - minMs);
}
