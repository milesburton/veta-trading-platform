import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DurationLadderPanel } from "../DurationLadderPanel";

const compute = vi.fn();

const mutationState: {
  data:
    | {
        positions: Array<{
          bondIndex: number;
          totalDv01: number;
          modifiedDuration: number;
          contributions: Array<{
            bondIndex: number;
            tenorLabel: string;
            dv01Contribution: number;
          }>;
        }>;
        buckets: Array<{
          tenorLabel: string;
          tenorYears: number;
          netDv01: number;
        }>;
        totalPortfolioDv01: number;
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
  useGetDurationLadderMutation: () => [compute, mutationState],
}));

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

  return {
    ResponsiveContainer: MockContainer,
    BarChart: MockContainer,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={dataKey} />,
  };
});

describe("DurationLadderPanel", () => {
  beforeEach(() => {
    compute.mockReset();
    mutationState.data = undefined;
    mutationState.isLoading = false;
    mutationState.isError = false;
  });

  it("submits normalized bond positions from the table inputs", () => {
    render(<DurationLadderPanel />);

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "1500" } });
    fireEvent.change(inputs[1], { target: { value: "5.25" } });
    fireEvent.change(inputs[4], { target: { value: "12" } });

    fireEvent.click(screen.getByRole("button", { name: /Compute Ladder/i }));

    expect(compute).toHaveBeenCalledTimes(1);

    const payload = compute.mock.calls[0][0] as {
      positions: Array<{
        faceValue: number;
        couponRate: number;
        totalPeriods: number;
        periodsPerYear: number;
        yieldAnnual: number;
        quantity: number;
      }>;
    };

    expect(payload.positions).toHaveLength(5);
    expect(payload.positions[0].faceValue).toBe(1500);
    expect(payload.positions[0].couponRate).toBeCloseTo(0.0525);
    expect(payload.positions[0].totalPeriods).toBe(4);
    expect(payload.positions[0].periodsPerYear).toBe(2);
    expect(payload.positions[0].yieldAnnual).toBeCloseTo(0.0488);
    expect(payload.positions[0].quantity).toBe(12);
    expect(payload.positions[3].couponRate).toBeCloseTo(0.054);
    expect(payload.positions[3].quantity).toBe(-3);
    expect(payload.positions[4].yieldAnnual).toBeCloseTo(0.0468);
  });

  it("shows loading and error states from the analytics mutation", () => {
    mutationState.isLoading = true;
    mutationState.isError = true;

    render(<DurationLadderPanel />);

    expect(screen.getByRole("button", { name: /Computing/i })).toBeDisabled();
    expect(screen.getByText(/Failed to compute — check analytics service/i)).toBeInTheDocument();
  });

  it("renders the computed portfolio summary and tenor ladder", () => {
    mutationState.data = {
      positions: [
        {
          bondIndex: 0,
          totalDv01: 1.2345,
          modifiedDuration: 4.2,
          contributions: [
            { bondIndex: 0, tenorLabel: "1y", dv01Contribution: 0.25 },
            { bondIndex: 0, tenorLabel: "5y", dv01Contribution: -0.5 },
          ],
        },
      ],
      buckets: [
        { tenorLabel: "1y", tenorYears: 1, netDv01: 0.25 },
        { tenorLabel: "5y", tenorYears: 5, netDv01: -0.5 },
      ],
      totalPortfolioDv01: -12.3456,
    };

    render(<DurationLadderPanel />);

    expect(screen.getByText(/Portfolio DV01/i)).toBeInTheDocument();
    expect(screen.getByText("$12.35")).toBeInTheDocument();
    expect(screen.getAllByText(/short/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1y").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5y").length).toBeGreaterThan(0);
    expect(screen.getByText(/▲ long/i)).toBeInTheDocument();
    expect(screen.getByText(/▼ short/i)).toBeInTheDocument();
  });
});
