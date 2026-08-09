export interface FinancialCenter {
  id: string;
  label: string;
  timezone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

export const FINANCIAL_CENTERS: FinancialCenter[] = [
  {
    id: "NYC",
    label: "New York",
    timezone: "America/New_York",
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
  },
  {
    id: "LON",
    label: "London",
    timezone: "Europe/London",
    openHour: 8,
    openMinute: 0,
    closeHour: 16,
    closeMinute: 30,
  },
  {
    id: "FRA",
    label: "Frankfurt",
    timezone: "Europe/Berlin",
    openHour: 9,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 30,
  },
  {
    id: "HKG",
    label: "Hong Kong",
    timezone: "Asia/Hong_Kong",
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
  },
  {
    id: "TYO",
    label: "Tokyo",
    timezone: "Asia/Tokyo",
    openHour: 9,
    openMinute: 0,
    closeHour: 15,
    closeMinute: 0,
  },
  {
    id: "SYD",
    label: "Sydney",
    timezone: "Australia/Sydney",
    openHour: 10,
    openMinute: 0,
    closeHour: 16,
    closeMinute: 0,
  },
];

function minutesInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isCenterOpen(center: FinancialCenter, now: Date): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: center.timezone,
    weekday: "short",
  }).format(now);
  if (day === "Sat" || day === "Sun") return false;

  const nowMinutes = minutesInTimezone(now, center.timezone);
  const openMinutes = center.openHour * 60 + center.openMinute;
  const closeMinutes = center.closeHour * 60 + center.closeMinute;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function formatCenterTime(center: FinancialCenter, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: center.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

export function formatCenterDate(center: FinancialCenter, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: center.timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(now);
}
