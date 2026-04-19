import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpreadAnalysisPanel } from "../SpreadAnalysisPanel";

const compute = vi.fn();
const mutationState: {
  data:
    | {
        tenorYears: number;
        govSpotRate: number;
        gSpread: number;
        zSpread: number;
        oas: number;
      }
    | undefined;
  isLoading: boolean;
  isError: boolean;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetSpreadAnalysisMutation: () => [compute, mutationState],
}));

describe("SpreadAnalysisPanel", () => {
  beforeEach(() => {
    compute.mockReset();
    mutationState.data = undefined;
    mutationState.isLoading = false;
    mutationState.isError = false;
  });

  it("submits spread analysis request from form values", async () => {
    render(<SpreadAnalysisPanel />);

    fireEvent.change(screen.getByLabelText(/Coupon %/i), {
      target: { value: "6.25" },
    });
    fireEvent.change(screen.getByLabelText(/^Periods$/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Freq\/yr/i), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(/Yield %/i), {
      target: { value: "5.5" },
    });
    fireEvent.change(screen.getByLabelText(/Face \$/i), {
      target: { value: "2000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Compute Spreads/i }));

    await waitFor(() => {
      expect(compute).toHaveBeenCalledWith({
        couponRate: 0.0625,
        totalPeriods: 10,
        periodsPerYear: 4,
        yieldAnnual: 0.055,
        face: 2000,
      });
    });
  });

  it("renders computed spread metrics", () => {
    mutationState.data = {
      tenorYears: 5,
      govSpotRate: 0.0345,
      gSpread: 42.3,
      zSpread: 48.9,
      oas: 48.9,
    };

    render(<SpreadAnalysisPanel />);

    expect(screen.getByText(/5.0/)).toBeInTheDocument();
    expect(screen.getByText(/3.450/)).toBeInTheDocument();
    expect(screen.getAllByText(/42.3/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/48.9/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Typical IG corp spread/i)).toBeInTheDocument();
  });

  it("shows error state when computation fails", () => {
    mutationState.isError = true;
    render(<SpreadAnalysisPanel />);

    expect(screen.getByText(/Failed to compute/i)).toBeInTheDocument();
  });
});
