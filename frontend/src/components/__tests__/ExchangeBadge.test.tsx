import { render, screen } from "@testing-library/react";
import { ExchangeBadge } from "@veta/frontend/components/ExchangeBadge";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryResult = vi.fn();
let signedIn = true;

vi.mock("../../store/gatewayApi.ts", () => ({
  useGetMarketHoursModeQuery: (arg: unknown, options: unknown) => queryResult(arg, options),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      auth: { user: signedIn ? { id: "u-1" } : null },
      market: {
        assets: [
          { symbol: "AAPL", exchange: "XNAS", assetClass: "equity" },
          { symbol: "CL", exchange: "XNYM", assetClass: "commodity" },
        ],
      },
    }),
}));

function session(isOpen: boolean, phase: string) {
  return { calendarLabel: "XNYS", isOpen, phase, allowOutOfHoursOverride: false };
}

const hours = {
  assetClasses: {
    equity: session(true, "Continuous Trading"),
    fx: session(true, "Open"),
    commodity: session(false, "Market Closed"),
    bond: session(true, "Open"),
  },
};

describe("ExchangeBadge", () => {
  beforeEach(() => {
    queryResult.mockReset();
    signedIn = true;
  });

  it("shows the exchange without strike-through while its market is open", () => {
    queryResult.mockReturnValue({ data: hours });
    render(<ExchangeBadge symbol="AAPL" />);
    const badge = screen.getByTestId("exchange-badge-AAPL");
    expect(badge).toHaveTextContent("NASDAQ");
    expect(badge).toHaveAttribute("data-state", "open");
    expect(badge.className).not.toContain("line-through");
  });

  it("strikes the exchange through while its market is closed", () => {
    queryResult.mockReturnValue({ data: hours });
    render(<ExchangeBadge symbol="CL" />);
    const badge = screen.getByTestId("exchange-badge-CL");
    expect(badge).toHaveTextContent("NYMEX");
    expect(badge).toHaveAttribute("data-state", "closed");
    expect(badge.className).toContain("line-through");
    expect(badge.getAttribute("title")).toContain("Market Closed");
  });

  it("renders nothing for an unknown symbol or before hours load", () => {
    queryResult.mockReturnValue({ data: undefined });
    const { container } = render(<ExchangeBadge symbol="AAPL" />);
    expect(container).toBeEmptyDOMElement();
    queryResult.mockReturnValue({ data: hours });
    render(<ExchangeBadge symbol="ZZZ" />);
    expect(screen.queryByTestId("exchange-badge-ZZZ")).toBeNull();
  });

  it("does not poll market hours when signed out", () => {
    signedIn = false;
    queryResult.mockReturnValue({ data: undefined });
    render(<ExchangeBadge symbol="AAPL" />);
    expect(queryResult).toHaveBeenCalledWith(undefined, expect.objectContaining({ skip: true }));
  });
});
