import { provisionLoginRole } from "./loginRole.ts";

export const AUDIT_LOGIN_ROLE = "veta_audit";

export function provisionAuditLogin(databaseUrl: string, password: string): Promise<void> {
  return provisionLoginRole(databaseUrl, AUDIT_LOGIN_ROLE, "audit_writer", password);
}
