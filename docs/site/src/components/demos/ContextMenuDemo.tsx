import { useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "@veta/frontend/components/ContextMenu";

export function ContextMenuDemo() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const items: ContextMenuEntry[] = [
    {
      label: "Open",
      icon: "📂",
      shortcut: "⌘O",
      onClick: () => setLastAction("Open"),
    },
    {
      label: "Pop out",
      icon: "↗",
      onClick: () => setLastAction("Pop out"),
    },
    { separator: true, label: "Layout" },
    {
      label: "Reset layout",
      icon: "↺",
      onClick: () => setLastAction("Reset layout"),
    },
    {
      label: "Disabled action",
      icon: "🚫",
      disabled: true,
      onClick: () => setLastAction("Disabled action (should not fire)"),
    },
    { separator: true },
    {
      label: "Remove panel",
      icon: "🗑",
      shortcut: "⌫",
      danger: true,
      onClick: () => setLastAction("Remove panel"),
    },
  ];

  return (
    <div style={{ minHeight: "200px" }}>
      <button
        type="button"
        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{
          padding: "0.6rem 1rem",
          background: "#1e293b",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "0.85rem",
        }}
      >
        Click or right-click to open the context menu
      </button>
      <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#94a3b8" }}>
        Last action: <code>{lastAction ?? "(none)"}</code>
      </div>
      {menu && (
        <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

export default ContextMenuDemo;
