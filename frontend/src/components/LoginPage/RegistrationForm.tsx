import { useSignal } from "@preact/signals-react";
import { TRADER_ARCHETYPES } from "@shared/traderArchetypes";
import { sha256Async } from "@veta/frontend/lib/sha256.ts";
import { setUser } from "@veta/frontend/store/authSlice.ts";
import { useAppDispatch } from "@veta/frontend/store/hooks.ts";
import {
  useAuthorizeOAuthMutation,
  useExchangeOAuthCodeMutation,
  useRegisterOAuthUserMutation,
} from "@veta/frontend/store/userApi.ts";
import type { FormEvent } from "react";

const OAUTH_CLIENT_ID = "veta-web";
const OAUTH_REDIRECT_URI = "postmessage";
const OAUTH_SCOPE = "trading";

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(verifierBytes);
  const digest = await sha256Async(new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

function describeError(err: unknown): string {
  if (!err || typeof err !== "object") return "Registration failed. Please try again.";
  const e = err as { status?: number; data?: { error?: string } };
  if (e.data?.error) return `Registration failed: ${e.data.error}`;
  if (e.status === 403) return "Registration is disabled on this deployment.";
  if (e.status === 409) return "That username is already taken.";
  if (e.status === 400) return "Check the form values and try again.";
  if (typeof e.status === "number") return `Registration failed (HTTP ${e.status}).`;
  return "Registration failed. Please try again.";
}

export function RegistrationForm() {
  const dispatch = useAppDispatch();
  const username = useSignal("");
  const displayName = useSignal("");
  const password = useSignal("");
  const archetype = useSignal(TRADER_ARCHETYPES[0].id);
  const localError = useSignal<string | null>(null);
  const [registerOAuthUser, registerState] = useRegisterOAuthUserMutation();
  const [authorizeOAuth, authorizeState] = useAuthorizeOAuthMutation();
  const [exchangeOAuthCode, tokenState] = useExchangeOAuthCodeMutation();

  const isLoading = registerState.isLoading || authorizeState.isLoading || tokenState.isLoading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localError.value = null;
    registerState.reset();
    authorizeState.reset();
    tokenState.reset();

    const u = username.value.trim().toLowerCase();
    const n = displayName.value.trim();
    const p = password.value;
    if (u.length < 2) {
      localError.value = "Username must be at least 2 characters.";
      return;
    }
    if (n.length < 1) {
      localError.value = "Display name is required.";
      return;
    }
    if (p.length < 8) {
      localError.value = "Password must be at least 8 characters.";
      return;
    }

    const registerResult = await registerOAuthUser({
      username: u,
      name: n,
      password: p,
      archetype: archetype.value,
    });
    if (!("data" in registerResult) || !registerResult.data) {
      localError.value = describeError(registerResult.error);
      return;
    }

    const pkce = await createPkcePair();
    const authorizeResult = await authorizeOAuth({
      client_id: OAUTH_CLIENT_ID,
      username: u,
      password: p,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: "code",
      scope: OAUTH_SCOPE,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    });
    if (!("data" in authorizeResult) || !authorizeResult.data) {
      localError.value = "Account created. Sign in to continue.";
      return;
    }
    const tokenResult = await exchangeOAuthCode({
      client_id: OAUTH_CLIENT_ID,
      code: authorizeResult.data.code,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: pkce.verifier,
    });
    if ("data" in tokenResult && tokenResult.data?.user) {
      dispatch(setUser(tokenResult.data.user));
    } else {
      localError.value = "Account created. Sign in to continue.";
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="registration-form"
      className="rounded-lg border border-panel bg-surface/40 p-5 space-y-3"
    >
      <div>
        <h2 className="text-sm font-semibold text-primary">Create an account</h2>
        <p className="text-[10px] text-muted">
          New here? Pick a trader type and sign up with starter limits ($10k max order, $1M daily
          notional).
        </p>
      </div>
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Trader type
        </span>
        <select
          data-testid="register-archetype"
          value={archetype.value}
          onChange={(e) => {
            archetype.value = e.target.value;
          }}
          disabled={isLoading}
          className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        >
          {TRADER_ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="block text-[10px] text-muted">
          {TRADER_ARCHETYPES.find((a) => a.id === archetype.value)?.description}
        </span>
      </label>
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Username
        </span>
        <input
          data-testid="register-username"
          type="text"
          value={username.value}
          onChange={(e) => {
            username.value = e.target.value;
          }}
          placeholder="pick-a-username"
          autoComplete="username"
          disabled={isLoading}
          className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Display name
        </span>
        <input
          data-testid="register-display-name"
          type="text"
          value={displayName.value}
          onChange={(e) => {
            displayName.value = e.target.value;
          }}
          placeholder="How should we address you?"
          autoComplete="name"
          disabled={isLoading}
          className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Password (min 8 chars)
        </span>
        <input
          data-testid="register-password"
          type="password"
          value={password.value}
          onChange={(e) => {
            password.value = e.target.value;
          }}
          autoComplete="new-password"
          disabled={isLoading}
          className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>
      <button
        data-testid="register-submit"
        type="submit"
        disabled={isLoading}
        className="w-full inline-flex items-center justify-center gap-2 rounded border border-emerald-700 bg-emerald-900/30 px-4 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/60 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading && (
          <span className="h-3 w-3 rounded-full border border-emerald-400/60 border-t-transparent animate-spin" />
        )}
        {isLoading ? "Creating account…" : "Create account"}
      </button>
      {localError.value && (
        <div
          data-testid="register-error"
          className="text-center text-red-400 text-[11px] bg-red-900/20 border border-red-800 rounded px-3 py-1.5"
        >
          {localError.value}
        </div>
      )}
    </form>
  );
}
