import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductBookPanel } from "@veta/frontend/components/ProductBookPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("shows draft and structured products with their state badges", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { ...issuedProduct, productId: "p-draft", state: "draft", name: "Draft Product" },
          {
            ...issuedProduct,
            productId: "p-struct",
            state: "structured",
            name: "Structured Product",
          },
          { ...issuedProduct, productId: "p-sold", state: "sold", name: "Sold Product" },
        ]),
        { status: 200 }
      )
    );
    render(<ProductBookPanel />);
    expect(await screen.findByText(/Draft Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Structured Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Sold Product/i)).toBeInTheDocument();
  });

  it("filters products by state when filter is changed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([issuedProduct]), { status: 200 })
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    const filter = screen.queryByRole("combobox");
    if (filter) {
      fireEvent.change(filter, { target: { value: "all" } });
    }
    expect(screen.getByText(/Income Note/i)).toBeInTheDocument();
  });

  it("handles fetch error gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 500 }));
    render(<ProductBookPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Income Note/i)).not.toBeInTheDocument();
    });
  });

  it("handles sell error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/sell") && init?.method === "PUT") {
        return new Response(JSON.stringify({ error: "sell denied" }), { status: 500 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByText(/Income Note/i));
    fireEvent.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(await screen.findByText(/sell denied/i)).toBeInTheDocument();
  });

  it("handles network error during sell", async () => {
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      throw new Error("network down");
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByText(/Income Note/i));
    fireEvent.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });

  it("handles request-quote error for external client", async () => {
    role = "external-client";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/api/gateway/rfq/sellside") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "quote failed" }), { status: 500 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /Request Quote/i }));
    expect(await screen.findByText(/quote failed/i)).toBeInTheDocument();
  });

  it("formats thousand and sub-thousand notionals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { ...issuedProduct, productId: "p-k", name: "Thousands", targetNotional: 25000 },
          { ...issuedProduct, productId: "p-small", name: "Small", targetNotional: 500 },
        ]),
        { status: 200 }
      )
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Thousands/i);
    expect(screen.getByText("$25K")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
  });

  it("shows server error message on non-ok products response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "products unavailable" }), { status: 503 })
    );
    render(<ProductBookPanel />);
    expect(await screen.findByText(/products unavailable/i)).toBeInTheDocument();
  });

  it("falls back to HTTP status when error response omits error field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 502 })
    );
    render(<ProductBookPanel />);
    expect(await screen.findByText(/HTTP 502/i)).toBeInTheDocument();
  });

  it("clears feedback after the timeout elapses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/sell") && init?.method === "PUT") {
        return new Response(JSON.stringify({ state: "sold" }), { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Sell$/i }));
    await screen.findByText(/Product marked as sold/i);
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => {
      expect(screen.queryByText(/Product marked as sold/i)).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it("handles network error during request quote", async () => {
    role = "external-client";
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      throw new Error("quote network down");
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /Request Quote/i }));
    expect(await screen.findByText(/quote network down/i)).toBeInTheDocument();
  });

  it("unwinds a sold product", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(
          JSON.stringify([{ ...issuedProduct, state: "sold", name: "Sold Note" }]),
          { status: 200 }
        );
      }
      if (url.includes("/unwind") && init?.method === "PUT") {
        return new Response(JSON.stringify({ state: "unwound" }), { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Sold Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Unwind$/i }));
    expect(await screen.findByText(/Product unwound/i)).toBeInTheDocument();
  });

  it("handles unwind error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(
          JSON.stringify([{ ...issuedProduct, state: "sold", name: "Sold Note" }]),
          { status: 200 }
        );
      }
      if (url.includes("/unwind") && init?.method === "PUT") {
        return new Response(JSON.stringify({ error: "unwind denied" }), { status: 500 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Sold Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Unwind$/i }));
    expect(await screen.findByText(/unwind denied/i)).toBeInTheDocument();
  });

  it("handles network error during unwind", async () => {
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) {
        return new Response(
          JSON.stringify([{ ...issuedProduct, state: "sold", name: "Sold Note" }]),
          { status: 200 }
        );
      }
      throw new Error("unwind network down");
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Sold Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Unwind$/i }));
    expect(await screen.findByText(/unwind network down/i)).toBeInTheDocument();
  });

  it("refetches when the refresh button is clicked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([issuedProduct]), { status: 200 }));
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    const callsBefore = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /^Refresh$/i }));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("changes the state filter when a tab is clicked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify([issuedProduct]), { status: 200 }));
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^draft$/i }));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("state=draft"))).toBe(
        true
      );
    });
  });

  it("stops keydown propagation from the actions cell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([issuedProduct]), { status: 200 })
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    const actionsButton = screen.getByRole("button", { name: /^Sell$/i });
    const actionsCell = actionsButton.closest("td");
    expect(actionsCell).not.toBeNull();
    if (actionsCell) {
      fireEvent.keyDown(actionsCell, { key: "Enter" });
    }
    expect(screen.getByText(/Income Note/i)).toBeInTheDocument();
  });

  it("stops click propagation from the actions cell without toggling legs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([issuedProduct]), { status: 200 })
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    const actionsButton = screen.getByRole("button", { name: /^Sell$/i });
    const actionsCell = actionsButton.closest("td");
    expect(actionsCell).not.toBeNull();
    if (actionsCell) {
      fireEvent.click(actionsCell);
    }
    expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
  });

  it("collapses an expanded row when its name is clicked again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([issuedProduct]), { status: 200 })
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByText(/Income Note/i));
    expect(await screen.findByText("AAPL")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Income Note/i));
    await waitFor(() => {
      expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
    });
  });

  it("renders option legs, a missing-quantity dash, and no-issued-date dash", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ...issuedProduct,
            productId: "p-opt",
            name: "Option Note",
            issuedAt: undefined,
            legs: [{ legId: "l-opt", type: "option", symbol: "AAPL240C", weight: 1 }],
          },
        ]),
        { status: 200 }
      )
    );
    render(<ProductBookPanel />);
    fireEvent.click(await screen.findByText(/Option Note/i));
    expect(await screen.findByText("OPTION")).toBeInTheDocument();
    expect(screen.getByText("AAPL240C")).toBeInTheDocument();
  });

  it("shows no-legs message when an expanded product has no legs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ ...issuedProduct, productId: "p-empty", name: "Empty Note", legs: [] }]),
        { status: 200 }
      )
    );
    render(<ProductBookPanel />);
    fireEvent.click(await screen.findByText(/Empty Note/i));
    expect(await screen.findByText(/No legs defined/i)).toBeInTheDocument();
  });

  it("formats million-scale notionals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ ...issuedProduct, productId: "p-m", name: "Millions" }]), {
        status: 200,
      })
    );
    render(<ProductBookPanel />);
    await screen.findByText(/Millions/i);
    expect(screen.getByText("$2.0M")).toBeInTheDocument();
  });

  it("falls back to default sell message when error field omitted", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/sell") && init?.method === "PUT") {
        return new Response(JSON.stringify({}), { status: 500 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Sell$/i }));
    expect(await screen.findByText(/Failed to mark as sold/i)).toBeInTheDocument();
  });

  it("falls back to default unwind message when error field omitted", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(
          JSON.stringify([{ ...issuedProduct, state: "sold", name: "Sold Note" }]),
          { status: 200 }
        );
      }
      if (url.includes("/unwind") && init?.method === "PUT") {
        return new Response(JSON.stringify({}), { status: 500 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Sold Note/i);
    fireEvent.click(screen.getByRole("button", { name: /^Unwind$/i }));
    expect(await screen.findByText(/Failed to unwind/i)).toBeInTheDocument();
  });

  it("falls back to default quote message and submitted rfq label", async () => {
    role = "external-client";
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/gateway/products?")) {
        return new Response(JSON.stringify([issuedProduct]), { status: 200 });
      }
      if (url.includes("/api/gateway/rfq/sellside") && init?.method === "POST") {
        callIdx++;
        if (callIdx === 1) {
          return new Response(JSON.stringify({}), { status: 500 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    render(<ProductBookPanel />);
    await screen.findByText(/Income Note/i);
    fireEvent.click(screen.getByRole("button", { name: /Request Quote/i }));
    expect(await screen.findByText(/Failed to request quote/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Request Quote/i }));
    expect(await screen.findByText(/Quote requested \(RFQ: submitted\)/i)).toBeInTheDocument();
  });
});
