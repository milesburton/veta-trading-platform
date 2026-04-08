import { useState } from "react";
import { type AuthRole, ROLE_LABELS } from "../auth/rbac.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { SERVICES, type ServiceCategory, useGetServiceHealthQuery } from "../store/servicesApi.ts";
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

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  core: "Order Flow",
  algo: "Algo Engines",
  data: "Data Services",
  infra: "Infrastructure",
  observability: "Observability",
};

const CATEGORY_ORDER: ServiceCategory[] = ["core", "algo", "data", "infra", "observability"];

// Fixed hook-per-service pattern — one hook per index, count is stable.
// Adding services requires adding a corresponding hook call here.
function useAllServiceStates() {
  const r0 = useGetServiceHealthQuery(SERVICES[0], { pollingInterval: 8_000, skip: !SERVICES[0] });
  const r1 = useGetServiceHealthQuery(SERVICES[1], { pollingInterval: 8_000, skip: !SERVICES[1] });
  const r2 = useGetServiceHealthQuery(SERVICES[2], { pollingInterval: 8_000, skip: !SERVICES[2] });
  const r3 = useGetServiceHealthQuery(SERVICES[3], { pollingInterval: 8_000, skip: !SERVICES[3] });
  const r4 = useGetServiceHealthQuery(SERVICES[4], { pollingInterval: 8_000, skip: !SERVICES[4] });
  const r5 = useGetServiceHealthQuery(SERVICES[5], { pollingInterval: 8_000, skip: !SERVICES[5] });
  const r6 = useGetServiceHealthQuery(SERVICES[6], { pollingInterval: 8_000, skip: !SERVICES[6] });
  const r7 = useGetServiceHealthQuery(SERVICES[7], { pollingInterval: 8_000, skip: !SERVICES[7] });
  const r8 = useGetServiceHealthQuery(SERVICES[8], { pollingInterval: 8_000, skip: !SERVICES[8] });
  const r9 = useGetServiceHealthQuery(SERVICES[9], { pollingInterval: 8_000, skip: !SERVICES[9] });
  const r10 = useGetServiceHealthQuery(SERVICES[10], {
    pollingInterval: 8_000,
    skip: !SERVICES[10],
  });
  const r11 = useGetServiceHealthQuery(SERVICES[11], {
    pollingInterval: 8_000,
    skip: !SERVICES[11],
  });
  const r12 = useGetServiceHealthQuery(SERVICES[12], {
    pollingInterval: 8_000,
    skip: !SERVICES[12],
  });
  const r13 = useGetServiceHealthQuery(SERVICES[13], {
    pollingInterval: 8_000,
    skip: !SERVICES[13],
  });
  const r14 = useGetServiceHealthQuery(SERVICES[14], {
    pollingInterval: 8_000,
    skip: !SERVICES[14],
  });
  const r15 = useGetServiceHealthQuery(SERVICES[15], {
    pollingInterval: 8_000,
    skip: !SERVICES[15],
  });
  const r16 = useGetServiceHealthQuery(SERVICES[16], {
    pollingInterval: 8_000,
    skip: !SERVICES[16],
  });
  const r17 = useGetServiceHealthQuery(SERVICES[17], {
    pollingInterval: 8_000,
    skip: !SERVICES[17],
  });
  const r18 = useGetServiceHealthQuery(SERVICES[18], {
    pollingInterval: 8_000,
    skip: !SERVICES[18],
  });
  const r19 = useGetServiceHealthQuery(SERVICES[19], {
    pollingInterval: 8_000,
    skip: !SERVICES[19],
  });
  const r20 = useGetServiceHealthQuery(SERVICES[20], {
    pollingInterval: 8_000,
    skip: !SERVICES[20],
  });
  const r21 = useGetServiceHealthQuery(SERVICES[21], {
    pollingInterval: 8_000,
    skip: !SERVICES[21],
  });
  const r22 = useGetServiceHealthQuery(SERVICES[22], {
    pollingInterval: 8_000,
    skip: !SERVICES[22],
  });
  return [
    r0,
    r1,
    r2,
    r3,
    r4,
    r5,
    r6,
    r7,
    r8,
    r9,
    r10,
    r11,
    r12,
    r13,
    r14,
    r15,
    r16,
    r17,
    r18,
    r19,
    r20,
    r21,
    r22,
  ].slice(0, SERVICES.length);
}

interface ServicePillProps {
  name: string;
  description: string;
  port: number;
  link?: string;
  optional?: boolean;
  state: "ok" | "error" | "checking";
  version?: string;
}

function ServicePill({
  name,
  description,
  port,
  link,
  optional,
  state,
  version,
}: ServicePillProps) {
  const dot =
    state === "ok"
      ? "bg-emerald-400"
      : state === "error"
        ? "bg-red-500"
        : "bg-gray-600 animate-pulse";
  const nameColor =
    state === "ok" ? "text-gray-200" : state === "error" ? "text-red-400" : "text-gray-500";

  const inner = (
    <div
      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
        state === "ok"
          ? "border-gray-700/60 bg-gray-900/60 hover:border-gray-600"
          : state === "error"
            ? "border-red-900/60 bg-red-950/20"
            : "border-gray-800 bg-gray-900/30"
      }`}
    >
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xs font-medium ${nameColor}`}>{name}</span>
          {optional && <span className="text-[10px] text-gray-600">(opt)</span>}
          <span className="text-[10px] text-gray-700 tabular-nums ml-auto">:{port}</span>
        </div>
        <div className="text-[10px] text-gray-600 leading-tight mt-0.5">{description}</div>
        {version && version !== "—" && (
          <div className="text-[10px] text-gray-700 font-mono mt-0.5">{version}</div>
        )}
      </div>
    </div>
  );

  if (link && state === "ok") {
    return (
      <a href={link} target="_blank" rel="noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

function PlatformStatus() {
  const results = useAllServiceStates();

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    services: SERVICES.map((svc, i) => ({ svc, result: results[i] })).filter(
      ({ svc }) => svc.category === cat
    ),
  }));

  const coreResults = results.filter((_, i) => SERVICES[i].category === "core");
  const anyLoading = coreResults.some((r) => r.isLoading);
  const coreAllOk = !anyLoading && coreResults.every((r) => r.data?.state === "ok");
  const anyError = !anyLoading && coreResults.some((r) => r.data?.state === "error" || r.isError);

  const summaryLabel = anyLoading
    ? "Checking platform…"
    : coreAllOk
      ? "Platform ready"
      : anyError
        ? "Platform degraded"
        : "Checking platform…";

  const summaryColor = anyLoading
    ? "text-gray-500"
    : coreAllOk
      ? "text-emerald-400"
      : "text-yellow-400";

  const dotColor = anyLoading
    ? "bg-gray-500 animate-pulse"
    : coreAllOk
      ? "bg-emerald-400"
      : anyError
        ? "bg-yellow-400"
        : "bg-gray-500 animate-pulse";

  // Find Grafana link for the button
  const grafanaSvc = SERVICES.find((s) => s.name === "Grafana");
  const grafanaIdx = grafanaSvc ? SERVICES.indexOf(grafanaSvc) : -1;
  const grafanaResult = grafanaIdx >= 0 ? results[grafanaIdx] : undefined;
  const grafanaUp = grafanaResult?.data?.state === "ok";

  return (
    <div data-testid="platform-status" className="mt-8 border-t border-gray-800 pt-6 space-y-5">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            data-testid="platform-status-dot"
            className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`}
          />
          <span
            data-testid="platform-status-label"
            className={`text-xs font-medium ${summaryColor}`}
          >
            {summaryLabel}
          </span>
        </div>
        {grafanaSvc && (
          <a
            href={grafanaSvc.link}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border transition-colors ${
              grafanaUp
                ? "border-orange-700/60 text-orange-400 hover:border-orange-500 hover:text-orange-300"
                : "border-gray-800 text-gray-600 cursor-not-allowed pointer-events-none"
            }`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-label="Grafana">
              <title>Grafana</title>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
            Grafana Dashboards
          </a>
        )}
      </div>

      {/* Categorised service grid */}
      <div className="space-y-4">
        {byCategory.map(({ cat, services }) => (
          <div key={cat}>
            <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat]}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {services.map(({ svc, result }) => {
                const state = result.isLoading
                  ? "checking"
                  : result.isError || result.data?.state === "error"
                    ? "error"
                    : result.data?.state === "ok"
                      ? "ok"
                      : "checking";
                return (
                  <ServicePill
                    key={svc.name}
                    name={svc.name}
                    description={svc.description}
                    port={svc.port}
                    link={svc.link}
                    optional={svc.optional}
                    state={state}
                    version={result.data?.version}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LoginPageProps {
  buildDate?: string;
  commitSha?: string;
}

export function LoginPage({ buildDate, commitSha }: LoginPageProps = {}) {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [authorizeOAuth, authorizeState] = useAuthorizeOAuthMutation();
  const [exchangeOAuthCode, tokenState] = useExchangeOAuthCodeMutation();
  const [registerOAuthUser, registerState] = useRegisterOAuthUserMutation();

  const isLoading = authorizeState.isLoading || tokenState.isLoading || registerState.isLoading;
  const apiError = registerState.error ?? authorizeState.error ?? tokenState.error;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    const trimmedName = displayName.trim();
    setLocalError(null);
    authorizeState.reset();
    tokenState.reset();
    registerState.reset();

    if (!normalizedUsername) {
      setLocalError("Username is required.");
      return;
    }
    if (!password.trim()) {
      setLocalError("Passcode is required.");
      return;
    }
    if (mode === "register" && !trimmedName) {
      setLocalError("Display name is required to register a viewer account.");
      return;
    }

    if (mode === "register") {
      const registerResult = await registerOAuthUser({
        username: normalizedUsername,
        name: trimmedName,
        password,
      });
      if (!("data" in registerResult)) return;
    }

    const pkce = await createPkcePair();
    const authorizeResult = await authorizeOAuth({
      client_id: OAUTH_CLIENT_ID,
      username: normalizedUsername,
      password,
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
        </div>

        <AuthForm
          mode={mode}
          username={username}
          password={password}
          displayName={displayName}
          loading={isLoading}
          onModeChange={setMode}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onDisplayNameChange={setDisplayName}
          onSubmit={handleSubmit}
        />

        {(localError || apiError) && (
          <div
            data-testid="login-error"
            className="mt-6 text-center text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
          >
            {localError ??
              ("status" in apiError!
                ? `Sign in failed (${String(apiError.status)})`
                : "Sign in failed")}
          </div>
        )}

        <DemoPersonas
          onSelect={(personaId) => {
            setMode("signin");
            setUsername(personaId);
            setPassword(import.meta.env.VITE_DEMO_PASSCODE ?? "veta-dev-passcode");
          }}
        />

        {/* Full platform status with all services */}
        <PlatformStatus />
      </div>

      <div data-testid="login-build-info" className="text-[10px] text-gray-700 tabular-nums pb-4">
        {buildDate && <span>{buildDate}</span>}
        {buildDate && commitSha && <span className="mx-1">·</span>}
        {commitSha && <span>{commitSha}</span>}
      </div>
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
