import { render, screen } from "@testing-library/react";
import { MarketHoursModeBadge } from "@veta/frontend/components/MarketHoursModeBadge";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryResult = vi.fn();

vi.mock("../../store/gatewayApi.ts", () => ({
  useGetMarketHoursModeQuery: () => queryResult(),
}));

function entry(allowOutOfHoursOverride: boolean) {
  return { calendarLabel: "XNAS", isOpen: false, phase: "Market Closed", allowOutOfHoursOverride };
}

function assetClasses(override: boolean) {
  return {
    equity: entry(override),
    fx: entry(override),
    commodity: entry(override),
    bond: entry(override),
  };
}

describe("MarketHoursModeBadge", () => {
  beforeEach(() => queryResult.mockReset());

  it("renders nothing until the market-hours mode has loaded", () => {
    queryResult.mockReturnValue({ data: undefined });
    render(<MarketHoursModeBadge />);
    expect(screen.queryByTestId("market-hours-mode-badge")).toBeNull();
  });

  it("labels the header with simulated hours when markets tick around the clock", () => {
    queryResult.mockReturnValue({ data: { assetClasses: assetClasses(true) } });
    render(<MarketHoursModeBadge />);
    const badge = screen.getByTestId("market-hours-mode-badge");
    expect(badge).toHaveTextContent("Simulated hours");
    expect(badge.getAttribute("title")).toContain("Equities (XNAS): real session closed");
  });

  it("labels the header with real hours when every asset class follows its calendar", () => {
    queryResult.mockReturnValue({ data: { assetClasses: assetClasses(false) } });
    render(<MarketHoursModeBadge />);
    expect(screen.getByTestId("market-hours-mode-badge")).toHaveTextContent("Real hours");
  });
});
