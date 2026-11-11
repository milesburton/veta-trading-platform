import { provisionLoginRole } from "./loginRole.ts";

export const APP_LOGIN_ROLE = "veta_app";

export function provisionAppLogin(databaseUrl: string, password: string): Promise<void> {
  return provisionLoginRole(databaseUrl, APP_LOGIN_ROLE, "app_service", password);
}
