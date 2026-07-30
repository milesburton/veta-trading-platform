const NEW_YORK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isUsEquityRegularSession(now = new Date()): boolean {
  const parts = Object.fromEntries(
    NEW_YORK_CLOCK.formatToParts(now).map((part) => [part.type, part.value])
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60;
}

export function parseAllowOutOfHours(value: string | undefined): boolean {
  if (value === undefined) return true;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
