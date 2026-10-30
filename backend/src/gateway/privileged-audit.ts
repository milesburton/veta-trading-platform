import type { AuditEvent } from "../lib/audit.ts";
import { type AuthResult, type GatewayContext, isResponse } from "./context.ts";

interface PrivilegedRule {
  methods: readonly string[];
  pattern: RegExp;
  action: string;
}

const WRITE = ["POST", "PUT", "DELETE"] as const;

export const PRIVILEGED_RULES: readonly PrivilegedRule[] = [
  { methods: ["PUT"], pattern: /^\/admin\/market-hours$/, action: "market_hours_update" },
  { methods: ["POST"], pattern: /^\/load-test$/, action: "load_test_run" },
  { methods: ["POST"], pattern: /^\/demo-day$/, action: "demo_day_run" },
  { methods: ["POST"], pattern: /^\/load-gen\/(start|stop)$/, action: "load_gen_control" },
  { methods: ["PUT"], pattern: /^\/upgrade-status$/, action: "upgrade_status_update" },
  { methods: ["PUT"], pattern: /^\/intelligence\/weights$/, action: "intelligence_weights_update" },
  { methods: ["PUT"], pattern: /^\/advisory\/admin\/state$/, action: "advisory_state_update" },
  {
    methods: ["POST"],
    pattern: /^\/advisory\/admin\/(trigger-worker|watchlist-brief)$/,
    action: "advisory_admin_action",
  },
  {
    methods: ["PUT"],
    pattern: /^\/market-data\/overrides$/,
    action: "market_data_override_update",
  },
  {
    methods: ["POST"],
    pattern: /^\/market-data\/sources\/[^/]+\/toggle$/,
    action: "market_data_source_toggle",
  },
  { methods: ["POST"], pattern: /^\/products$/, action: "product_create" },
  {
    methods: ["PUT"],
    pattern: /^\/products\/[^/]+\/(legs|structure|issue|sell|unwind)$/,
    action: "product_lifecycle",
  },
  {
    methods: ["PUT"],
    pattern: /^\/rfq\/sellside\/[^/]+\/(route|markup)$/,
    action: "rfq_sellside_handling",
  },
  { methods: WRITE, pattern: /^\/api\/market-sim\/admin\//, action: "market_sim_admin" },
  { methods: WRITE, pattern: /^\/api\/risk-engine\//, action: "risk_engine_change" },
];

export function classifyPrivileged(method: string, path: string): string | null {
  return (
    PRIVILEGED_RULES.find((r) => r.methods.includes(method) && r.pattern.test(path))?.action ?? null
  );
}

export function buildAuditEvent(
  actor: AuthResult,
  action: string,
  method: string,
  path: string,
  status: number
): AuditEvent {
  return {
    actorId: actor.user.id,
    actorRole: actor.user.role,
    action,
    target: path,
    detail: { method, status },
  };
}

export type AuditPublisher = (event: AuditEvent) => void;

export function makeAuditPublisher(producer: GatewayContext["producer"]): AuditPublisher {
  return (event) => {
    producer?.send("audit.events", event).catch(() => undefined);
  };
}

export async function runWithAudit(
  req: Request,
  path: string,
  ctx: GatewayContext,
  publish: AuditPublisher,
  run: (ctx: GatewayContext) => Promise<Response | null>
): Promise<Response | null> {
  const action = classifyPrivileged(req.method, path);
  if (!action) return run(ctx);

  const state: { actor: AuthResult | null } = { actor: null };
  const observed: GatewayContext = {
    ...ctx,
    requireAuth: async (r) => {
      const auth = await ctx.requireAuth(r);
      if (!isResponse(auth)) state.actor = auth;
      return auth;
    },
  };

  const response = await run(observed);
  if (response && state.actor && response.status < 400) {
    publish(buildAuditEvent(state.actor, action, req.method, path, response.status));
  }
  return response;
}
