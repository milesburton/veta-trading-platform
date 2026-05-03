import { useSignal } from "@preact/signals-react";
import { sha256Async } from "../lib/sha256.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { reportError } from "../store/observabilitySlice.ts";
import { useAuthorizeOAuthMutation, useExchangeOAuthCodeMutation } from "../store/userApi.ts";
import { BuildInfo } from "./BuildInfo.tsx";
import { DemoPersonas } from "./DemoPersonas.tsx";

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

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = createCodeVerifier();
  const digest = await sha256Async(new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64UrlEncode(digest),
  };
}

export function formatApiError(err: unknown): string {
  if (!err || typeof err !== "object") return "Sign in failed. Check your username and passcode.";
  const errObj = err as { status?: unknown; data?: { error?: string; message?: string } };
  const data = errObj.data;
  if (data?.error) return `Sign in failed: ${data.error}`;
  if (data?.message) return `Sign in failed: ${data.message}`;
  if (errObj.status === 401) return "Sign in failed: invalid username or passcode.";
  if (errObj.status === 403) return "Sign in failed: account is not permitted to sign in.";
  if (typeof errObj.status === "number") return `Sign in failed (HTTP ${errObj.status}).`;
  return "Sign in failed. Check that the user-service is reachable.";
}

function AppFooter({ buildDate, commitSha }: { buildDate?: string; commitSha?: string }) {
  return (
    <div
      data-testid="login-build-info"
      className="flex items-center justify-between gap-4 w-full h-8 px-4 bg-gray-900 border-t border-gray-800 text-[10px] text-gray-500 tabular-nums"
    >
      <span className="shrink-0">VETA &middot; Miles Burton</span>
      <span className="flex items-center gap-3">
        <BuildInfo
          buildDate={buildDate}
          commitSha={commitSha}
          className="text-[10px] text-gray-600 tabular-nums"
        />
        <a
          href="https://github.com/milesburton/veta-trading-platform"
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          className="text-gray-600 hover:text-gray-300 transition-colors"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="sr-only">GitHub</span>
        </a>
      </span>
    </div>
  );
}

interface LoginPageProps {
  buildDate?: string;
  commitSha?: string;
}

export function LoginPage({ buildDate, commitSha }: LoginPageProps = {}) {
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
    <div
      data-testid="login-page"
      className="flex flex-col items-center justify-center min-h-screen bg-gray-950 py-8"
    >
      <div className="w-full max-w-2xl px-6 flex-1 flex flex-col justify-center">
        {/* Header */}
        <div className="text-center mb-10">
          <div
            data-testid="brand-title"
            className="text-3xl font-bold text-gray-100 tracking-tight mb-1"
          >
            VETA
          </div>
          <div className="text-xs font-medium text-emerald-500 tracking-widest uppercase mb-6">
            Trading Platform
          </div>
          <h1 data-testid="login-heading" className="text-2xl font-semibold text-gray-100 mb-1">
            Sign in
          </h1>
          <p className="text-gray-500 text-sm">Sign in with your VETA user ID and passcode.</p>
          <a
            href="https://milesburton.github.io/veta-trading-platform/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Platform Documentation &rarr;
          </a>
        </div>

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

        {(localError.value || apiError) && (
          <div
            data-testid="login-error"
            className="mt-6 text-center text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
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

      <AppFooter buildDate={buildDate} commitSha={commitSha} />
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
      className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6 space-y-5"
    >
      <label className="space-y-2 block">
        <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">
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
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500"
        />
      </label>

      <label className="space-y-2 block">
        <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">
          Passcode
        </span>
        <input
          data-testid="oauth-password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Enter access passcode"
          autoComplete="current-password"
          disabled={loading}
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500"
        />
      </label>

      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="text-xs text-gray-500">
          Authenticated against the internal VETA identity service.
        </div>
        <button
          data-testid="oauth-submit"
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900/60"
        >
          {loading && (
            <span className="h-3 w-3 rounded-full border border-white/60 border-t-transparent animate-spin" />
          )}
          Continue
        </button>
      </div>
    </form>
  );
}
