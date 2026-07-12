import { useSignal } from "@preact/signals-react";
import {
  type BugCategory,
  type TicketKind,
  useSubmitBugReportMutation,
} from "@veta/frontend/store/gatewayApi.ts";
import type { FormEvent } from "react";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES: ReadonlyArray<{ value: BugCategory; label: string }> = [
  { value: "ui", label: "UI / display" },
  { value: "data", label: "Data / pricing" },
  { value: "auth", label: "Sign in / permissions" },
  { value: "performance", label: "Performance / hangs" },
  { value: "other", label: "Other" },
];

const TICKET_KINDS: ReadonlyArray<{ value: TicketKind; label: string; hint: string }> = [
  { value: "bug", label: "Bug", hint: "Something is broken or behaves incorrectly." },
  { value: "feature", label: "Feature", hint: "A capability or workflow you want added." },
  { value: "comment", label: "Comment", hint: "General product feedback or a question." },
];

export function BugReportModal({ open, onClose }: Props) {
  const kind = useSignal<TicketKind>("bug");
  const title = useSignal("");
  const description = useSignal("");
  const category = useSignal<BugCategory>("ui");
  const submitted = useSignal(false);
  const undelivered = useSignal(false);
  const ticketUrl = useSignal<string | null>(null);
  const ticketIssueNumber = useSignal<number | null>(null);
  const localError = useSignal<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [submitBugReport, { isLoading }] = useSubmitBugReportMutation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: submitted, undelivered and localError are stable signal refs whose .value is reset on open; only `open` should retrigger this effect
  useEffect(() => {
    if (!open) return;
    submitted.value = false;
    undelivered.value = false;
    ticketUrl.value = null;
    ticketIssueNumber.value = null;
    localError.value = null;
    const focusTimer = setTimeout(() => titleRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localError.value = null;
    const t = title.value.trim();
    const d = description.value.trim();
    if (t.length < 3) {
      localError.value = "Title must be at least 3 characters.";
      return;
    }
    if (d.length < 10) {
      localError.value = "Please describe what happened (at least 10 characters).";
      return;
    }
    const result = await submitBugReport({
      kind: kind.value,
      title: t,
      description: d,
      category: category.value,
      url: typeof window !== "undefined" ? globalThis.location.pathname : "",
    });
    if ("error" in result) {
      const e = result.error as { status?: number; data?: { error?: string } };
      if (e.status === 401) localError.value = "Please sign in before raising tickets.";
      else if (e.data?.error) localError.value = e.data.error;
      else localError.value = "Submission failed. Please try again.";
      return;
    }
    if ("data" in result) {
      submitted.value = true;
      title.value = "";
      description.value = "";
      ticketUrl.value = result.data.ticket?.url ?? null;
      ticketIssueNumber.value = result.data.ticket?.issueNumber ?? null;
      // 202 from backend signals "received but no external sink was configured"
      if (result.data.ok === false) {
        undelivered.value = true;
      }
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close ticket modal"
        className="fixed inset-0 z-40 bg-page/70 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-heading"
        data-testid="bug-report-modal"
        className="fixed left-1/2 top-1/2 z-50 w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-divider bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-panel px-4 py-3">
          <h2 id="bug-report-heading" className="text-sm font-semibold text-primary">
            Raise a ticket
          </h2>
          <button
            type="button"
            data-testid="bug-report-close"
            onClick={onClose}
            className="text-muted hover:text-default transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {submitted.value ? (
          <div className="p-6 space-y-3 text-center">
            <div className="text-emerald-400 text-3xl" aria-hidden="true">
              ✓
            </div>
            <p data-testid="bug-report-success" className="text-sm text-primary font-medium">
              Thanks — your report is in.
            </p>
            <p className="text-xs text-muted">
              {ticketUrl.value
                ? `Created GitHub issue #${ticketIssueNumber.value ?? "?"} and notified the VETA Discord channel.`
                : undelivered.value
                  ? "Received by the gateway, but no Discord webhook or GitHub ticketing backend is configured here."
                  : "Notified the VETA Discord channel. GitHub ticketing is not configured for this environment."}
            </p>
            {ticketUrl.value && (
              <a
                href={ticketUrl.value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/60"
              >
                Open ticket
              </a>
            )}
            <button
              type="button"
              data-testid="bug-report-done"
              onClick={onClose}
              className="rounded border border-emerald-700 bg-emerald-900/30 px-4 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/60"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <fieldset className="space-y-1">
              <legend className="block text-[10px] font-medium uppercase tracking-wider text-muted">
                Ticket type
              </legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Ticket type">
                {TICKET_KINDS.map((option) => (
                  <label
                    key={option.value}
                    className={`rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                      kind.value === option.value
                        ? "border-emerald-500 bg-emerald-900/30 text-emerald-200"
                        : "border-divider bg-page text-muted hover:text-default"
                    }`}
                  >
                    <input
                      type="radio"
                      name="ticket-kind"
                      aria-label={option.label}
                      value={option.value}
                      checked={kind.value === option.value}
                      onChange={() => {
                        kind.value = option.value;
                      }}
                      disabled={isLoading}
                      className="sr-only"
                    />
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-[10px] opacity-80">{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="space-y-1 block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
                Short title
              </span>
              <input
                ref={titleRef}
                data-testid="bug-report-title"
                type="text"
                value={title.value}
                onChange={(e) => {
                  title.value = e.target.value;
                }}
                placeholder="Order Blotter doesn't show fills"
                maxLength={120}
                disabled={isLoading}
                className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
              />
            </label>
            <label className="space-y-1 block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
                Category
              </span>
              <select
                data-testid="bug-report-category"
                value={category.value}
                onChange={(e) => {
                  category.value = e.target.value as BugCategory;
                }}
                disabled={isLoading}
                className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
                Details
              </span>
              <textarea
                data-testid="bug-report-description"
                value={description.value}
                onChange={(e) => {
                  description.value = e.target.value;
                }}
                placeholder="Steps to reproduce, what you expected, or the feedback you want the team to track…"
                rows={5}
                maxLength={2000}
                disabled={isLoading}
                className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50 resize-y"
              />
            </label>
            <p className="text-[10px] text-muted">
              This creates a GitHub issue when ticketing is configured and posts a summary to
              Discord. Your username, current page, and user-agent are included. Don't include
              passwords or sensitive data.
            </p>
            {localError.value && (
              <div
                data-testid="bug-report-error"
                className="text-center text-red-400 text-[11px] bg-red-900/20 border border-red-800 rounded px-3 py-1.5"
              >
                {localError.value}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded border border-divider bg-page px-3 py-1.5 text-xs text-muted hover:text-default hover:border-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="bug-report-submit"
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900/60"
              >
                {isLoading && (
                  <span className="h-3 w-3 rounded-full border border-white/60 border-t-transparent animate-spin" />
                )}
                {isLoading ? "Sending…" : "Raise ticket"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
