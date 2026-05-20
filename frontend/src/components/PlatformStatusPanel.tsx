import { useSignal } from "@preact/signals-react";
import {
  type BugReportSubmission,
  useGetPlatformStatusQuery,
  useSubmitBugReportMutation,
} from "@veta/frontend/store/servicesApi.ts";
import { useState } from "react";

const BUG_CATEGORIES = ["ui", "data", "auth", "performance", "other"] as const;
type BugCategory = (typeof BUG_CATEGORIES)[number];

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function shortSha(version: string): string {
  return version.length > 7 ? version.slice(0, 7) : version;
}

function relativeTime(now: number, ts: number): string {
  const ago = Math.floor((now - ts) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
  return `${Math.floor(ago / 86400)}d ago`;
}

function StatLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="font-mono text-label">{label}</span>
      <span className="font-mono text-default text-right">{children}</span>
    </div>
  );
}

function BugReportDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BugCategory>("ui");
  const [submitBug, { isLoading, isSuccess, error, reset }] = useSubmitBugReportMutation();

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && !isLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload: BugReportSubmission = {
      title: title.trim(),
      description: description.trim(),
      category,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    };
    try {
      await submitBug(payload).unwrap();
    } catch {
      // surfaced via the `error` field
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="bug-report-dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-divider bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 pb-3">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">
            Report a bug
          </h2>
          <button
            type="button"
            data-testid="bug-report-close"
            onClick={onClose}
            className="text-label hover:text-primary text-xs font-mono"
          >
            ✕ Close
          </button>
        </div>

        {isSuccess ? (
          <div className="space-y-3">
            <p className="text-xs text-green-400">
              ✅ Bug report submitted. Thank you — it has been posted to the Discord bug channel.
            </p>
            <button
              type="button"
              data-testid="bug-report-submit-another"
              onClick={() => {
                setTitle("");
                setDescription("");
                setCategory("ui");
                reset();
              }}
              className="rounded border border-divider bg-panel px-3 py-1.5 text-xs text-default hover:bg-divider"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="bug-report-title-input"
                className="block text-[10px] font-semibold text-label uppercase tracking-wider pb-1"
              >
                Title (≥ 3 chars)
              </label>
              <input
                id="bug-report-title-input"
                data-testid="bug-report-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="w-full rounded border border-divider bg-panel px-2 py-1.5 text-xs text-default focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="bug-report-description-input"
                className="block text-[10px] font-semibold text-label uppercase tracking-wider pb-1"
              >
                Description (≥ 10 chars)
              </label>
              <textarea
                id="bug-report-description-input"
                data-testid="bug-report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={5}
                className="w-full rounded border border-divider bg-panel px-2 py-1.5 text-xs text-default focus:border-blue-500 focus:outline-none resize-y"
              />
            </div>

            <div>
              <label
                htmlFor="bug-report-category-input"
                className="block text-[10px] font-semibold text-label uppercase tracking-wider pb-1"
              >
                Category
              </label>
              <select
                id="bug-report-category-input"
                data-testid="bug-report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BugCategory)}
                className="rounded border border-divider bg-panel px-2 py-1.5 text-xs text-default focus:border-blue-500 focus:outline-none"
              >
                {BUG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-400" data-testid="bug-report-error">
                Submission failed. Try again in a moment.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-divider bg-panel px-3 py-1.5 text-xs text-label hover:text-default"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="bug-report-submit"
                disabled={!canSubmit}
                className="rounded border border-blue-600 bg-blue-700/40 px-3 py-1.5 text-xs text-primary hover:bg-blue-700/60 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PlatformStatusContent() {
  const { data, isLoading, isError } = useGetPlatformStatusQuery(undefined, {
    pollingInterval: 30_000,
  });
  const showBugDialog = useSignal(false);

  if (isLoading) {
    return <div className="p-3 text-xs font-mono text-label">Loading platform status…</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-3 text-xs font-mono text-red-400">
        Unable to load platform status. The endpoint requires admin or oncall role.
      </div>
    );
  }

  const now = Date.now();
  const stats = data.stats;
  const services = Object.entries(data.services);
  const upCount = services.filter(([, ok]) => ok).length;
  const totalServices = services.length;
  const downNames = services.filter(([, ok]) => !ok).map(([n]) => n);

  const headerEmoji =
    stats.worstServiceUpRatio === null
      ? "ℹ️"
      : stats.worstServiceUpRatio >= 0.999
        ? "✅"
        : stats.worstServiceUpRatio >= 0.95
          ? "⚠️"
          : "🚨";

  return (
    <div className="h-full flex flex-col bg-page text-secondary overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel">
        <span className="text-xs font-semibold text-primary tracking-wide uppercase">
          Platform Status
        </span>
        <button
          type="button"
          data-testid="open-bug-report"
          onClick={() => {
            showBugDialog.value = true;
          }}
          className="rounded border border-amber-700/50 bg-amber-700/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 hover:bg-amber-700/40"
        >
          🐛 Report bug
        </button>
      </div>

      <div className="px-3 py-2 border-b border-panel">
        <div className="text-[11px] text-default">
          {headerEmoji} <span className="font-mono">{shortSha(data.version)}</span>{" "}
          <span className="text-label">({data.environment})</span>{" "}
          <span className="text-muted">· uptime {formatUptime(data.uptimeMs)}</span>
        </div>
        {stats.lastDeploySha && (
          <div className="text-[10px] text-muted font-mono mt-0.5">
            deployed sha: {shortSha(stats.lastDeploySha)}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-b border-panel">
        <div className="text-[10px] font-semibold text-label uppercase tracking-wider pb-1">
          Services (last 24h)
        </div>
        {stats.serviceUpRatio !== null ? (
          <>
            <StatLine label="mean uptime">{(stats.serviceUpRatio * 100).toFixed(1)}%</StatLine>
            <StatLine label="worst window">
              {((stats.worstServiceUpRatio ?? 0) * 100).toFixed(1)}%
            </StatLine>
          </>
        ) : (
          <div className="text-xs text-muted">No samples yet</div>
        )}
        <StatLine label="now">
          {upCount}/{totalServices} up
          {downNames.length > 0 && (
            <span className="text-red-400 font-mono ml-2">
              🔴 {downNames.slice(0, 3).join(", ")}
              {downNames.length > 3 && ` +${downNames.length - 3}`}
            </span>
          )}
        </StatLine>
      </div>

      <div className="px-3 py-2 border-b border-panel">
        <div className="text-[10px] font-semibold text-label uppercase tracking-wider pb-1">
          Alerts (last 24h)
        </div>
        {Object.keys(stats.alertsBySeverity).length === 0 ? (
          <div className="text-xs text-muted">none 🎯</div>
        ) : (
          <>
            {["CRITICAL", "WARNING", "INFO"].map((sev) => {
              const n = stats.alertsBySeverity[sev];
              if (!n) return null;
              return (
                <StatLine key={sev} label={sev.toLowerCase()}>
                  {n}
                </StatLine>
              );
            })}
            {stats.lastCritical && (
              <div className="text-[10px] text-muted pt-1 font-mono">
                last critical {relativeTime(now, stats.lastCritical.ts)} —{" "}
                <span className="text-red-400">{stats.lastCritical.source}</span>{" "}
                {stats.lastCritical.message.slice(0, 60)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-3 py-2 border-b border-panel">
        <div className="text-[10px] font-semibold text-label uppercase tracking-wider pb-1">
          Bug reports (last 24h)
        </div>
        {stats.bugReports === 0 ? (
          <div className="text-xs text-muted">none</div>
        ) : (
          <StatLine label="received">
            {stats.bugReports} from {stats.uniqueBugReporters} user
            {stats.uniqueBugReporters === 1 ? "" : "s"}
          </StatLine>
        )}
      </div>

      <div className="px-3 py-2 text-[10px] text-muted">
        Daily summary posts to Discord at 09:00 UTC. Real-time alerts and bug reports post
        immediately. CI failures and PR merges also flow into the channel.
      </div>

      {showBugDialog.value && (
        <BugReportDialog
          onClose={() => {
            showBugDialog.value = false;
          }}
        />
      )}
    </div>
  );
}

export function PlatformStatusPanel() {
  return <PlatformStatusContent />;
}
