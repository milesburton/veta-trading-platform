import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "../ContextMenu";
import { ContextMenu, useContextMenu } from "../ContextMenu";

const baseItems: ContextMenuEntry[] = [
  { label: "Copy symbol", icon: "⎘", onClick: vi.fn() },
  { label: "View chart", onClick: vi.fn() },
];

function renderMenu(overrides?: {
  items?: ContextMenuEntry[];
  x?: number;
  y?: number;
  onClose?: () => void;
}) {
  const onClose = overrides?.onClose ?? vi.fn();
  render(
    <ContextMenu
      items={overrides?.items ?? baseItems}
      x={overrides?.x ?? 100}
      y={overrides?.y ?? 100}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("ContextMenu – rendering", () => {
  it("renders with role=menu", () => {
    renderMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("renders menu items as menuitem buttons", () => {
    renderMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
  });

  it("renders item labels", () => {
    renderMenu();
    expect(screen.getByText("Copy symbol")).toBeInTheDocument();
    expect(screen.getByText("View chart")).toBeInTheDocument();
  });

  it("renders separators as non-button elements", () => {
    const itemsWithSep: ContextMenuEntry[] = [
      { label: "Item A", onClick: vi.fn() },
      { separator: true },
      { label: "Item B", onClick: vi.fn() },
    ];
    renderMenu({ items: itemsWithSep });
    // Only 2 menuitem buttons, not 3
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("renders disabled items as disabled buttons", () => {
    const items: ContextMenuEntry[] = [
      { label: "Disabled item", disabled: true, onClick: vi.fn() },
    ];
    renderMenu({ items });
    expect(screen.getByRole("menuitem")).toBeDisabled();
  });
});

describe("ContextMenu – interactions", () => {
  it("calls onClick and onClose when a menu item is clicked", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [{ label: "Do thing", onClick }];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClick when a disabled item is clicked", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [
      {
        label: "Disabled",
        disabled: true,
        onClick,
      },
    ];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking outside the menu", () => {
    const { onClose } = renderMenu();
    // Click on document body (outside menu)
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside the menu", () => {
    const { onClose } = renderMenu();
    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clamps menu position so it stays inside viewport", () => {
    renderMenu({ x: 10_000, y: 10_000 });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).not.toBe("10000px");
    expect(menu.style.top).not.toBe("10000px");
  });

  it("renders shortcut and icon when provided", () => {
    renderMenu({
      items: [
        { label: "Duplicate", icon: "⎘", shortcut: "Cmd+D", onClick: vi.fn() },
      ],
    });
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Cmd+D")).toBeInTheDocument();
    expect(screen.getByText("⎘")).toBeInTheDocument();
  });
});

describe("useContextMenu", () => {
  it("opens and closes menu state", () => {
    const { result } = renderHook(() => useContextMenu());

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 42,
      clientY: 24,
    } as unknown as {
      preventDefault: () => void;
      stopPropagation: () => void;
      clientX: number;
      clientY: number;
    };

    act(() => {
      result.current.openMenu(event, [{ label: "Copy", onClick: vi.fn() }]);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.menu.value?.x).toBe(42);
    expect(result.current.menu.value?.y).toBe(24);
    expect(result.current.menu.value?.items).toHaveLength(1);

    act(() => {
      result.current.closeMenu();
    });
    expect(result.current.menu.value).toBeNull();
  });
});
