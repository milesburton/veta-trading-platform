import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YieldCurvePanel } from "../YieldCurvePanel";

const fetchCurve = vi.fn();
const priceBond = vi.fn();

const state: {
  curveLoading: boolean;
  bondLoading: boolean;
  curveData: {
    curve: Array<{ tenorLabel: string; spotRate: number }>;
    forwardRates: Array<{ label: string; rate: number }>;
  } | null;
  bondData: {
    price: number;
    modifiedDuration: number;
    convexity: number;
    dv01: number;
  } | null;
} = {
  curveLoading: false,
  bondLoading: false,
  curveData: null,
  bondData: null,
};

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetYieldCurveMutation: () => [
    fetchCurve,
    {
      data: state.curveData,
      isLoading: state.curveLoading,
    },
  ],
  useGetBondPriceMutation: () => [
    priceBond,
    {
      data: state.bondData,
      isLoading: state.bondLoading,
    },
  ],
}));

beforeEach(() => {
  fetchCurve.mockReset();
  priceBond.mockReset();
  state.curveLoading = false;
  state.bondLoading = false;
  state.curveData = {
    curve: [
      { tenorLabel: "1Y", spotRate: 0.03 },
      { tenorLabel: "2Y", spotRate: 0.032 },
      { tenorLabel: "5Y", spotRate: 0.034 },
    ],
    forwardRates: [
      { label: "1x2", rate: 0.031 },
      { label: "2x3", rate: 0.033 },
      { label: "3x5", rate: 0.032 },
    ],
  };
  state.bondData = null;
});

describe("YieldCurvePanel", () => {
  it("fetches curve on mount and refreshes on click", async () => {
    render(<YieldCurvePanel />);

    await waitFor(() => {
      expect(fetchCurve).toHaveBeenCalledWith({});
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));

    await waitFor(() => {
      expect(fetchCurve).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText(/Implied Forward Rates/i)).toBeInTheDocument();
  });

  it("shows no data state when curve is empty", () => {
    state.curveData = { curve: [], forwardRates: [] };
    render(<YieldCurvePanel />);

    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("prices a bond from form values and renders metrics", async () => {
    state.bondData = {
      price: 1012.34,
      modifiedDuration: 4.321,
      convexity: 20.55,
      dv01: 0.4821,
    };

    render(<YieldCurvePanel />);

    fireEvent.click(screen.getByRole("button", { name: /Bond Pricing/i }));
    fireEvent.change(screen.getByLabelText("Face"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Coupon %"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Freq/yr"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Periods"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Yield %"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Price Bond/i }));

    await waitFor(() => {
      expect(priceBond).toHaveBeenCalledWith({
        face: 2000,
        couponRate: 0.06,
        periodsPerYear: 2,
        totalPeriods: 10,
        yieldAnnual: 0.05,
      });
    });

    expect(screen.getByText("$1012.34")).toBeInTheDocument();
    expect(screen.getByText("4.321")).toBeInTheDocument();
    expect(screen.getByText("20.550")).toBeInTheDocument();
    expect(screen.getByText("$0.4821")).toBeInTheDocument();
  });
});
