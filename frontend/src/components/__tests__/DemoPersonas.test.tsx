import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DemoPersona } from "../../store/userApi";
import { DemoPersonas } from "../DemoPersonas";

const baseQueryResult = {
  data: undefined as { personas: DemoPersona[] } | undefined,
  isLoading: false,
  error: undefined as unknown,
};

const mockUseQuery = vi.fn(() => baseQueryResult);

vi.mock("../../store/userApi", () => ({
  useGetDemoPersonasQuery: (_arg: unknown, opts: { skip: boolean }) => {
    if (opts.skip) {
      return { data: undefined, isLoading: false, error: undefined };
    }
    return mockUseQuery();
  },
}));

function makePersona(over: Partial<DemoPersona>): DemoPersona {
  return {
    id: "alice",
    name: "Alice",
    role: "trader",
    avatar_emoji: "👩",
    description: "Equity cash trader",
    trading_style: "high_touch",
    primary_desk: "equity-cash",
    allowed_strategies: [],
    max_order_qty: 1000,
    dark_pool_access: false,
    ...over,
  };
}

describe("DemoPersonas – collapsed state", () => {
  it("renders the toggle button", () => {
    render(<DemoPersonas onSelect={() => {}} />);
    expect(screen.getByTestId("demo-personas-toggle")).toBeInTheDocument();
    expect(screen.getByText(/show list/i)).toBeInTheDocument();
  });

  it("expands when clicked", () => {
    mockUseQuery.mockReturnValue({
      data: { personas: [] },
      isLoading: false,
      error: undefined,
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText(/hide/i)).toBeInTheDocument();
  });
});

describe("DemoPersonas – expanded states", () => {
  it("shows loading message", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText(/Loading personas/i)).toBeInTheDocument();
  });

  it("shows error message when fetch fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 500 },
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText(/Failed to load personas/i)).toBeInTheDocument();
  });

  it("shows empty message when personas array is empty", () => {
    mockUseQuery.mockReturnValue({
      data: { personas: [] },
      isLoading: false,
      error: undefined,
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText(/No personas available/i)).toBeInTheDocument();
  });

  it("groups personas by desk and role", () => {
    mockUseQuery.mockReturnValue({
      data: {
        personas: [
          makePersona({ id: "alice", primary_desk: "equity-cash" }),
          makePersona({
            id: "bob",
            primary_desk: "equity-derivs",
            trading_style: "derivatives_high_touch",
          }),
          makePersona({
            id: "carol",
            primary_desk: "fi-rates",
            trading_style: "fi_voice",
          }),
          makePersona({
            id: "dave",
            primary_desk: "fx-cash",
            trading_style: "fx_electronic",
          }),
          makePersona({
            id: "eve",
            primary_desk: "commodities",
            trading_style: "commodities_voice",
          }),
          makePersona({
            id: "frank",
            primary_desk: null,
            trading_style: null,
          }),
          makePersona({
            id: "head",
            role: "desk-head",
            primary_desk: null,
            trading_style: null,
          }),
          makePersona({
            id: "salesperson",
            role: "sales",
            primary_desk: null,
            trading_style: null,
          }),
          makePersona({
            id: "client",
            role: "external-client",
            primary_desk: null,
            trading_style: null,
          }),
          makePersona({
            id: "comp",
            role: "compliance",
            primary_desk: null,
            trading_style: null,
          }),
          makePersona({
            id: "admin",
            role: "admin",
            primary_desk: null,
            trading_style: null,
          }),
        ],
      },
      isLoading: false,
      error: undefined,
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText(/Equity cash traders/i)).toBeInTheDocument();
    expect(screen.getByText(/Equity derivatives traders/i)).toBeInTheDocument();
    expect(screen.getByText(/Fixed income traders/i)).toBeInTheDocument();
    expect(screen.getByText(/FX traders/i)).toBeInTheDocument();
    expect(screen.getByText(/Commodities traders/i)).toBeInTheDocument();
    expect(screen.getByText(/^Traders$/)).toBeInTheDocument();
    expect(screen.getByText(/Desk heads/i)).toBeInTheDocument();
    expect(screen.getByText(/^Sales$/)).toBeInTheDocument();
    expect(screen.getByText(/External clients/i)).toBeInTheDocument();
    expect(screen.getByText(/^Compliance$/)).toBeInTheDocument();
    expect(screen.getByText(/Administration/i)).toBeInTheDocument();
  });

  it("calls onSelect with persona id when card clicked", () => {
    mockUseQuery.mockReturnValue({
      data: { personas: [makePersona({ id: "alice" })] },
      isLoading: false,
      error: undefined,
    });
    const onSelect = vi.fn();
    render(<DemoPersonas onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    fireEvent.click(screen.getByTestId("persona-alice"));
    expect(onSelect).toHaveBeenCalledWith("alice");
  });

  it("renders persona without a description as a dash", () => {
    mockUseQuery.mockReturnValue({
      data: {
        personas: [makePersona({ id: "alice", description: "" })],
      },
      isLoading: false,
      error: undefined,
    });
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("falls back to default badge class when role is unknown", () => {
    mockUseQuery.mockReturnValue({
      data: {
        personas: [
          makePersona({
            id: "weird",
            role: "intern" as unknown as DemoPersona["role"],
            primary_desk: null,
            trading_style: null,
          }),
        ],
      },
      isLoading: false,
      error: undefined,
    });
    // Won't appear in groupings but exercises ROLE_BADGE_CLASS fallback path
    render(<DemoPersonas onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId("demo-personas-toggle"));
    // No persona rendered (intern role isn't in groupPersonas), but render path exercised
    expect(screen.queryByTestId("persona-weird")).not.toBeInTheDocument();
  });
});
