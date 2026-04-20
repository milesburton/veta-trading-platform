import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductBuilderPanel } from "../ProductBuilderPanel";

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
});
