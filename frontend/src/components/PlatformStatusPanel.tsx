import { useSignal } from "@preact/signals-react";
import {
  type BugReportResponse,
  type BugReportSubmission,
  useGetPlatformStatusQuery,
  useSubmitBugReportMutation,
} from "@veta/frontend/store/servicesApi.ts";
import { useEffect, useRef, useState } from "react";

const BUG_CATEGORIES = ["ui", "data", "auth", "performance", "other"] as const;
type BugCategory = (typeof BUG_CATEGORIES)[number];
const TICKET_KINDS = ["bug", "feature", "comment"] as const;
type TicketKind = (typeof TICKET_KINDS)[number];

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

function describeError(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number | string }).status;
    if (status === 401 || status === 403) {
      return "This panel requires the admin or oncall role.";
    }
    if (typeof status === "number") {
      return `Unable to load platform status (HTTP ${status}).`;
    }
    if (status === "FETCH_ERROR") {
      return "Unable to reach the gateway.";
    }
  }
  return "Unable to load platform status.";
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
  const [kind, setKind] = useState<TicketKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BugCategory>("ui");
  const [submitBug, { isLoading, data, error, reset }] = useSubmitBugReportMutation();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const response = data as BugReportResponse | undefined;
  const delivered = response?.ok === true;
  const queuedButNotDelivered = response !== undefined && response.ok === false;

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && !isLoading;

  useEffect(() => {
    titleInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload: BugReportSubmission = {
      kind,
      title: title.trim(),
      description: description.trim(),
      category,
      url: typeof window !== "undefined" ? globalThis.location.href : undefined,
    };
    try {
      await submitBug(payload).unwrap();
    } catch {
      // RTK Query surfaces the failure via the `error` field
    }
  }

  function resetForNext() {
    setTitle("");
    setDescription("");
    setCategory("ui");
    setKind("bug");
    reset();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="bug-report-dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-divider bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 pb-3">
          <h2
            id="bug-report-dialog-title"
            className="text-sm font-semibold text-primary uppercase tracking-wide"
          >
            Raise a ticket
          </h2>
          <button
            type="button"
            data-testid="bug-report-close"
            onClick={onClose}
            aria-label="Close bug report dialog"
            className="text-label hover:text-primary text-xs font-mono"
          >
            ✕ Close
          </button>
        </div>

        {delivered || queuedButNotDelivered ? (
          <div className="space-y-3" data-testid="bug-report-result">
            {delivered ? (
              <p className="text-xs text-green-400">
                ✅ Ticket submitted
                {response?.ticket?.url
                  ? response.discordDelivered
                    ? ` as GitHub issue #${response.ticket.issueNumber ?? "?"} and notified Support.`
                    : ` as GitHub issue #${response.ticket.issueNumber ?? "?"}. Support notification is not configured or failed.`
                  : response?.discordDelivered
                    ? " and notified Support."
                    : "."}
              </p>
            ) : (
              <p className="text-xs text-amber-300" data-testid="bug-report-queued">
                ⚠️ Ticket received by the gateway, but no external ticket sink is configured or
                delivery failed. Ask an admin to check <code>DISCORD_BUG_WEBHOOK_URL</code>,{" "}
                <code>DISCORD_WEBHOOK_URL</code>, the mounted GitHub ticketing secret, and{" "}
                <code>GITHUB_TICKETING_REPO</code>.
              </p>
            )}
            {response?.ticket?.url && (
              <a
                href={response.ticket.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-divider bg-panel px-3 py-1.5 text-xs text-default hover:bg-divider"
              >
                Open ticket
              </a>
            )}
            {response?.discordDelivered && response.ticket && !response.ticket.created && (
              <p className="text-xs text-amber-300" data-testid="github-ticketing-warning">
                Support was notified, but GitHub issue creation failed (
                {response.ticket.reason ?? "unknown error"}). An administrator should check the
                GitHub ticketing health.
              </p>
            )}
            <button
              type="button"
              data-testid="bug-report-submit-another"
              onClick={resetForNext}
              className="rounded border border-divider bg-panel px-3 py-1.5 text-xs text-default hover:bg-divider"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="block text-[10px] font-semibold text-label uppercase tracking-wider pb-1">
                Type
              </div>
              <div className="flex flex-wrap gap-2">
                {TICKET_KINDS.map((k) => (
                  <label
                    key={k}
                    className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider cursor-pointer ${
                      kind === k
                        ? "border-blue-500 bg-blue-700/30 text-primary"
                        : "border-divider bg-panel text-label hover:text-default"
                    }`}
                  >
                    <input
                      type="radio"
                      name="platform-ticket-kind"
                      aria-label={k}
                      value={k}
                      checked={kind === k}
                      onChange={() => setKind(k)}
                      className="sr-only"
                    />
                    {k}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label
                htmlFor="bug-report-title-input"
                className="block text-[10px] font-semibold text-label uppercase tracking-wider pb-1"
              >
                Title (≥ 3 chars)
              </label>
              <input
                id="bug-report-title-input"
                ref={titleInputRef}
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
  const { data, isLoading, isError, error } = useGetPlatformStatusQuery(undefined, {
    pollingInterval: 30_000,
  });
  const showBugDialog = useSignal(false);

  if (isLoading) {
    return <div className="p-3 text-xs font-mono text-label">Loading platform status…</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-3 text-xs font-mono text-red-400" data-testid="platform-status-error">
        {describeError(error)}
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
      : stats.worstServiceUpRatio >= 1
        ? "✅"
        : stats.worstServiceUpRatio >= 0.95
          ? "⚠️"
          : "🚨";

  const knownSeverities = ["CRITICAL", "WARNING", "INFO"];
  const otherSeverities = Object.keys(stats.alertsBySeverity).filter(
    (s) => !knownSeverities.includes(s) && stats.alertsBySeverity[s] > 0
  );

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
          Raise ticket
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
            {knownSeverities.map((sev) => {
              const n = stats.alertsBySeverity[sev];
              if (!n) return null;
              return (
                <StatLine key={sev} label={sev.toLowerCase()}>
                  {n}
                </StatLine>
              );
            })}
            {otherSeverities.map((sev) => (
              <StatLine key={sev} label={sev.toLowerCase()}>
                {stats.alertsBySeverity[sev]}
              </StatLine>
            ))}
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
          User tickets (last 24h)
        </div>
        <StatLine label="GitHub delivery">
          <span
            data-testid="github-ticketing-health"
            className={data.ticketing.healthy ? "text-green-400" : "text-red-400"}
          >
            {data.ticketing.healthy ? "healthy" : data.ticketing.state}
          </span>
          {data.ticketing.checkedAt && (
            <span className="ml-2 text-muted">
              checked {relativeTime(now, data.ticketing.checkedAt)}
            </span>
          )}
        </StatLine>
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
        Daily summary posts to Support at 09:00 UTC. Real-time alerts and user tickets notify
        Support immediately. Tickets also create GitHub issues when ticketing is configured.
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
