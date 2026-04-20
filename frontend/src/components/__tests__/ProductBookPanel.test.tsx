import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductBookPanel } from "../ProductBookPanel";

let role = "sales";

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      auth: { user: { id: "u-1", role } },
    };
    return selector(state);
  },
}));

const issuedProduct = {
  productId: "prd-1",
  name: "Income Note",
  description: "desc",
  state: "issued",
  legs: [
    { legId: "l-1", type: "equity", symbol: "AAPL", weight: 0.6, quantity: 10 },
    { legId: "l-2", type: "bond", symbol: "UST10Y", weight: 0.4, quantity: 5 },
  ],
  targetNotional: 2000000,
  currency: "USD",
  createdBy: "sales-1",
  issuedAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("ProductBookPanel", () => {
  beforeEach(() => {
    role = "sales";
    vi.restoreAllMocks();
  });

  it("loads products, expands legs, and sells an issued product", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/sell") && init?.method === "PUT") {
        return new Response(JSON.stringify({ state: "sold" }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ error: "unexpected request" }), {
        status: 500,
      });
    });

    render(<ProductBookPanel />);

    expect(await screen.findByText(/Income Note/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Income Note/i));
    expect(await screen.findByText("AAPL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(await screen.findByText(/Product marked as sold/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  it("shows request quote action for external client", async () => {
    role = "external-client";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/api/gateway/rfq/sellside") && init?.method === "POST") {
        return new Response(JSON.stringify({ rfqId: "rfq-9" }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ error: "unexpected request" }), {
        status: 500,
      });
    });

    render(<ProductBookPanel />);

    expect(await screen.findByText(/Income Note/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Request Quote/i }));

    expect(await screen.findByText(/Quote requested \(RFQ: rfq-9\)/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
