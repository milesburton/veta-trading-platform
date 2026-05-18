import type { Signal } from "@preact/signals-react";
import type { RefObject } from "react";
import type { Workspace } from "../WorkspaceBar";

export interface WorkspaceListItemProps {
  ws: Workspace;
  active: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  isExpanded: boolean;
  editValue: Signal<string>;
  inputRef: RefObject<HTMLInputElement>;
  sharedIds: Signal<Set<string>>;
  confirmDeleteId: Signal<string | null>;
  editingId: Signal<string | null>;
  onSelect: (id: string) => void;
  removeWorkspace: (id: string) => void;
  toggleUserLock: (id: string) => void;
  startRename: (id: string, name: string) => void;
  commitRename: () => void;
  shareWorkspace: (ws: Workspace) => void;
}

const LOCK_PATH_LOCKED =
  "M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3.75A1.75 1.75 0 0 0 2 7.75v4.5C2 13.216 2.784 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-4.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Zm-1 4.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z";
const LOCK_PATH_UNLOCKED =
  "M11.5 4.5a3.5 3.5 0 0 0-7 0V6H3.75A1.75 1.75 0 0 0 2 7.75v4.5C2 13.216 2.784 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-4.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5Zm-1.5 0V6h-4V4.5a2 2 0 1 1 4 0Zm-1 5.75a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z";
const SHARE_PATH =
  "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5a5.5 5.5 0 0 1 4.91 3H10.5c-.2-.9-.54-1.71-.98-2.38A5.52 5.52 0 0 0 8 2.5Zm0 11a5.5 5.5 0 0 1-4.91-3H4.5c.2.9.54 1.71.98 2.38.45.67.97 1.14 1.52 1.42V13a.5.5 0 0 0 1 0v-.7c.55-.28 1.07-.75 1.52-1.42.44-.67.78-1.48.98-2.38h1.41A5.5 5.5 0 0 1 8 13.5Zm-1.5-2c-.37-.57-.66-1.28-.82-2H9.32c-.16.72-.45 1.43-.82 2H6.5Zm-2.41-2A5.52 5.52 0 0 1 4 8c0-.52.07-1.02.19-1.5H3.09A5.5 5.5 0 0 0 2.5 8c0 .52.07 1.02.19 1.5h1.4Zm.59-3h2.14C6.98 5.77 7.48 5.5 8 5.5s1.02.27 1.18.5H11.3A5.51 5.51 0 0 0 8 2.5a5.51 5.51 0 0 0-3.3 1.5H4.68Zm5.94 0h-1.4c.12.48.19.98.19 1.5 0 .52-.07 1.02-.19 1.5h1.4c.12-.48.19-.98.19-1.5 0-.52-.07-1.02-.19-1.5Z";
const DELETE_PATH =
  "M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z";

function Icon({
  path,
  fillRule = false,
  className,
}: {
  path: string;
  fillRule?: boolean;
  className: string;
}) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      {fillRule ? <path fillRule="evenodd" d={path} clipRule="evenodd" /> : <path d={path} />}
    </svg>
  );
}

function DeleteConfirmRow({
  ws,
  confirmDeleteId,
  removeWorkspace,
}: {
  ws: Workspace;
  confirmDeleteId: Signal<string | null>;
  removeWorkspace: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 w-full min-w-0">
      <span className="flex-1 text-[10px] text-label truncate">
        Delete &ldquo;{ws.name}&rdquo;?
      </span>
      <button
        type="button"
        title="Cancel delete"
        onClick={() => {
          confirmDeleteId.value = null;
        }}
        className="text-[10px] text-muted hover:text-default px-1"
      >
        Cancel
      </button>
      <button
        type="button"
        title={`Confirm delete ${ws.name}`}
        onClick={() => {
          confirmDeleteId.value = null;
          removeWorkspace(ws.id);
        }}
        className="text-[10px] text-red-500 hover:text-red-400 px-1"
      >
        Delete
      </button>
    </div>
  );
}

function RenameInput({
  ws,
  editValue,
  editingId,
  inputRef,
  commitRename,
}: {
  ws: Workspace;
  editValue: Signal<string>;
  editingId: Signal<string | null>;
  inputRef: RefObject<HTMLInputElement>;
  commitRename: () => void;
}) {
  return (
    <input
      ref={inputRef}
      aria-label={`Rename workspace ${ws.name}`}
      value={editValue.value}
      onChange={(e) => {
        editValue.value = e.target.value;
      }}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") {
          editingId.value = null;
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 min-w-0 bg-panel text-primary text-[11px] px-1 rounded outline-none border border-emerald-500"
    />
  );
}

function WorkspaceTitleButton({
  ws,
  active,
  presetLocked,
  locked,
  onSelect,
  startRename,
  toggleUserLock,
}: {
  ws: Workspace;
  active: boolean;
  presetLocked: boolean;
  locked: boolean;
  onSelect: (id: string) => void;
  startRename: (id: string, name: string) => void;
  toggleUserLock: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`workspace-tab-${ws.id}`}
      aria-label={`Switch to workspace: ${ws.name}`}
      aria-current={active ? "page" : undefined}
      title={
        presetLocked
          ? "Click to switch (default workspace — cannot rename or delete)"
          : locked
            ? "Click to switch (locked — right-click to unlock)"
            : "Click to switch · Right-click to rename"
      }
      className={`flex-1 min-w-0 text-left text-[11px] truncate bg-transparent border-0 p-0 cursor-pointer ${
        active ? "text-secondary" : "text-muted hover:text-default"
      }`}
      onClick={() => onSelect(ws.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (presetLocked) return;
        if (ws.userLocked) {
          toggleUserLock(ws.id);
        } else {
          startRename(ws.id, ws.name);
        }
      }}
    >
      {ws.name}
    </button>
  );
}

function LockedIndicator({
  presetLocked,
  ws,
  toggleUserLock,
}: {
  presetLocked: boolean;
  ws: Workspace;
  toggleUserLock: (id: string) => void;
}) {
  if (presetLocked) {
    return (
      <span
        title="Default workspace — cannot be renamed, deleted, or shared"
        className="shrink-0 text-subtle p-0.5"
      >
        <Icon path={LOCK_PATH_LOCKED} fillRule className="w-3 h-3" />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Unlock workspace ${ws.name}`}
      title="Locked by you — right-click or click to unlock"
      onClick={(e) => {
        e.stopPropagation();
        toggleUserLock(ws.id);
      }}
      className="shrink-0 text-amber-500 hover:text-amber-400 p-0.5 transition-colors"
    >
      <Icon path={LOCK_PATH_LOCKED} fillRule className="w-3 h-3" />
    </button>
  );
}

function UnlockedActions({
  ws,
  sharedIds,
  confirmDeleteId,
  toggleUserLock,
  shareWorkspace,
}: {
  ws: Workspace;
  sharedIds: Signal<Set<string>>;
  confirmDeleteId: Signal<string | null>;
  toggleUserLock: (id: string) => void;
  shareWorkspace: (ws: Workspace) => void;
}) {
  const isShared = sharedIds.value.has(ws.id);
  return (
    <>
      <button
        type="button"
        aria-label={`Lock workspace ${ws.name}`}
        title="Lock workspace (prevent rename and delete)"
        onClick={(e) => {
          e.stopPropagation();
          toggleUserLock(ws.id);
        }}
        className="shrink-0 text-subtle hover:text-label opacity-0 group-hover:opacity-100 p-0.5 transition-all"
      >
        <Icon path={LOCK_PATH_UNLOCKED} className="w-3 h-3" />
      </button>
      <button
        type="button"
        data-testid="share-workspace-btn"
        aria-label={`Share workspace ${ws.name}`}
        title={isShared ? "Shared — click to copy link again" : "Share workspace (copies link)"}
        onClick={(e) => {
          e.stopPropagation();
          shareWorkspace(ws);
        }}
        className={`shrink-0 transition-all hover:scale-110 p-0.5 ${
          isShared
            ? "text-emerald-400 opacity-100 hover:text-emerald-300"
            : "text-default opacity-0 group-hover:opacity-100 hover:text-emerald-300"
        }`}
      >
        <Icon path={SHARE_PATH} className="w-3 h-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete workspace ${ws.name}`}
        title={`Delete ${ws.name}`}
        onClick={(e) => {
          e.stopPropagation();
          confirmDeleteId.value = ws.id;
        }}
        className="shrink-0 text-default hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 p-0.5"
      >
        <Icon path={DELETE_PATH} fillRule className="w-3 h-3" />
      </button>
    </>
  );
}

function CollapsedWorkspaceButton({
  ws,
  active,
  presetLocked,
  onSelect,
}: {
  ws: Workspace;
  active: boolean;
  presetLocked: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`workspace-tab-${ws.id}`}
      aria-label={`Switch to workspace: ${ws.name}`}
      aria-current={active ? "page" : undefined}
      title={
        presetLocked
          ? `${ws.name} (default workspace)`
          : ws.userLocked
            ? `${ws.name} (locked by you)`
            : `Switch to workspace: ${ws.name}`
      }
      onClick={() => onSelect(ws.id)}
      className={`relative flex items-center justify-center w-8 h-8 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
        active ? "text-emerald-400" : "text-subtle hover:text-default"
      }`}
    >
      {ws.name.charAt(0)}
      {presetLocked && (
        <span className="absolute bottom-0.5 right-0.5 text-[6px] text-subtle leading-none">
          🔒
        </span>
      )}
      {ws.userLocked && !presetLocked && (
        <span className="absolute bottom-0.5 right-0.5 text-[6px] text-amber-500 leading-none">
          🔒
        </span>
      )}
    </button>
  );
}

export function WorkspaceListItem(props: WorkspaceListItemProps) {
  const {
    ws,
    active,
    isEditing,
    isConfirmingDelete,
    isExpanded,
    editValue,
    inputRef,
    sharedIds,
    confirmDeleteId,
    editingId,
    onSelect,
    removeWorkspace,
    toggleUserLock,
    startRename,
    commitRename,
    shareWorkspace,
  } = props;
  const presetLocked = ws.locked === true;
  const locked = presetLocked || ws.userLocked === true;

  return (
    <li
      key={ws.id}
      className={`group relative flex items-center border-b border-panel/60 ${
        active
          ? "bg-surface border-l-2 border-l-emerald-500"
          : "border-l-2 border-l-transparent hover:bg-surface/40"
      }`}
    >
      {isExpanded ? (
        <div className="flex items-center w-full min-w-0 px-2 py-1.5 gap-1">
          {isConfirmingDelete ? (
            <DeleteConfirmRow
              ws={ws}
              confirmDeleteId={confirmDeleteId}
              removeWorkspace={removeWorkspace}
            />
          ) : isEditing ? (
            <RenameInput
              ws={ws}
              editValue={editValue}
              editingId={editingId}
              inputRef={inputRef}
              commitRename={commitRename}
            />
          ) : (
            <>
              <WorkspaceTitleButton
                ws={ws}
                active={active}
                presetLocked={presetLocked}
                locked={locked}
                onSelect={onSelect}
                startRename={startRename}
                toggleUserLock={toggleUserLock}
              />
              {locked ? (
                <LockedIndicator
                  presetLocked={presetLocked}
                  ws={ws}
                  toggleUserLock={toggleUserLock}
                />
              ) : (
                <UnlockedActions
                  ws={ws}
                  sharedIds={sharedIds}
                  confirmDeleteId={confirmDeleteId}
                  toggleUserLock={toggleUserLock}
                  shareWorkspace={shareWorkspace}
                />
              )}
            </>
          )}
        </div>
      ) : (
        <CollapsedWorkspaceButton
          ws={ws}
          active={active}
          presetLocked={presetLocked}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}
