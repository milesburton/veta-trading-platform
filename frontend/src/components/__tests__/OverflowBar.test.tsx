import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverflowBar } from "../OverflowBar.tsx";

function stubWidths(itemWidth: number, containerWidth: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute("data-testid") === "bar" ? containerWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute("data-ov-item") ? itemWidth : 0;
    },
  });
}

afterEach(() => {
  // @ts-expect-error remove patched accessor
  delete HTMLElement.prototype.clientWidth;
  // @ts-expect-error remove patched accessor
  delete HTMLElement.prototype.offsetWidth;
});

describe("OverflowBar", () => {
  it("renders all children inline when they fit", () => {
    stubWidths(50, 1000);
    render(
      <OverflowBar testId="bar">
        <button type="button">One</button>
        <button type="button">Two</button>
      </OverflowBar>
    );
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-burger")).not.toBeInTheDocument();
  });

  it("collapses overflowing children into a burger", () => {
    stubWidths(100, 150);
    render(
      <OverflowBar testId="bar">
        <span>A</span>
        <span>B</span>
        <span>C</span>
      </OverflowBar>
    );
    const burger = screen.getByTestId("bar-burger");
    expect(burger).toBeInTheDocument();
    expect(burger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the burger menu on click and closes on Escape", () => {
    stubWidths(100, 50);
    render(
      <OverflowBar testId="bar" menuLabel="More controls">
        <span>A</span>
        <span>B</span>
      </OverflowBar>
    );
    fireEvent.click(screen.getByTestId("bar-burger"));
    expect(screen.getByRole("menu", { name: "More controls" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "More controls" })).not.toBeInTheDocument();
  });
});
