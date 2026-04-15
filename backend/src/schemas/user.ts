import { z } from "@veta/zod";
import { UserIdSchema } from "./primitives.ts";

export const SessionValidateSchema = z.object({
  token: z.string().optional(),
});
export type SessionValidateRequest = z.infer<typeof SessionValidateSchema>;

export const LimitsUpdateSchema = z.object({
  max_order_qty: z.number().int().nonnegative().optional(),
  max_daily_notional: z.number().nonnegative().optional(),
  allowed_strategies: z.array(z.string()).optional(),
  allowed_desks: z.array(z.string()).optional(),
  dark_pool_access: z.boolean().optional(),
});
export type LimitsUpdate = z.infer<typeof LimitsUpdateSchema>;

export const PreferencesUpdateSchema = z.record(z.string(), z.unknown());
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;

export const SharedWorkspaceCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: z.unknown(),
}).refine((v) => v.model !== undefined && v.model !== null, {
  message: "model required",
  path: ["model"],
});
export type SharedWorkspaceCreate = z.infer<typeof SharedWorkspaceCreateSchema>;

export const AlertCreateSchema = z.object({
  id: z.string().optional(),
  severity: z.string().min(1),
  source: z.string().min(1),
  message: z.string().min(1),
  detail: z.string().optional(),
  ts: z.number().int().nonnegative().optional(),
});
export type AlertCreate = z.infer<typeof AlertCreateSchema>;

export const AuthorizeRequestSchema = z.object({
  client_id: z.string().optional(),
  username: z.string().optional(),
  userId: UserIdSchema.optional(),
  redirect_uri: z.string().optional(),
  response_type: z.literal("code"),
  scope: z.string().optional(),
  password: z.string().optional(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256"),
});
export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;

export const TokenRequestSchema = z.object({
  client_id: z.string().optional(),
  code: z.string().min(1),
  grant_type: z.literal("authorization_code"),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().min(1),
});
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: z.string().optional(),
  userId: UserIdSchema.optional(),
  name: z.string().min(1),
  password: z.string().optional(),
}).refine((v) => Boolean(v.username || v.userId), {
  message: "username or userId required",
  path: ["username"],
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
