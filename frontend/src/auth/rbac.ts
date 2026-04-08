export const AUTH_ROLES = [
  "trader",
  "desk-head",
  "admin",
  "compliance",
  "sales",
  "external-client",
  "viewer",
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const NON_TRADING_ROLES = new Set<AuthRole>([
  "desk-head",
  "admin",
  "compliance",
  "sales",
  "external-client",
  "viewer",
]);

export const ROLE_LABELS: Record<AuthRole, string> = {
  trader: "Trader",
  "desk-head": "Desk Head",
  admin: "Administrator",
  compliance: "Compliance",
  sales: "Sales",
  "external-client": "External Client",
  viewer: "Viewer",
};

export function canSubmitOrders(role: AuthRole | undefined): boolean {
  return role === "trader";
}
