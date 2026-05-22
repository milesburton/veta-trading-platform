/**
 * Tracks abuse-shaped behaviour against a websocket connection and the user
 * behind it, producing escalation decisions:
 *
 *   Level 1 (handled by frame rate-limiter): reject a single over-rate frame
 *           and send `rateLimited` back. Soft. Not handled here.
 *
 *   Level 2 (this module): a single socket hits the per-socket frame limit
 *           >= ABUSE_PER_SOCKET_THRESHOLD times within ABUSE_PER_SOCKET_WINDOW_MS.
 *           Decision: forceClose. The socket is force-closed and a
 *           ws_disconnected_abuse access event is published.
 *
 *   Level 3 (this module): a single userId has had >= ABUSE_USER_FORCE_CLOSE_THRESHOLD
 *           force-closes within ABUSE_USER_WINDOW_MS. Decision: blockUser.
 *           New WS upgrade attempts for that userId are refused for
 *           ABUSE_USER_BACKOFF_MS. Cools off automatically.
 *
 * No IP-banning. UserIds are the precise control surface. Unauthenticated
 * sockets share an "anonymous" key, so all level-3 effects on anonymous
 * traffic apply globally. That matches the platform's threat model: a real
 * attacker authenticating anonymously is just one of many.
 *
 * All state is in-memory. A gateway restart resets all blocks. That's fine —
 * the structural protection (level 2's force-close stopping a chatty client
 * from holding a socket open) re-establishes naturally on the next request.
 */

const ABUSE_PER_SOCKET_THRESHOLD = 10;
const ABUSE_PER_SOCKET_WINDOW_MS = 60_000;
const ABUSE_USER_FORCE_CLOSE_THRESHOLD = 3;
const ABUSE_USER_WINDOW_MS = 300_000;
const ABUSE_USER_BACKOFF_MS = 300_000;

const ANON_USER_KEY = "__anon__";

export interface AbuseConfig {
  perSocketThreshold: number;
  perSocketWindowMs: number;
  userForceCloseThreshold: number;
  userWindowMs: number;
  userBackoffMs: number;
}

export const DEFAULT_ABUSE_CONFIG: AbuseConfig = {
  perSocketThreshold: ABUSE_PER_SOCKET_THRESHOLD,
  perSocketWindowMs: ABUSE_PER_SOCKET_WINDOW_MS,
  userForceCloseThreshold: ABUSE_USER_FORCE_CLOSE_THRESHOLD,
  userWindowMs: ABUSE_USER_WINDOW_MS,
  userBackoffMs: ABUSE_USER_BACKOFF_MS,
}

export type AbuseDecision =
  | { kind: "ok" }
  | { kind: "forceClose"; reason: string }
  | { kind: "blockUser"; until: number; reason: string };

interface SocketState {
  rateLimitedAtMs: number[];
}

interface UserState {
  forceClosedAtMs: number[];
  blockedUntilMs: number;
}

export class AbuseTracker {
  readonly #config: AbuseConfig;
  readonly #socketStates = new WeakMap<object, SocketState>();
  readonly #userStates = new Map<string, UserState>();

  constructor(config: AbuseConfig = DEFAULT_ABUSE_CONFIG) {
    this.#config = config;
  }

  /**
   * Decide whether a userId is currently blocked from upgrading a new WS.
   * Called at upgrade time, before Deno.upgradeWebSocket.
   */
  upgradeDecision(userId: string | null, now: number = Date.now()): AbuseDecision {
    const key = this.#userKey(userId);
    const state = this.#userStates.get(key);
    if (!state) return { kind: "ok" };
    if (state.blockedUntilMs <= now) return { kind: "ok" };
    return {
      kind: "blockUser",
      until: state.blockedUntilMs,
      reason: `user-level backoff active for ${Math.ceil((state.blockedUntilMs - now) / 1000)}s`,
    };
  }

  /**
   * Record that a socket just had a frame rate-limited. Returns a decision
   * that the caller acts on: "ok" means keep the socket open, "forceClose"
   * means tear it down. May also escalate to a "blockUser" backoff for that
   * userId, recorded in user state and surfaced on the next upgrade call.
   */
  recordRateLimited(
    socket: object,
    userId: string | null,
    now: number = Date.now(),
  ): AbuseDecision {
    const ss = this.#getOrCreateSocketState(socket);
    ss.rateLimitedAtMs.push(now);
    const cutoff = now - this.#config.perSocketWindowMs;
    ss.rateLimitedAtMs = ss.rateLimitedAtMs.filter((t) => t > cutoff);

    if (ss.rateLimitedAtMs.length < this.#config.perSocketThreshold) {
      return { kind: "ok" };
    }

    // Level 2 triggered — force-close. Also record a force-close for the user.
    const userKey = this.#userKey(userId);
    const us = this.#getOrCreateUserState(userKey);
    us.forceClosedAtMs.push(now);
    const userCutoff = now - this.#config.userWindowMs;
    us.forceClosedAtMs = us.forceClosedAtMs.filter((t) => t > userCutoff);

    if (us.forceClosedAtMs.length >= this.#config.userForceCloseThreshold) {
      us.blockedUntilMs = now + this.#config.userBackoffMs;
      return {
        kind: "blockUser",
        until: us.blockedUntilMs,
        reason: `${us.forceClosedAtMs.length} abuse-driven force-closes within ${Math.ceil(this.#config.userWindowMs / 1000)}s`,
      };
    }
    return {
      kind: "forceClose",
      reason: `${ss.rateLimitedAtMs.length} rate-limited frames within ${Math.ceil(this.#config.perSocketWindowMs / 1000)}s`,
    };
  }

  /** Free per-socket state on disconnect. */
  forgetSocket(socket: object): void {
    this.#socketStates.delete(socket);
  }

  /** Test helper: inspect user state. */
  userStateFor(userId: string | null): UserState | undefined {
    return this.#userStates.get(this.#userKey(userId));
  }

  #userKey(userId: string | null): string {
    return userId ?? ANON_USER_KEY;
  }

  #getOrCreateSocketState(socket: object): SocketState {
    const existing = this.#socketStates.get(socket);
    if (existing) return existing;
    const fresh: SocketState = { rateLimitedAtMs: [] };
    this.#socketStates.set(socket, fresh);
    return fresh;
  }

  #getOrCreateUserState(key: string): UserState {
    const existing = this.#userStates.get(key);
    if (existing) return existing;
    const fresh: UserState = { forceClosedAtMs: [], blockedUntilMs: 0 };
    this.#userStates.set(key, fresh);
    return fresh;
  }
}
