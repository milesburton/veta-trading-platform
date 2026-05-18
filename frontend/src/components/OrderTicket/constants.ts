export const TIF_OPTIONS = [
  { value: "DAY", label: "DAY", title: "Day order — expires at market close" },
  { value: "GTC", label: "GTC", title: "Good Till Cancelled" },
  {
    value: "IOC",
    label: "IOC",
    title: "Immediate Or Cancel — fill what you can instantly",
  },
  {
    value: "FOK",
    label: "FOK",
    title: "Fill Or Kill — all or nothing immediately",
  },
] as const;

export type TifValue = (typeof TIF_OPTIONS)[number]["value"];

export const OPTION_EXPIRIES = [
  { label: "7d", secs: 7 * 86400 },
  { label: "14d", secs: 14 * 86400 },
  { label: "30d", secs: 30 * 86400 },
  { label: "60d", secs: 60 * 86400 },
  { label: "90d", secs: 90 * 86400 },
];
