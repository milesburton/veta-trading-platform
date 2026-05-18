import { usePopOut } from "@veta/frontend/hooks/usePopOut.ts";
import type { PanelId } from "@veta/frontend/store/windowSlice.ts";

export function PopOutButton({ panelId }: { panelId: PanelId }) {
  const { isPopOut, popOut } = usePopOut(panelId);
  return (
    <button
      type="button"
      onClick={popOut}
      disabled={isPopOut}
      title="Pop out panel"
      className="text-subtle hover:text-default transition-colors text-xs disabled:opacity-30"
      aria-label="Pop out panel"
    >
      ⬡
    </button>
  );
}
