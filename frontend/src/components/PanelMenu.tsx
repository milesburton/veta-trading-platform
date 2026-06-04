import { useSignal } from "@preact/signals-react";
import { useChannelContext } from "@veta/frontend/contexts/ChannelContext.tsx";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { panelDialogClosed, panelDialogOpened } from "@veta/frontend/store/windowSlice.ts";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDashboard } from "./DashboardLayout.tsx";

/**
 * Panel action menu — replaces the single pop-out button with a small dropdown.
 * Provides "Open in new window" and "Open in dialog" actions.
 *
 * panelId should be the FlexLayout node instance ID (from ChannelContext.instanceId)
 * or a stable identifier for singleton panels.
 */
export function PanelMenu({ panelId }: { panelId?: string }) {
  const dispatch = useAppDispatch();
  const ctx = useChannelContext();
  const { storageKey, removeTabById } = useDashboard();
  const instanceId = panelId ?? ctx.instanceId;
  const panelType = ctx.panelType;

  const isDialog = useAppSelector((s) => s.windows.dialogs[instanceId]?.open ?? false);

  const open = useSignal(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open.value) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        open.value = false;
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open.value, open]);

  useEffect(() => {
    if (!open.value) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") open.value = false;
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open.value, open]);

  function openNewWindow() {
    open.value = false;
    const params = new URLSearchParams({
      panel: instanceId,
      type: panelType,
      layout: storageKey,
    });
    const url = `${globalThis.location.origin}${globalThis.location.pathname}?${params}`;
    const w = globalThis.open(url, `panel-${instanceId}`, "width=1200,height=700,resizable=yes");
    if (w) {
      // Remove the tab from the host layout immediately so the space is reclaimed.
      removeTabById(instanceId);
    }
  }

  function openDialog() {
    open.value = false;
    dispatch(panelDialogOpened({ panelId: instanceId, panelType }));
  }

  function closeDialog() {
    dispatch(panelDialogClosed({ panelId: instanceId }));
  }

  const isActive = isDialog;

  const menuStyle = (): React.CSSProperties => {
    if (!btnRef.current) return { top: 0, right: 0 };
    const r = btnRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      top: r.bottom + 4,
      right: globalThis.innerWidth - r.right,
      zIndex: 9999,
    };
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        title="Panel actions: open in new window or dialog"
        aria-label="Panel actions"
        aria-haspopup="menu"
        aria-expanded={open.value}
        className={`text-xs transition-colors ${
          isActive ? "text-sky-400" : "text-subtle hover:text-default"
        } disabled:opacity-30`}
      >
        ⬡
      </button>

      {open.value &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Panel actions menu"
            style={menuStyle()}
            className="bg-surface border border-divider rounded shadow-xl py-1 min-w-[160px]"
          >
            <button
              role="menuitem"
              type="button"
              onClick={openNewWindow}
              title="Open this panel in a new browser window"
              className="w-full text-left px-3 py-1.5 text-xs text-default hover:bg-divider flex items-center gap-2"
            >
              <span aria-hidden="true">↗</span>
              New window
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={isDialog}
              onClick={openDialog}
              title={
                isDialog
                  ? "Already open in a dialog"
                  : "Open this panel in a floating dialog overlay"
              }
              className="w-full text-left px-3 py-1.5 text-xs text-default hover:bg-divider disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span aria-hidden="true">□</span>
              Open in dialog
            </button>
            {isDialog && (
              <>
                <hr className="border-t border-divider my-1" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    open.value = false;
                    closeDialog();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-divider flex items-center gap-2"
                >
                  <span aria-hidden="true">✕</span>
                  Close dialog
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
