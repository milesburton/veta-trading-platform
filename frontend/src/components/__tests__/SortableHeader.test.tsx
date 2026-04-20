import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SortableHeader } from "../grid/SortableHeader";

const dispatch = vi.fn();
const state: {
  gridPrefs: {
    orderBlotter: { sortField: string | null; sortDir: "asc" | "desc" | null };
  };
} = {
  gridPrefs: {
    orderBlotter: { sortField: null, sortDir: null },
  },
};

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
}));

describe("SortableHeader", () => {
  beforeEach(() => {
    dispatch.mockReset();
    state.gridPrefs.orderBlotter.sortField = null;
    state.gridPrefs.orderBlotter.sortDir = null;
  });

  it("renders with neutral sort state", () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader field="price" gridId="orderBlotter">
              Price
            </SortableHeader>
          </tr>
        </thead>
      </table>
    );

    expect(screen.getByRole("columnheader", { name: /Price/i })).toHaveAttribute(
      "aria-sort",
      "none"
    );
  });

  it("dispatches ascending sort then save prefs on click", () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader field="price" gridId="orderBlotter">
              Price
            </SortableHeader>
          </tr>
        </thead>
      </table>
    );

    fireEvent.click(screen.getByRole("columnheader", { name: /Price/i }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setSort",
        payload: { gridId: "orderBlotter", field: "price", dir: "asc" },
      })
    );
    expect(typeof dispatch.mock.calls[1][0]).toBe("function");
  });

  it("cycles to descending then none when already active", () => {
    state.gridPrefs.orderBlotter.sortField = "price";
    state.gridPrefs.orderBlotter.sortDir = "asc";

    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableHeader field="price" gridId="orderBlotter">
              Price
            </SortableHeader>
          </tr>
        </thead>
      </table>
    );

    fireEvent.click(screen.getByRole("columnheader", { name: /Price/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setSort",
        payload: { gridId: "orderBlotter", field: "price", dir: "desc" },
      })
    );

    dispatch.mockReset();
    state.gridPrefs.orderBlotter.sortDir = "desc";

    rerender(
      <table>
        <thead>
          <tr>
            <SortableHeader field="price" gridId="orderBlotter">
              Price
            </SortableHeader>
          </tr>
        </thead>
      </table>
    );

    fireEvent.click(screen.getByRole("columnheader", { name: /Price/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gridPrefs/setSort",
        payload: { gridId: "orderBlotter", field: null, dir: null },
      })
    );
  });
});
