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
});
