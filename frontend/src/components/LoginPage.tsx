import { useSignal } from "@preact/signals-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sha256Async } from "../lib/sha256.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { reportError } from "../store/observabilitySlice.ts";
import { useAuthorizeOAuthMutation, useExchangeOAuthCodeMutation } from "../store/userApi.ts";
import type { ServiceHealth } from "../types.ts";
import { DemoPersonas } from "./DemoPersonas.tsx";
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
      className="absolute inset-0 z-[110] rounded-lg border border-amber-700/60 bg-gray-900 p-5 shadow-2xl ring-1 ring-amber-700/30"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl leading-none text-amber-400" aria-hidden="true">
            ⚠
          </span>
          <div>
            <h2 className="text-sm font-semibold text-amber-300">Platform degraded</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
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
            className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
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
  const username = useSignal("alice");
  const password = useSignal("veta-dev-passcode");
  const localError = useSignal<string | null>(null);
  const [authorizeOAuth, authorizeState] = useAuthorizeOAuthMutation();
  const [exchangeOAuthCode, tokenState] = useExchangeOAuthCodeMutation();

  const isLoading = authorizeState.isLoading || tokenState.isLoading;
  const apiError = authorizeState.error ?? tokenState.error;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.value.trim().toLowerCase();
    localError.value = null;
    authorizeState.reset();
    tokenState.reset();

    if (!normalizedUsername) {
      localError.value = "Username is required.";
      return;
    }
    if (!password.value.trim()) {
      localError.value = "Passcode is required.";
      return;
    }

    try {
      const pkce = await createPkcePair();
      const authorizeResult = await authorizeOAuth({
        client_id: OAUTH_CLIENT_ID,
        username: normalizedUsername,
        password: password.value,
        redirect_uri: OAUTH_REDIRECT_URI,
        response_type: "code",
        scope: OAUTH_SCOPE,
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      });

      if (!("data" in authorizeResult) || !authorizeResult.data) return;

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

  return (
    <div data-testid="login-page" className="h-screen flex flex-col bg-gray-950">
      <AppHeader />

      <main className="flex-1 overflow-auto flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center">
            <h1 data-testid="login-heading" className="text-xl font-semibold text-gray-100 mb-1">
              Sign in
            </h1>
            <p className="text-gray-500 text-xs">
              Use your VETA user ID and passcode.{" "}
              <a
                href="https://milesburton.github.io/veta-trading-platform/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
              >
                Docs &rarr;
              </a>
            </p>
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

          {(localError.value || apiError) && (
            <div
              data-testid="login-error"
              className="text-center text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
            >
              {localError.value ?? formatApiError(apiError)}
            </div>
          )}

          <DemoPersonas
            onSelect={(personaId) => {
              username.value = personaId;
              password.value = import.meta.env.VITE_DEMO_PASSCODE ?? "veta-dev-passcode";
            }}
          />
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
      className="rounded-lg border border-gray-800 bg-gray-900/70 p-5 space-y-4"
    >
      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
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
          className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
        />
      </label>

      <label className="space-y-1.5 block">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
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
          className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
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
