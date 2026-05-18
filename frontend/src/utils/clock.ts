function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(input: Date | number | string): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

export function formatUtcTime(date: Date | number | string): string {
  const d = toDate(date);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function formatUtcDateTime(date: Date | number | string): string {
  const d = toDate(date);
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${year}-${month}-${day} ${formatUtcTime(d)}`;
}
