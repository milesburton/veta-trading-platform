import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResizableHeader } from "../ResizableHeader";

const dispatch = vi.fn();
const state = {
  gridPrefs: {
    executions: {
      sortField: null as string | null,
      sortDir: null as "asc" | "desc" | null,
    },
  },
};

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
}));

function renderHeader(
  props: Partial<React.ComponentProps<typeof ResizableHeader>> = {},
) {
  const onResize = vi.fn();
  const onColumnDragStart = vi.fn();
  const onColumnDrop = vi.fn();
  const onContextMenu = vi.fn();

  render(
    <table>
      <thead>
        <tr>
          <ResizableHeader
            colKey="asset"
            width={120}
            gridId="executions"
            sortable
            onResize={onResize}
            onColumnDragStart={onColumnDragStart}
            onColumnDrop={onColumnDrop}
            onContextMenu={onContextMenu}
            {...props}
          >
            Asset
          </ResizableHeader>
        </tr>
      </thead>
    </table>,
  );

  return { onResize, onColumnDragStart, onColumnDrop, onContextMenu };
}

describe("ResizableHeader", () => {
  beforeEach(() => {
    dispatch.mockReset();
    state.gridPrefs.executions.sortField = null;
    state.gridPrefs.executions.sortDir = null;
  });

  it("dispatches ascending sort and save on click", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: /Asset/i }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setSort",
        payload: { gridId: "executions", field: "asset", dir: "asc" },
      }),
    );
    expect(typeof dispatch.mock.calls[1][0]).toBe("function");
  });

  it("handles keyboard sorting and exposes active aria-sort", () => {
    state.gridPrefs.executions.sortField = "asset";
    state.gridPrefs.executions.sortDir = "asc";

    renderHeader();

    expect(
      screen.getByRole("columnheader", { name: /Asset/i }),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.keyDown(screen.getByRole("button", { name: /Asset/i }), {
      key: "Enter",
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setSort",
        payload: { gridId: "executions", field: "asset", dir: "desc" },
      }),
    );
  });

  it("resizes and supports drag/drop callbacks", () => {
    const { onResize, onColumnDragStart, onColumnDrop } = renderHeader();

    const header = screen.getByRole("columnheader", { name: /Asset/i });
    const handle = header.querySelector(".resize-handle");
    if (!handle) throw new Error("expected resize handle");

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 160 });
    fireEvent.mouseUp(document);

    expect(onResize).toHaveBeenCalledWith("asset", 180);

    fireEvent.dragStart(header, {
      dataTransfer: { effectAllowed: "", setData: () => {}, dropEffect: "" },
    });
    expect(onColumnDragStart).toHaveBeenCalledWith("asset");

    fireEvent.drop(header, {
      dataTransfer: { dropEffect: "move" },
    });
    expect(onColumnDrop).toHaveBeenCalledWith("asset");
  });
});
