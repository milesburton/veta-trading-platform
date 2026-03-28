import type { AuthUser } from "../store/authSlice.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { SERVICES, type ServiceCategory, useGetServiceHealthQuery } from "../store/servicesApi.ts";
import { useCreateSessionMutation } from "../store/userApi.ts";

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

interface SeedUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

const SEED_USERS: SeedUser[] = [
  { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "AC" },
  { id: "bob", name: "Bob Martinez", role: "trader", avatar_emoji: "BM" },
  { id: "carol", name: "Carol Singh", role: "trader", avatar_emoji: "CS" },
  { id: "dave", name: "Dave Okafor", role: "trader", avatar_emoji: "DO" },
  { id: "admin", name: "Mission Control", role: "admin", avatar_emoji: "MC" },
];

interface LoginPageProps {
  buildDate?: string;
  commitSha?: string;
}

export function LoginPage({ buildDate, commitSha }: LoginPageProps = {}) {
  const dispatch = useAppDispatch();
  const [createSession, { isLoading: sessionLoading, error: sessionError, reset }] =
    useCreateSessionMutation();

  async function handleSelect(user: SeedUser) {
    reset();
    const result = await createSession({ userId: user.id });
    if ("data" in result) {
      dispatch(setUser(result.data as AuthUser));
    }
  }

  const loadingUserId = sessionLoading
    ? ((document.activeElement as HTMLButtonElement | null)?.dataset?.userId ?? null)
    : null;

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
            Select your profile
          </h1>
          <p className="text-gray-500 text-sm">Choose a trader to begin your session</p>
        </div>

        {/* User cards */}
        <LoginCards
          users={SEED_USERS}
          loading={sessionLoading}
          loadingUserId={loadingUserId}
          onSelect={handleSelect}
        />

        {sessionError && (
          <div
            data-testid="login-error"
            className="mt-6 text-center text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2"
          >
            {"status" in sessionError ? `Login failed (${sessionError.status})` : "Login failed"}
          </div>
        )}

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

interface LoginCardsProps {
  users: SeedUser[];
  loading: boolean;
  loadingUserId: string | null;
  onSelect: (user: SeedUser) => void;
}

function LoginCards({ users, loading, loadingUserId, onSelect }: LoginCardsProps) {
  return (
    <div className="grid grid-cols-5 gap-3">
      {users.map((user) => {
        const isLoading = loading && loadingUserId === user.id;
        return (
          <button
            key={user.id}
            data-testid={`user-btn-${user.id}`}
            data-user-id={user.id}
            type="button"
            onClick={() => onSelect(user)}
            disabled={loading}
            className={`group flex flex-col items-center gap-4 p-4 rounded-xl border transition-all duration-150 w-full ${
              loading && !isLoading
                ? "opacity-40 cursor-not-allowed border-gray-800 bg-gray-900/30"
                : "cursor-pointer border-gray-700 bg-gray-900 hover:border-emerald-500 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]"
            } ${isLoading ? "border-emerald-500 bg-gray-800 shadow-[0_0_20px_rgba(52,211,153,0.15)]" : ""}`}
          >
            <div className="flex flex-col items-center gap-2 w-full">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold tracking-wide select-none shrink-0 ${
                  user.role === "admin"
                    ? "bg-orange-500/20 text-orange-500 border border-orange-500/40"
                    : "bg-gray-700/50 text-gray-300 border border-gray-600/50"
                }`}
              >
                {user.avatar_emoji}
              </div>
              <div className="text-gray-200 font-medium text-xs leading-tight text-center min-h-[2.5em] flex items-center justify-center">
                {user.name}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div
                className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  user.role === "admin"
                    ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
                    : "bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30"
                }`}
              >
                {user.role}
              </div>
              <div className="h-3 flex items-center justify-center">
                {isLoading && (
                  <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
