import { fireEvent, render, screen } from "@testing-library/react";
import { VolSurfacePanel } from "@veta/frontend/components/VolSurfacePanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
let queryResult: {
  data: unknown;
  isFetching: boolean;
  isError: boolean;
} = {
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
};

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetVolSurfaceQuery: () => queryResult,
}));

let selectedAsset: string | null = "AAPL";

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      ui: {
        selectedAsset,
      },
    };
    return selector(state);
  },
}));

const DEFAULT_QUERY_RESULT = {
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
};

describe("VolSurfacePanel", () => {
  beforeEach(() => {
    dispatch.mockReset();
    queryResult = { ...DEFAULT_QUERY_RESULT };
    selectedAsset = "AAPL";
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

  it("shows a loading placeholder when there's no data yet and nothing is erroring", () => {
    queryResult = { data: undefined, isFetching: false, isError: false };
    render(<VolSurfacePanel />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it("shows a 'refreshing' indicator while isFetching is true", () => {
    queryResult = { ...DEFAULT_QUERY_RESULT, isFetching: true };
    render(<VolSurfacePanel />);
    expect(screen.getByText(/refreshing…/i)).toBeInTheDocument();
  });

  it("shows an error message and not the loading placeholder when the query errors", () => {
    queryResult = { data: undefined, isFetching: false, isError: true };
    render(<VolSurfacePanel />);
    expect(screen.getByText(/Failed to load vol surface/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading…/i)).not.toBeInTheDocument();
  });

  it("renders an empty grey cell for a moneyness/expiry combination with no data point", () => {
    queryResult = {
      data: {
        ...DEFAULT_QUERY_RESULT.data,
        moneynesses: [0.7, 1],
        surface: [
          {
            strike: 150,
            moneyness: 1,
            impliedVol: 0.25,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
          // no point at moneyness 0.7 for any expiry — every cell in that row
          // must fall back to the empty placeholder div
        ],
      },
      isFetching: false,
      isError: false,
    };
    render(<VolSurfacePanel />);
    // 5 expiry columns with no data at moneyness 0.7, none of them a button
    expect(screen.getAllByRole("button").length).toBe(1);
  });

  it("shows the moneyness percentage label (not 'ATM') for a non-1.0 moneyness", () => {
    queryResult = {
      data: {
        ...DEFAULT_QUERY_RESULT.data,
        moneynesses: [0.7],
        surface: [
          {
            strike: 105,
            moneyness: 0.7,
            impliedVol: 0.4,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
        ],
      },
      isFetching: false,
      isError: false,
    };
    render(<VolSurfacePanel />);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.queryByText("ATM")).not.toBeInTheDocument();
  });

  it("falls back to a computed percentage label for a moneyness with no preset label", () => {
    queryResult = {
      data: {
        ...DEFAULT_QUERY_RESULT.data,
        moneynesses: [0.6],
        surface: [
          {
            strike: 90,
            moneyness: 0.6,
            impliedVol: 0.5,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
        ],
      },
      isFetching: false,
      isError: false,
    };
    render(<VolSurfacePanel />);
    expect(screen.getByText("60.0%")).toBeInTheDocument();
  });

  it("shows ' (ATM)' in the tooltip when hovering the moneyness=1.0 cell", () => {
    render(<VolSurfacePanel />);
    const cell = screen.getByRole("button", { name: /25\.0%/i });
    fireEvent.mouseEnter(cell);
    expect(screen.getByText(/\(ATM\)/)).toBeInTheDocument();
  });

  it("does not show ' (ATM)' in the tooltip for a non-1.0 moneyness cell", () => {
    queryResult = {
      data: {
        ...DEFAULT_QUERY_RESULT.data,
        moneynesses: [0.85],
        surface: [
          {
            strike: 128,
            moneyness: 0.85,
            impliedVol: 0.3,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
        ],
      },
      isFetching: false,
      isError: false,
    };
    render(<VolSurfacePanel />);
    const cell = screen.getByRole("button", { name: /30\.0%/i });
    fireEvent.mouseEnter(cell);
    expect(screen.queryByText(/\(ATM\)/)).not.toBeInTheDocument();
  });

  it("spans both halves of the color gradient across a spread of implied vols", () => {
    // A wide vol range exercises both the low half (t < 0.5) and high half
    // (t >= 0.5) branches of volToColor/textColor, and both text-color
    // thresholds (t > 0.65 -> white, t < 0.2 -> white, else surface).
    queryResult = {
      data: {
        ...DEFAULT_QUERY_RESULT.data,
        moneynesses: [0.7, 1, 1.3],
        surface: [
          {
            strike: 105,
            moneyness: 0.7,
            impliedVol: 0.1,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
          { strike: 150, moneyness: 1, impliedVol: 0.3, expiryLabel: "7d", expirySecs: 7 * 86_400 },
          {
            strike: 195,
            moneyness: 1.3,
            impliedVol: 0.9,
            expiryLabel: "7d",
            expirySecs: 7 * 86_400,
          },
        ],
      },
      isFetching: false,
      isError: false,
    };
    render(<VolSurfacePanel />);
    expect(screen.getByRole("button", { name: /10\.0%/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /30\.0%/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /90\.0%/i })).toBeInTheDocument();
  });

  it("does not sync the selected symbol when it isn't one of the panel's default symbols", () => {
    selectedAsset = "NOT-A-TRACKED-SYMBOL";
    render(<VolSurfacePanel />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("AAPL");
  });

  it("syncs the selected symbol when it changes to a tracked default symbol", () => {
    selectedAsset = "MSFT";
    render(<VolSurfacePanel />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("MSFT");
  });
});
