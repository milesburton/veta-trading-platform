import { useSignal } from "@preact/signals-react";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
  };
}

function formatApiError(err: unknown): string {
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
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div
      data-testid="login-build-info"
      className="flex items-center justify-between px-6 py-2 text-[10px] text-gray-700 tabular-nums border-t border-gray-800/50"
    >
      <span>VETA &middot; Miles Burton</span>
      <span className="flex items-center gap-4">
        <BuildInfo
          buildDate={buildDate}
          commitSha={commitSha}
          className="text-[10px] text-gray-700 tabular-nums"
        />
        <span>
          {timeStr} {tzName}
        </span>
        <a
          href="https://github.com/milesburton/veta-trading-platform"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-gray-400 transition-colors"
        >
          GitHub
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
