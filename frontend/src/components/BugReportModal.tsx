import { useSignal } from "@preact/signals-react";
import { type BugCategory, useSubmitBugReportMutation } from "@veta/frontend/store/gatewayApi.ts";
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

export function BugReportModal({ open, onClose }: Props) {
  const title = useSignal("");
  const description = useSignal("");
  const category = useSignal<BugCategory>("ui");
  const submitted = useSignal(false);
  const undelivered = useSignal(false);
  const localError = useSignal<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [submitBugReport, { isLoading }] = useSubmitBugReportMutation();

  useEffect(() => {
    if (!open) return;
    submitted.value = false;
    undelivered.value = false;
    localError.value = null;
    const focusTimer = setTimeout(() => titleRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, submitted, undelivered, localError]);

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
      title: t,
      description: d,
      category: category.value,
      url: typeof window !== "undefined" ? globalThis.location.pathname : "",
    });
    if ("error" in result) {
      const e = result.error as { status?: number; data?: { error?: string } };
      if (e.status === 401) localError.value = "Please sign in before submitting bug reports.";
      else if (e.data?.error) localError.value = e.data.error;
      else localError.value = "Submission failed. Please try again.";
      return;
    }
    if ("data" in result) {
      submitted.value = true;
      title.value = "";
      description.value = "";
      // 202 from backend signals "received but not delivered to Discord"
      if (result.data.ok === false) {
        undelivered.value = true;
      }
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close bug report modal"
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
            Report a bug
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
              {undelivered.value
                ? "Stored on the server. The Discord channel isn't configured here, so an operator will pick it up on their side."
                : "Posted to the VETA bug-reports Discord channel."}
            </p>
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
            <label className="space-y-1 block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-muted">
                What went wrong (short title)
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
                What happened, what did you expect?
              </span>
              <textarea
                data-testid="bug-report-description"
                value={description.value}
                onChange={(e) => {
                  description.value = e.target.value;
                }}
                placeholder="Steps to reproduce, what you expected vs what happened…"
                rows={5}
                maxLength={2000}
                disabled={isLoading}
                className="w-full rounded border border-divider bg-page px-3 py-1.5 text-xs text-primary outline-none transition-colors focus:border-emerald-500 disabled:opacity-50 resize-y"
              />
            </label>
            <p className="text-[10px] text-muted">
              Your username, current page, and user-agent are sent with the report. Don't include
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
                {isLoading ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
