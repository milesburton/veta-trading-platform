import { getCookieToken } from "@veta/auth";
import { logger } from "@veta/logger";
import { clientIp, RateLimiter } from "@veta/rate-limit";
import { AbuseTracker } from "../abuseTracker.ts";
import {
  addAnonymousSocket,
  addUserSocket,
  broadcastAll,
  removeSocket,
  totalConnections,
} from "../connections.ts";
import type { AuthResult, GatewayContext } from "../context.ts";
import { classifyRequestSource } from "../requestSource.ts";

const WS_FRAME_CAPACITY = Number(Deno.env.get("WS_FRAME_CAPACITY")) || 100;
const WS_FRAME_REFILL_PER_SECOND = Number(Deno.env.get("WS_FRAME_REFILL_PER_SECOND")) || 10;

// docs: /platform/security/
const abuseTracker = new AbuseTracker();

export interface WebSocketRouteDeps {
  validateToken: (token: string) => Promise<AuthResult | null>;
}

const TRADER_ROLES_FOR_MGMT = ["trader", "desk-head", "risk-manager", "admin"];

export async function handleWebSocketRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
  deps: WebSocketRouteDeps
): Promise<Response | null> {
  if (path !== "/ws" && path !== "/ws/gateway") return null;
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const token = getCookieToken(req);
  // docs: /platform/security/
  // #region docs:ws-upgrade-auth-order
  const remoteIp = clientIp(req);
  const source = classifyRequestSource(req.headers.get("user-agent"));
  const initialAuthPromise: Promise<AuthResult | null> = token
    ? deps.validateToken(token)
    : Promise.resolve(null);

  const pendingAuth = await initialAuthPromise;
  // #endregion docs:ws-upgrade-auth-order
  const pendingUserId = pendingAuth?.user.id ?? null;
  const upgradeDecision = abuseTracker.upgradeDecision(pendingUserId);
  if (upgradeDecision.kind === "blockUser") {
    ctx.publishAccessEvent({
      action: "ws_blocked",
      userId: pendingUserId ?? undefined,
      reason: upgradeDecision.reason,
      source,
    });
    const retryAfterSec = Math.max(1, Math.ceil((upgradeDecision.until - Date.now()) / 1000));
    return new Response(
      JSON.stringify({
        error: "user_backoff",
        retryAfterSeconds: retryAfterSec,
        message: upgradeDecision.reason,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) },
      }
    );
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let auth: AuthResult | null = pendingAuth;
  let socketUserId: string | null = pendingUserId;

  const frameLimiter = new RateLimiter({
    capacity: WS_FRAME_CAPACITY,
    refillPerSecond: WS_FRAME_REFILL_PER_SECOND,
  });

  socket.onopen = () => {
    if (socketUserId) addUserSocket(socketUserId, socket);
    else addAnonymousSocket(socket);
    logger.info(
      `Client connected user=${socketUserId ?? "anonymous"} (total=${totalConnections()})`
    );
    if (auth) {
      socket.send(
        JSON.stringify({
          event: "authIdentity",
          data: { user: auth.user, limits: auth.limits },
        })
      );
      ctx.publishAccessEvent({
        action: "ws_connect",
        userId: auth.user.id,
        userRole: auth.user.role,
      });
    } else {
      ctx.publishAccessEvent({
        action: "ws_connect",
        reason: "anonymous — no valid session",
      });
    }
  };

  socket.onmessage = async (event) => {
    const limit = frameLimiter.consume("socket");
    if (!limit.allowed) {
      ctx.publishAccessEvent({
        action: "ws_rate_limited",
        userId: socketUserId ?? undefined,
        reason: `retryAfterMs=${limit.retryAfterMs}`,
        source,
      });
      socket.send(
        JSON.stringify({
          event: "rateLimited",
          data: { retryAfterMs: limit.retryAfterMs },
        })
      );
      const decision = abuseTracker.recordRateLimited(socket, socketUserId);
      if (decision.kind !== "ok") {
        ctx.publishAccessEvent({
          action: "ws_disconnected_abuse",
          userId: socketUserId ?? undefined,
          reason: decision.reason,
        });
        try {
          socket.send(
            JSON.stringify({
              event: "disconnectedAbuse",
              data: { reason: decision.reason },
            })
          );
        } catch {
          /* ignore */
        }
        socket.close(1008, "abuse — too many rate-limited frames");
      }
      return;
    }
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        payload: Record<string, unknown>;
      };

      if (msg.type === "authenticate") {
        const tok = msg.payload.token as string | undefined;
        const result = tok ? await deps.validateToken(tok) : null;
        if (result) {
          removeSocket(socketUserId, socket);
          auth = result;
          socketUserId = result.user.id;
          addUserSocket(socketUserId, socket);
          socket.send(
            JSON.stringify({
              event: "authIdentity",
              data: { user: result.user, limits: result.limits },
            })
          );
          ctx.publishAccessEvent({
            action: "ws_connect",
            userId: result.user.id,
            userRole: result.user.role,
          });
        } else {
          socket.send(
            JSON.stringify({
              event: "authError",
              data: { reason: "Invalid or expired token" },
            })
          );
        }
        return;
      }

      if (msg.type === "submitOrder") {
        const currentAuth = auth ?? (token ? await deps.validateToken(token) : null);
        if (!currentAuth) {
          ctx.publishAccessEvent({
            action: "order_rejected",
            reason: "unauthenticated — session expired",
          });
          socket.send(
            JSON.stringify({
              event: "orderRejected",
              data: {
                reason: "Unauthenticated — please log in again",
                clientOrderId: msg.payload.clientOrderId ?? null,
              },
            })
          );
          return;
        }
        const role = currentAuth.user.role;
        const isTrader = role === "trader";
        const isGuest = role === "guest" && ctx.publicGuestTradingEnabled;
        if (!isTrader && !isGuest) {
          ctx.publishAccessEvent({
            action: "order_rejected",
            reason: `role ${role} is not permitted to submit orders`,
            userId: currentAuth.user.id,
            userRole: role,
          });
          socket.send(
            JSON.stringify({
              event: "orderRejected",
              data: {
                reason: `${role} accounts are not permitted to submit orders`,
                clientOrderId: msg.payload.clientOrderId ?? null,
              },
            })
          );
          return;
        }
        if (isGuest) {
          const guestResult = ctx.guestSubmitLimiter.consume(`submit:${remoteIp}`);
          if (!guestResult.allowed) {
            ctx.publishAccessEvent({
              action: "order_rejected",
              reason: `guest rate limit (retry after ${Math.ceil(guestResult.retryAfterMs / 1000)}s)`,
              userId: currentAuth.user.id,
              userRole: role,
            });
            socket.send(
              JSON.stringify({
                event: "orderRejected",
                data: {
                  reason: `Rate limit — try again in ${Math.ceil(guestResult.retryAfterMs / 1000)}s`,
                  retryAfterMs: guestResult.retryAfterMs,
                  clientOrderId: msg.payload.clientOrderId ?? null,
                },
              })
            );
            return;
          }
        }
        if (!ctx.producer.isReady()) {
          socket.send(
            JSON.stringify({
              event: "error",
              message: "Bus unavailable — order not submitted",
            })
          );
          return;
        }
        const orderWithUser = {
          ...msg.payload,
          userId: currentAuth.user.id,
          userRole: currentAuth.user.role,
        };
        await ctx.producer.send("orders.new", orderWithUser);
        ctx.publishAccessEvent({
          action: "order_submitted",
          userId: currentAuth.user.id,
          userRole: currentAuth.user.role,
          orderId: (msg.payload.clientOrderId ?? msg.payload.orderId) as string | undefined,
        });
        socket.send(JSON.stringify({ event: "orderAck", data: orderWithUser }));
      }

      if (msg.type === "killOrders") {
        const currentAuth = auth ?? (token ? await deps.validateToken(token) : null);
        if (!currentAuth) {
          ctx.publishAccessEvent({
            action: "auth_failure",
            reason: "killOrders — unauthenticated",
            source,
          });
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Unauthenticated — please log in again" },
            })
          );
          return;
        }
        if (currentAuth.user.role !== "admin" && currentAuth.user.role !== "trader") {
          ctx.publishAccessEvent({
            action: "auth_failure",
            reason: `killOrders — role ${currentAuth.user.role} not permitted`,
            userId: currentAuth.user.id,
            source,
          });
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Kill switch requires admin or trader role" },
            })
          );
          return;
        }
        if (!ctx.producer.isReady()) {
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Bus unavailable" },
            })
          );
          return;
        }
        const killCommand = {
          ...msg.payload,
          issuedBy: currentAuth.user.id,
          issuedByRole: currentAuth.user.role,
          ts: Date.now(),
        };
        await ctx.producer.send("orders.kill", killCommand);
        ctx.publishAccessEvent({
          action: "orders_kill",
          userId: currentAuth.user.id,
          userRole: currentAuth.user.role,
          scope: msg.payload.scope as string | undefined,
          scopeValue: msg.payload.scopeValue as string | undefined,
        });
        socket.send(JSON.stringify({ event: "killAck", data: killCommand }));
      }

      if (msg.type === "resumeOrders") {
        const currentAuth = auth ?? (token ? await deps.validateToken(token) : null);
        if (!currentAuth) {
          ctx.publishAccessEvent({
            action: "auth_failure",
            reason: "resumeOrders — unauthenticated",
            source,
          });
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Unauthenticated — please log in again" },
            })
          );
          return;
        }
        if (currentAuth.user.role !== "admin") {
          ctx.publishAccessEvent({
            action: "auth_failure",
            reason: `resumeOrders — role ${currentAuth.user.role} not permitted`,
            userId: currentAuth.user.id,
            source,
          });
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Resume requires admin role" },
            })
          );
          return;
        }
        if (!ctx.producer.isReady()) {
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Bus unavailable" },
            })
          );
          return;
        }
        const resumeCommand = {
          ...msg.payload,
          issuedBy: currentAuth.user.id,
          issuedByRole: currentAuth.user.role,
          ts: Date.now(),
        };
        await ctx.producer.send("orders.resume", resumeCommand);
        ctx.publishAccessEvent({
          action: "orders_resume",
          userId: currentAuth.user.id,
          userRole: currentAuth.user.role,
          scope: msg.payload.scope as string | undefined,
          scopeValue: msg.payload.scopeValue as string | undefined,
        });
        socket.send(JSON.stringify({ event: "resumeAck", data: resumeCommand }));
      }

      if (msg.type === "cancelOrders" || msg.type === "holdOrders" || msg.type === "unholdOrders") {
        const currentAuth = auth ?? (token ? await deps.validateToken(token) : null);
        if (!currentAuth) {
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Unauthenticated" },
            })
          );
          return;
        }
        if (!TRADER_ROLES_FOR_MGMT.includes(currentAuth.user.role)) {
          socket.send(
            JSON.stringify({
              event: "error",
              data: {
                message: `${currentAuth.user.role} cannot manage orders`,
              },
            })
          );
          return;
        }
        if (!ctx.producer.isReady()) {
          socket.send(
            JSON.stringify({
              event: "error",
              data: { message: "Bus unavailable" },
            })
          );
          return;
        }
        const topicMap: Record<string, string> = {
          cancelOrders: "orders.cancelled",
          holdOrders: "orders.held",
          unholdOrders: "orders.unhold",
        };
        const orderIds = (msg.payload.orderIds ?? []) as string[];
        for (const orderId of orderIds) {
          const command = {
            clientOrderId: orderId,
            issuedBy: currentAuth.user.id,
            issuedByRole: currentAuth.user.role,
            ts: Date.now(),
          };
          await ctx.producer.send(topicMap[msg.type], command);
        }
        const ackEvent =
          msg.type === "cancelOrders"
            ? "cancelAck"
            : msg.type === "holdOrders"
              ? "holdAck"
              : "unholdAck";
        socket.send(
          JSON.stringify({
            event: ackEvent,
            data: { orderIds, issuedBy: currentAuth.user.id },
          })
        );
        broadcastAll({
          event: "orderEvent",
          topic: topicMap[msg.type],
          data: { orderIds, issuedBy: currentAuth.user.id },
        });
      }
    } catch (err) {
      socket.send(
        JSON.stringify({
          event: "error",
          message: (err as Error).message,
        })
      );
    }
  };

  socket.onclose = () => {
    removeSocket(socketUserId, socket);
    abuseTracker.forgetSocket(socket);
    logger.info(
      `Client disconnected user=${socketUserId ?? "anonymous"} (total=${totalConnections()})`
    );
  };

  socket.onerror = () => socket.close();

  return response;
}
