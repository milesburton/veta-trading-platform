import type { MsgProducer } from "@veta/messaging";
import type { RateLimiter } from "@veta/rate-limit";
import type { LoadAgent } from "./loadAgent.ts";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
}

export interface UserLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
  allowed_desks?: string[];
  dark_pool_access?: boolean;
  trading_style?: string;
  primary_desk?: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
  limits: UserLimits;
}

export interface GatewayContext {
  requireAuth: (req: Request) => Promise<AuthResult | Response>;
  producer: MsgProducer;
  publishAccessEvent: (event: AccessEvent) => void;
  urls: ServiceUrls;
  loadAgent: LoadAgent;
  guestSubmitLimiter: RateLimiter;
  publicGuestTradingEnabled: boolean;
}

export interface AccessEvent {
  action: string;
  userId?: string;
  userRole?: string;
  path?: string;
  reason?: string;
  orderId?: string;
  scope?: string;
  scopeValue?: string;
  source?: "loadgen";
}

export interface ServiceUrls {
  marketSim: string;
  journal: string;
  userService: string;
  analytics: string;
  marketData: string;
  llmAdvisory: string;
  newsAggregator: string;
  rfqService: string;
  ccpService: string;
  darkPool: string;
  productService: string;
  recommendationEngine: string;
  scenarioEngine: string;
  signalEngine: string;
  featureEngine: string;
  fixArchive: string;
  fixGateway: string;
  kafkaRelay: string;
  emsUrl: string;
  omsUrl: string;
  riskEngine: string;
  replay: string;
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
