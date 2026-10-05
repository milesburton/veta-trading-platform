import { fireEvent, render, screen } from "@testing-library/react";
import { MarketHoursModeSwitch } from "@veta/frontend/components/MarketHoursModeSwitch";
import type { MarketHoursConfig } from "@veta/frontend/store/gatewayApi.ts";
import { describe, expect, it, vi } from "vitest";

function config(equity: boolean, rest: boolean): MarketHoursConfig {
  const entry = (allowOutOfHoursOverride: boolean) => ({
    calendarLabel: "XNAS",
    isOpen: false,
    phase: "Market Closed",
    allowOutOfHoursOverride,
  });
  return {
    assetClasses: {
      equity: entry(equity),
      fx: entry(rest),
      commodity: entry(rest),
      bond: entry(rest),
    },
  };
}

describe("MarketHoursModeSwitch", () => {
  it("marks real hours as active when no asset class is simulated", () => {
    render(
      <MarketHoursModeSwitch config={config(false, false)} disabled={false} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Real hours" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Simulated 24/7" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("shows neither option active when asset classes differ, and either can be chosen", () => {
    const onChange = vi.fn();
    render(
      <MarketHoursModeSwitch config={config(false, true)} disabled={false} onChange={onChange} />
    );
    expect(screen.getByText(/set individually/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulated 24/7" }));
    fireEvent.click(screen.getByRole("button", { name: "Real hours" }));
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("disables both options while disabled or before the config loads", () => {
    const { rerender } = render(
      <MarketHoursModeSwitch config={config(false, true)} disabled onChange={vi.fn()} />
    );
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    rerender(<MarketHoursModeSwitch config={undefined} disabled={false} onChange={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });
});
