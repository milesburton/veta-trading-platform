import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductBuilderPanel } from "@veta/frontend/components/ProductBuilderPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "sales-1", role: "sales" };

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      auth: { user: mockUser },
    };
    return selector(state);
  },
}));

describe("ProductBuilderPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("validates target notional before saving", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ productId: "p-1", state: "draft" }), {
        status: 200,
      })
    );

    render(<ProductBuilderPanel />);

    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Name set" },
    });
    fireEvent.change(screen.getByLabelText(/Target Notional/i), {
      target: { value: "0" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    expect(
      await screen.findByText(/Target notional must be a positive number/i)
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates draft, structures, and issues a product", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/gateway/products") && init?.method === "POST") {
        return new Response(JSON.stringify({ productId: "p-42", state: "draft" }), { status: 200 });
      }
      if (url.includes("/structure") && init?.method === "PUT") {
        return new Response(JSON.stringify({ productId: "p-42", state: "structured" }), {
          status: 200,
        });
      }
      if (url.includes("/issue") && init?.method === "PUT") {
        return new Response(JSON.stringify({ productId: "p-42", state: "issued" }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ error: "unexpected request" }), {
        status: 500,
      });
    });

    render(<ProductBuilderPanel />);

    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Tech Income 2026" },
    });

    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "aapl" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    expect(await screen.findByText(/Draft product p-42 created/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Structure$/i }));
    expect(await screen.findByText(/Product structured/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Issue$/i }));
    expect(await screen.findByText(/Product issued and visible to clients/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  it("ignores invalid leg additions (empty symbol or zero weight)", () => {
    render(<ProductBuilderPanel />);
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByText(/Legs/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    // No leg added — still empty legs list
    expect(screen.getByText(/Legs/i)).toBeInTheDocument();
  });

  it("Save Draft button is disabled when name is empty", () => {
    render(<ProductBuilderPanel />);
    expect(screen.getByRole("button", { name: /Save Draft/i })).toBeDisabled();
  });

  it("handles save error gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "server error" }), { status: 500 })
    );
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Draft product/i)).not.toBeInTheDocument();
    });
  });

  it("handles structure error after successful draft save", async () => {
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      callIdx++;
      if (url.endsWith("/api/gateway/products") && init?.method === "POST") {
        return new Response(JSON.stringify({ productId: "p-1", state: "draft" }), { status: 200 });
      }
      if (url.includes("/structure") && init?.method === "PUT") {
        return new Response(JSON.stringify({ error: "structuring failed" }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await screen.findByText(/Draft product/i);

    fireEvent.click(screen.getByRole("button", { name: /^Structure$/i }));
    await screen.findByText(/structuring failed/i);
    void callIdx;
  });

  it("handles issue error after structure success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/gateway/products") && init?.method === "POST") {
        return new Response(JSON.stringify({ productId: "p-1", state: "draft" }), { status: 200 });
      }
      if (url.includes("/structure") && init?.method === "PUT") {
        return new Response(JSON.stringify({ productId: "p-1", state: "structured" }), {
          status: 200,
        });
      }
      if (url.includes("/issue") && init?.method === "PUT") {
        return new Response(JSON.stringify({ error: "issue failed" }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await screen.findByText(/Draft product/i);

    fireEvent.click(screen.getByRole("button", { name: /^Structure$/i }));
    await screen.findByText(/Product structured/i);

    fireEvent.click(screen.getByRole("button", { name: /^Issue$/i }));
    await screen.findByText(/issue failed/i);
  });

  it("warns when total weight is not 100%", () => {
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByText(/must equal 100%/i)).toBeInTheDocument();
  });

  it("ignores leg additions with NaN weight", () => {
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.queryByText(/AAPL/)).not.toBeInTheDocument();
  });

  it("removes a leg via the remove button", () => {
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByText("AAPL")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/Remove leg/i));
    expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
  });

  it("clears feedback after the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "server error" }), { status: 500 })
      );
      render(<ProductBuilderPanel />);
      fireEvent.change(screen.getByLabelText(/Target Notional/i), {
        target: { value: "0" },
      });
      fireEvent.change(screen.getByLabelText(/Product Name/i), {
        target: { value: "Test" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
      expect(screen.getByText(/Target notional must be a positive number/i)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(
        screen.queryByText(/Target notional must be a positive number/i)
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates legs on an already-saved product", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/gateway/products") && init?.method === "POST") {
        return new Response(JSON.stringify({ productId: "p-7", state: "draft" }), { status: 200 });
      }
      if (url.includes("/p-7/legs") && init?.method === "PUT") {
        return new Response(JSON.stringify({ productId: "p-7", state: "draft" }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Reusable" },
    });
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await screen.findByText(/Draft product p-7 created/i);

    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    expect(await screen.findByText(/Legs updated/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("updates the description field", () => {
    render(<ProductBuilderPanel />);
    const desc = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: "A growth basket" } });
    expect(desc.value).toBe("A growth basket");
  });

  it("changes the leg type via the select", () => {
    render(<ProductBuilderPanel />);
    const select = screen.getByLabelText(/^Type$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "bond" } });
    expect(select.value).toBe("bond");

    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "T-BILL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByText("BOND")).toBeInTheDocument();
  });

  it("adds a leg when pressing Enter in the symbol field", () => {
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    const symbol = screen.getByLabelText(/^Symbol$/i);
    fireEvent.change(symbol, { target: { value: "MSFT" } });
    fireEvent.keyDown(symbol, { key: "Enter" });
    expect(screen.getByText("MSFT")).toBeInTheDocument();
  });

  it("adds a leg when pressing Enter in the weight field", () => {
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "NVDA" },
    });
    const weight = screen.getByLabelText(/Weight %/i);
    fireEvent.change(weight, { target: { value: "100" } });
    fireEvent.keyDown(weight, { key: "Enter" });
    expect(screen.getByText("NVDA")).toBeInTheDocument();
  });

  it("handles network error during save", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    render(<ProductBuilderPanel />);
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/^Symbol$/i), {
      target: { value: "AAPL" },
    });
    fireEvent.change(screen.getByLabelText(/Weight %/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    await screen.findByText(/network down/);
  });
});
