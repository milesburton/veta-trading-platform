import { useSignal } from "@preact/signals-react";
import { type AuthRole, ROLE_LABELS } from "../auth/rbac.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import {
  useAuthorizeOAuthMutation,
  useExchangeOAuthCodeMutation,
  useRegisterOAuthUserMutation,
} from "../store/userApi.ts";
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

function AppFooter({ buildDate, commitSha }: { buildDate?: string; commitSha?: string }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const version = commitSha ? `v${commitSha}` : (buildDate ?? "");

  return (
    <div
      data-testid="login-build-info"
      className="flex items-center justify-between px-6 py-2 text-[10px] text-gray-700 tabular-nums border-t border-gray-800/50"
    >
      <span>VETA &middot; Miles Burton</span>
      <span className="flex items-center gap-3">
        {version && <span>{version}</span>}
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
        <button
          type="button"
          className="text-amber-700 hover:text-amber-500 transition-colors"
          title="Report a platform issue"
        >
          Alert Ops
        </button>
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
  const mode = useSignal<"signin" | "register">("signin");
  const username = useSignal("alice");
  const password = useSignal("veta-dev-passcode");
  const displayName = useSignal("");
  const localError = useSignal<string | null>(null);
  const [authorizeOAuth, authorizeState] = useAuthorizeOAuthMutation();
  const [exchangeOAuthCode, tokenState] = useExchangeOAuthCodeMutation();
  const [registerOAuthUser, registerState] = useRegisterOAuthUserMutation();

  const isLoading = authorizeState.isLoading || tokenState.isLoading || registerState.isLoading;
  const apiError = registerState.error ?? authorizeState.error ?? tokenState.error;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.value.trim().toLowerCase();
    const trimmedName = displayName.value.trim();
    localError.value = null;
    authorizeState.reset();
    tokenState.reset();
    registerState.reset();

    if (!normalizedUsername) {
      localError.value = "Username is required.";
      return;
    }
    if (!password.value.trim()) {
      localError.value = "Passcode is required.";
      return;
    }
    if (mode.value === "register" && !trimmedName) {
      localError.value = "Display name is required to register a viewer account.";
      return;
    }

    if (mode.value === "register") {
      const registerResult = await registerOAuthUser({
        username: normalizedUsername,
        name: trimmedName,
        password: password.value,
      });
      if (!("data" in registerResult)) return;
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
          <p className="text-gray-500 text-sm">
            Use your VETA user ID and passcode, or register a new viewer account for read-only
            access.
          </p>
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
          mode={mode.value}
          username={username.value}
          password={password.value}
          displayName={displayName.value}
          loading={isLoading}
          onModeChange={(m) => {
            mode.value = m;
          }}
          onUsernameChange={(v) => {
            username.value = v;
          }}
          onPasswordChange={(v) => {
            password.value = v;
          }}
          onDisplayNameChange={(v) => {
            displayName.value = v;
          }}
          onSubmit={handleSubmit}
        />

        {(localError.value || apiError) && (
          <div
            data-testid="login-error"
            className="mt-6 text-center text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
          >
            {localError.value ??
              ("status" in apiError!
                ? `Sign in failed (${String(apiError.status)})`
                : "Sign in failed")}
          </div>
        )}

        <DemoPersonas
          onSelect={(personaId) => {
            mode.value = "signin";
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
  mode: "signin" | "register";
  username: string;
  password: string;
  displayName: string;
  loading: boolean;
  onModeChange: (mode: "signin" | "register") => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function AuthForm({
  mode,
  username,
  password,
  displayName,
  loading,
  onModeChange,
  onUsernameChange,
  onPasswordChange,
  onDisplayNameChange,
  onSubmit,
}: AuthFormProps) {
  const rolePreview: AuthRole = mode === "register" ? "viewer" : "external-client";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6 space-y-5"
    >
      <div className="flex gap-2 rounded-xl border border-gray-800 bg-gray-950 p-1">
        {(["signin", "register"] as const).map((value) => (
          <button
            key={value}
            data-testid={`oauth-mode-${value}`}
            type="button"
            onClick={() => onModeChange(value)}
            disabled={loading}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === value
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {value === "signin" ? "Sign In" : "Register Viewer"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
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
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Access outcome</div>
          <div className="mt-2 text-sm font-medium text-gray-100">{ROLE_LABELS[rolePreview]}</div>
          <div className="mt-1 text-xs text-gray-500">
            {mode === "register"
              ? "Self-registration provisions a read-only viewer account."
              : "Existing users retain server-assigned permissions after passcode verification."}
          </div>
        </div>
      </div>

      {mode === "register" && (
        <label className="space-y-2 block">
          <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">
            Display Name
          </span>
          <input
            data-testid="oauth-display-name"
            type="text"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500"
          />
        </label>
      )}

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
          {mode === "register" ? "Register and Continue" : "Continue"}
        </button>
      </div>
    </form>
  );
}
