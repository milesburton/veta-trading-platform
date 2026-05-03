import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrawersProvider, useDrawers } from "../DrawersContext";

function Probe() {
  const { open, close, toggle, openDrawers, isOpen, positionOf, closeAll } = useDrawers();
  return (
    <div>
      <div data-testid="state">{openDrawers.join(",")}</div>
      <div data-testid="alerts-pos">{positionOf("alerts")}</div>
      <div data-testid="data-depth-pos">{positionOf("data-depth")}</div>
      <div data-testid="alerts-open">{String(isOpen("alerts"))}</div>
      <button type="button" data-testid="open-alerts" onClick={() => open("alerts")}>
        open
      </button>
      <button type="button" data-testid="open-data-depth" onClick={() => open("data-depth")}>
        open dd
      </button>
      <button type="button" data-testid="close-alerts" onClick={() => close("alerts")}>
        close
      </button>
      <button type="button" data-testid="toggle-alerts" onClick={() => toggle("alerts")}>
        toggle
      </button>
      <button type="button" data-testid="close-all" onClick={() => closeAll()}>
        close all
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <DrawersProvider>
      <Probe />
    </DrawersProvider>
  );
}

describe("DrawersContext", () => {
  it("opens drawer and tracks position 0", () => {
    renderProbe();
    act(() => {
      screen.getByTestId("open-alerts").click();
    });
    expect(screen.getByTestId("state").textContent).toBe("alerts");
    expect(screen.getByTestId("alerts-pos").textContent).toBe("0");
    expect(screen.getByTestId("alerts-open").textContent).toBe("true");
  });

  it("stacks newest-first; second drawer becomes position 0, first moves to 1", () => {
    renderProbe();
    act(() => screen.getByTestId("open-alerts").click());
    act(() => screen.getByTestId("open-data-depth").click());
    expect(screen.getByTestId("state").textContent).toBe("data-depth,alerts");
    expect(screen.getByTestId("data-depth-pos").textContent).toBe("0");
    expect(screen.getByTestId("alerts-pos").textContent).toBe("1");
  });

  it("re-opening an already-open drawer is a no-op", () => {
    renderProbe();
    act(() => screen.getByTestId("open-alerts").click());
    act(() => screen.getByTestId("open-alerts").click());
    expect(screen.getByTestId("state").textContent).toBe("alerts");
  });

  it("close removes the drawer", () => {
    renderProbe();
    act(() => screen.getByTestId("open-alerts").click());
    act(() => screen.getByTestId("close-alerts").click());
    expect(screen.getByTestId("state").textContent).toBe("");
    expect(screen.getByTestId("alerts-pos").textContent).toBe("-1");
  });

  it("toggle opens then closes", () => {
    renderProbe();
    act(() => screen.getByTestId("toggle-alerts").click());
    expect(screen.getByTestId("alerts-open").textContent).toBe("true");
    act(() => screen.getByTestId("toggle-alerts").click());
    expect(screen.getByTestId("alerts-open").textContent).toBe("false");
  });

  it("closeAll empties the stack", () => {
    renderProbe();
    act(() => screen.getByTestId("open-alerts").click());
    act(() => screen.getByTestId("open-data-depth").click());
    act(() => screen.getByTestId("close-all").click());
    expect(screen.getByTestId("state").textContent).toBe("");
  });
});
