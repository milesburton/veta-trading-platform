import { useSignal } from "@preact/signals-react";
import { sha256Async } from "@veta/frontend/lib/sha256.ts";
import { setUser } from "@veta/frontend/store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { reportError } from "@veta/frontend/store/observabilitySlice.ts";
import {
  type DemoPersona,
  useAuthorizeOAuthMutation,
  useExchangeOAuthCodeMutation,
  useLoginAsGuestMutation,
} from "@veta/frontend/store/userApi.ts";
import type { ServiceHealth } from "@veta/frontend/types.ts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoPersonas } from "./DemoPersonas.tsx";
import { RegistrationForm } from "./LoginPage/RegistrationForm.tsx";
import { AppHeader, useAllServiceHealth } from "./StatusBar.tsx";

interface DegradedOverlayState {
  anyPolled: boolean;
  degradedCount: number;
  stateKey: string;
}

function computeOverlayState(services: ServiceHealth[]): DegradedOverlayState {
  const anyPolled = services.some((s) => s.state !== "unknown");
  const degradedCount = services.filter((s) => !s.optional && s.state === "error").length;
  const stateKey = services.map((s) => `${s.name}:${s.state}`).join("|");
  return { anyPolled, degradedCount, stateKey };
}

const DegradedServicesOverlayCard = memo(function DegradedServicesOverlayCard({
  degradedCount,
  onViewDetails,
  onDismiss,
}: {
  degradedCount: number;
  onViewDetails: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="degraded-services-overlay"
      className="absolute inset-0 z-[110] rounded-lg border border-amber-700/60 bg-surface p-5 shadow-2xl ring-1 ring-amber-700/30"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl leading-none text-amber-400" aria-hidden="true">
            ⚠
          </span>
          <div>
            <h2 className="text-sm font-semibold text-amber-300">Platform degraded</h2>
            <p className="mt-1 text-xs leading-relaxed text-label">
              {degradedCount === 1
                ? "1 required service is offline."
                : `${degradedCount} required services are offline.`}{" "}
              Some features may be unavailable.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            data-testid="degraded-view-details"
            onClick={onViewDetails}
            className="text-xs text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
          >
            View details ↑
          </button>
          <button
            type="button"
            data-testid="degraded-dismiss"
            onClick={onDismiss}
            className="rounded border border-subtle bg-panel px-3 py-1.5 text-xs text-default transition-colors hover:bg-divider hover:text-primary"
          >
            Sign in anyway
          </button>
        </div>
      </div>
    </div>
  );
});

function DegradedServicesOverlay() {
  const services = useAllServiceHealth();
  const dismissed = useSignal(false);
  const latest = useMemo(() => computeOverlayState(services), [services]);
  const [stableState, setStableState] = useState<DegradedOverlayState>(latest);
  const previousStateKey = useRef(latest.stateKey);

  useEffect(() => {
    if (latest.stateKey === previousStateKey.current) return;
    previousStateKey.current = latest.stateKey;
    setStableState(latest);
  }, [latest]);

  const openServicesDropdown = useCallback(() => {
    document.querySelector<HTMLButtonElement>('[data-testid="services-status-btn"]')?.click();
  }, []);

  const onDismiss = useCallback(() => {
    dismissed.value = true;
  }, [dismissed]);

  if (!stableState.anyPolled || stableState.degradedCount === 0 || dismissed.value) return null;

  return (
    <DegradedServicesOverlayCard
      degradedCount={stableState.degradedCount}
      onViewDetails={openServicesDropdown}
      onDismiss={onDismiss}
    />
  );
}

const OAUTH_CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID ?? "veta-web";
const OAUTH_REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI ?? "postmessage";
const OAUTH_SCOPE = "openid profile";

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = createCodeVerifier();
  const digest = await sha256Async(new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64UrlEncode(digest),
  };
}

export function formatApiError(err: unknown): string {
  if (!err || typeof err !== "object") return "Sign in failed. Check your username and passcode.";
  const errObj = err as {
    status?: unknown;
    data?: { error?: string; message?: string };
  };
  const data = errObj.data;
  if (data?.error) return `Sign in failed: ${data.error}`;
  if (data?.message) return `Sign in failed: ${data.message}`;
  if (errObj.status === 401) return "Sign in failed: invalid username or passcode.";
  if (errObj.status === 403) return "Sign in failed: account is not permitted to sign in.";
  if (typeof errObj.status === "number") return `Sign in failed (HTTP ${errObj.status}).`;
  return "Sign in failed. Check that the user-service is reachable.";
}

export function LoginPage() {
  const dispatch = useAppDispatch();
  const sessionWasLost = useAppSelector((s) => s.auth.sessionExpired);
  const username = useSignal("");
  const password = useSignal("");
  const localError = useSignal<string | null>(null);
  const [authorizeOAuth, authorizeState] = useAuthorizeOAuthMutation();
  const [exchangeOAuthCode, tokenState] = useExchangeOAuthCodeMutation();
  const [loginAsGuest, guestState] = useLoginAsGuestMutation();

  const isLoading = authorizeState.isLoading || tokenState.isLoading || guestState.isLoading;
  const apiError = authorizeState.error ?? tokenState.error ?? guestState.error;

  async function performSignIn(overrideUsername?: string, overridePassword?: string) {
    const u = (overrideUsername ?? username.value).trim().toLowerCase();
    const p = overridePassword ?? password.value;
    localError.value = null;
    authorizeState.reset();
    tokenState.reset();

    if (!u) {
      localError.value = "Username is required.";
      return;
    }
    if (!p.trim()) {
      localError.value = "Passcode is required.";
      return;
    }

    try {
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
        localError.value = formatApiError(authorizeResult.error);
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
      } else if ("data" in tokenResult) {
        localError.value =
          "Sign in succeeded but no user profile was returned. Contact an administrator.";
      } else {
        localError.value = formatApiError(tokenResult.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      localError.value = `Sign in failed: ${message}`;
      dispatch(
        reportError({
          message: `Login failed: ${message}`,
          source: "LoginPage",
          stack: err instanceof Error ? err.stack : undefined,
        })
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performSignIn();
  }

  async function handleGuestLogin() {
    localError.value = null;
    authorizeState.reset();
    tokenState.reset();
    guestState.reset();
    try {
      const result = await loginAsGuest();
      if ("data" in result && result.data?.user) {
        dispatch(setUser(result.data.user));
      } else if ("error" in result) {
        const err = result.error as { status?: number } | undefined;
        if (err?.status === 403) {
          localError.value = "Guest access is not enabled on this deployment.";
        }
        // Other errors surface via apiError from guestState.error.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      localError.value = `Guest sign in failed: ${message}`;
    }
  }

  async function handlePersonaSelect(persona: DemoPersona) {
    username.value = persona.id;
    if (persona.passcode) password.value = persona.passcode;
    await performSignIn(persona.id, persona.passcode);
  }

  return (
    <div data-testid="login-page" className="min-h-screen flex flex-col">
      <AppHeader />

      {/* Must scroll at the document level, not internally: the page background
          gradient is sized to #root's box, so an inner scrollport here would
          hide overflow from it and leave the gradient not covering the page. */}
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-[400px_1fr] md:items-start">
          <div className="flex flex-col gap-5">
            {sessionWasLost && (
              <div
                data-testid="session-expired-banner"
                role="alert"
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-amber-800 bg-amber-950 text-amber-200 text-xs"
              >
                <span aria-hidden="true" className="text-amber-400 font-bold shrink-0">
                  ⚠
                </span>
                <span className="flex-1">
                  Your session has expired. Sign in again to resume placing orders.
                </span>
              </div>
            )}
            <div>
              <h1 data-testid="login-heading" className="text-xl font-semibold text-primary mb-1">
                Sign in
              </h1>
              <p className="text-muted text-xs">
                Use your VETA user ID and passcode, or pick a demo persona to sign in instantly.{" "}
                <a
                  href="https://milesburton.github.io/veta-trading-platform/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-label underline underline-offset-2 hover:text-secondary transition-colors"
                >
                  User Guide
                </a>
              </p>
              <a
                href="https://github.com/milesburton/veta-trading-platform"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View VETA on GitHub"
                className="mt-2 inline-flex items-center gap-1.5 text-muted text-xs hover:text-secondary transition-colors"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                GitHub
              </a>
            </div>

            <div className="relative">
              <AuthForm
                username={username.value}
                password={password.value}
                loading={isLoading}
                onUsernameChange={(v) => {
                  username.value = v;
                }}
                onPasswordChange={(v) => {
                  password.value = v;
                }}
                onSubmit={handleSubmit}
              />
              <DegradedServicesOverlay />
            </div>

            <button
              type="button"
              data-testid="guest-login-button"
              onClick={handleGuestLogin}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded border border-divider bg-page px-4 py-2 text-xs text-muted transition-colors hover:text-default hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue as guest (rate-limited demo trading)
            </button>

            {(localError.value || apiError) && (
              <div
                data-testid="login-error"
                className="text-center text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
              >
                {localError.value ?? formatApiError(apiError)}
              </div>
            )}

            <RegistrationForm />
          </div>

          <div className="min-h-0">
            <DemoPersonas mode="full" onSelect={handlePersonaSelect} />
          </div>
        </div>
      </main>
    </div>
  );
}

interface AuthFormProps {
  username: string;
  password: string;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function AuthForm({
  username,
  password,
  loading,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: AuthFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-panel bg-surface/70 p-5 space-y-4"
    >
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Username
        </span>
        <input
          data-testid="oauth-username"
          type="text"
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="alice"
          autoComplete="username"
          disabled={loading}
          className="w-full rounded border border-divider bg-page px-3 py-2 text-sm text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>

      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
          Passcode
        </span>
        <input
          data-testid="oauth-password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Enter passcode"
          autoComplete="current-password"
          disabled={loading}
          className="w-full rounded border border-divider bg-page px-3 py-2 text-sm text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>

      <button
        data-testid="oauth-submit"
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900/60"
      >
        {loading && (
          <span className="h-3 w-3 rounded-full border border-white/60 border-t-transparent animate-spin" />
        )}
        {loading ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
