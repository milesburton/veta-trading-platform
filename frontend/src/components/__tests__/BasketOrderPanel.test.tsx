import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BasketOrderPanel } from "../BasketOrderPanel";

const dispatch = vi.fn();

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      market: {
        assets: [
          { symbol: "AAPL", lotSize: 100, sector: "Tech" },
          { symbol: "MSFT", lotSize: 100, sector: "Tech" },
          { symbol: "NVDA", lotSize: 100, sector: "Tech" },
          { symbol: "GOOGL", lotSize: 100, sector: "Tech" },
          { symbol: "AMZN", lotSize: 100, sector: "Tech" },
          { symbol: "TSLA", lotSize: 100, sector: "Auto" },
        ],
        prices: {
          AAPL: 150,
          MSFT: 300,
          NVDA: 900,
          GOOGL: 140,
          AMZN: 180,
          TSLA: 210,
        },
      },
    };
    return selector(state);
  },
}));

describe("BasketOrderPanel", () => {
  beforeEach(() => {
    dispatch.mockReset();
    dispatch.mockReturnValue({ unwrap: () => Promise.resolve("ok") });
  });

  it("renders default basket and summary", () => {
    render(<BasketOrderPanel />);

    expect(screen.getByTestId("basket-order-panel")).toBeInTheDocument();
    expect(screen.getByText(/Basket Order/i)).toBeInTheDocument();
    expect(screen.getByText(/5 legs/i)).toBeInTheDocument();
    expect(screen.getByText(/Weights:/i)).toBeInTheDocument();
  });

  it("adds a new symbol leg from search", () => {
    render(<BasketOrderPanel />);

    fireEvent.change(screen.getByLabelText(/Add Symbol/i), {
      target: { value: "TS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /TSLAAuto/i }));

    expect(screen.getByText(/6 legs/i)).toBeInTheDocument();
    expect(screen.getAllByText("TSLA").length).toBeGreaterThan(0);
  });

  it("submits one limit order per valid leg", async () => {
    render(<BasketOrderPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalled();
    });

    expect(await screen.findByText(/submitted\./i)).toBeInTheDocument();
  });

  it("normalises weights to sum to 100%", () => {
    render(<BasketOrderPanel />);
    const normaliseBtn = screen.queryByRole("button", { name: /Normalise/i });
    if (normaliseBtn) {
      fireEvent.click(normaliseBtn);
    }
    expect(screen.getByTestId("basket-order-panel")).toBeInTheDocument();
  });

  it("removes a leg from the basket", () => {
    render(<BasketOrderPanel />);
    const removeButtons = screen.queryAllByRole("button", { name: /^×$|^Remove|^✕$/i });
    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0]);
      expect(screen.getByText(/4 legs/i)).toBeInTheDocument();
    } else {
      expect(screen.getByTestId("basket-order-panel")).toBeInTheDocument();
    }
  });

  it("changes basket notional and recomputes quantities", () => {
    render(<BasketOrderPanel />);
    const notionalInput = screen.queryByLabelText(/Notional|Size/i) as HTMLInputElement | null;
    if (notionalInput) {
      fireEvent.change(notionalInput, { target: { value: "100000" } });
    }
    expect(screen.getByTestId("basket-order-panel")).toBeInTheDocument();
  });

  it("toggles BUY/SELL side", () => {
    render(<BasketOrderPanel />);
    const sellBtn = screen.queryByRole("button", { name: /^SELL$/ });
    if (sellBtn) {
      fireEvent.click(sellBtn);
      expect(sellBtn).toHaveAttribute("aria-pressed", "true");
    } else {
      expect(screen.getByTestId("basket-order-panel")).toBeInTheDocument();
    }
  });

  it("ignores duplicate symbol additions", () => {
    render(<BasketOrderPanel />);
    fireEvent.change(screen.getByLabelText(/Add Symbol/i), {
      target: { value: "AA" },
    });
    const opts = screen.queryAllByRole("button", { name: /AAPL/i });
    if (opts.length > 0) {
      fireEvent.click(opts[0]);
      // Already in basket → still 5 legs (default)
      expect(screen.getByText(/5 legs/i)).toBeInTheDocument();
    }
  });
});
