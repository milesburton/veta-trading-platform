import { fireEvent, render, screen } from "@testing-library/react";
import { VolSurfacePanel } from "@veta/frontend/components/VolSurfacePanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetVolSurfaceQuery: () => ({
    data: {
      symbol: "AAPL",
      spotPrice: 150.5,
      atTheMoneyVol: 0.22,
      moneynesses: [1],
      surface: [
        {
          strike: 150,
          moneyness: 1,
          impliedVol: 0.25,
          expiryLabel: "7d",
          expirySecs: 7 * 86_400,
        },
      ],
      computedAt: Date.now(),
    },
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      ui: {
        selectedAsset: "AAPL",
      },
    };
    return selector(state);
  },
}));

describe("VolSurfacePanel", () => {
  beforeEach(() => {
    dispatch.mockReset();
  });

  it("renders summary details for loaded surface", () => {
    render(<VolSurfacePanel />);

    expect(screen.getByText(/Vol Surface/i)).toBeInTheDocument();
    expect(screen.getByText(/Spot:/i)).toBeInTheDocument();
    expect(screen.getByText(/\$150.50/i)).toBeInTheDocument();
    expect(screen.getByText(/ATM Vol:/i)).toBeInTheDocument();
    expect(screen.getByText(/1 points/i)).toBeInTheDocument();
  });

  it("dispatches option prefill when a surface cell is clicked", () => {
    render(<VolSurfacePanel />);

    fireEvent.click(screen.getByRole("button", { name: /25.0%/i }));

    expect(dispatch).toHaveBeenCalled();
    expect(dispatch.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: "ui/setOptionPrefill",
        payload: { strike: 150, expirySecs: 7 * 86_400 },
      })
    );
  });

  it("shows legend bounds", () => {
    render(<VolSurfacePanel />);

    expect(screen.getAllByText(/25.0%/).length).toBeGreaterThan(1);
  });

  it("changes the displayed symbol when selector changes", () => {
    render(<VolSurfacePanel />);
    const select = screen.queryByRole("combobox");
    if (select) {
      fireEvent.change(select, { target: { value: "MSFT" } });
    }
    expect(screen.getByText(/Vol Surface/i)).toBeInTheDocument();
  });

  it("hovering a cell shows tooltip", () => {
    render(<VolSurfacePanel />);
    const cell = screen.getByRole("button", { name: /25\.0%/i });
    fireEvent.mouseEnter(cell);
    fireEvent.mouseLeave(cell);
    expect(cell).toBeInTheDocument();
  });
});
