export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBps(bps: number) {
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toFixed(1)}bp`;
}
