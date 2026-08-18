import { render, screen } from "@testing-library/react";
import { WorldClocksPanel } from "@veta/frontend/components/WorldClocksPanel";
import { FINANCIAL_CENTERS } from "@veta/frontend/domain/market/financialCenters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("WorldClocksPanel", () => {
  it("renders the panel header", () => {
    render(<WorldClocksPanel />);
    expect(screen.getByText("World Clocks")).toBeInTheDocument();
  });

  it("renders one row per financial centre", () => {
    render(<WorldClocksPanel />);
    for (const center of FINANCIAL_CENTERS) {
      expect(screen.getByTestId(`clock-${center.id}`)).toBeInTheDocument();
      expect(screen.getByText(center.label)).toBeInTheDocument();
    }
  });
});

describe("WorldClocksPanel — session badges", () => {
  beforeEach(() => {
    // Wednesday 2026-08-05 14:00 UTC = 10:00 America/New_York (open), 23:00 Asia/Tokyo (closed)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T14:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Open for a centre currently in its trading session", () => {
    render(<WorldClocksPanel />);
    const nyc = screen.getByTestId("clock-NYC");
    expect(nyc).toHaveTextContent("Open");
  });

  it("shows Closed for a centre outside its trading session", () => {
    render(<WorldClocksPanel />);
    const tyo = screen.getByTestId("clock-TYO");
    expect(tyo).toHaveTextContent("Closed");
  });
});
