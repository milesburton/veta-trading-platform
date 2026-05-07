import { type ReactNode, useEffect } from "react";
import { type DrawerId, useDrawers } from "./DrawersContext.tsx";

const DRAWER_WIDTH_PX = 384;

interface Props {
  id: DrawerId;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function Drawer({ id, title, headerActions, children }: Props) {
  const { close, closeAll, openDrawers, positionOf } = useDrawers();
  const position = positionOf(id);

  useEffect(() => {
    if (position === -1) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [position, closeAll]);

  if (position === -1) return null;

  const isFrontmost = openDrawers[0] === id;
  const rightOffset = position * DRAWER_WIDTH_PX;

  return (
    <>
      {isFrontmost && (
        <button
          type="button"
          aria-label="Close drawer"
          tabIndex={-1}
          className="fixed inset-0 z-40 bg-black/40 cursor-default"
          onClick={() => closeAll()}
        />
      )}

      <div
        data-testid={`drawer-${id}`}
        data-drawer-position={position}
        className="fixed top-0 h-full z-50 flex flex-col bg-surface border-l border-panel shadow-2xl"
        style={{ right: `${rightOffset}px`, width: `${DRAWER_WIDTH_PX}px` }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel shrink-0">
          <span className="text-sm font-semibold text-secondary">{title}</span>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={() => close(id)}
              aria-label="Close"
              className="text-muted hover:text-secondary transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
