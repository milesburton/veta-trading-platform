import { describe, expect, it } from "vitest";
import { tooltipPosition } from "../Tooltip";

describe("tooltipPosition", () => {
  it("places tooltip to the right + below cursor when it fits", () => {
    const pos = tooltipPosition(100, 100, 800, 600, 160, 130);
    expect(pos).toEqual({ left: 112, top: 112, width: 160 });
  });

  it("flips horizontally when tooltip would overflow the right edge", () => {
    const pos = tooltipPosition(750, 100, 800, 600, 160, 130);
    expect(pos.left).toBe(750 - 160 - 12);
  });

  it("flips vertically when tooltip would overflow the bottom edge", () => {
    const pos = tooltipPosition(100, 550, 800, 600, 160, 130);
    expect(pos.top).toBe(550 - 130 - 12);
  });

  it("uses custom offset when provided", () => {
    const pos = tooltipPosition(100, 100, 800, 600, 160, 130, 20);
    expect(pos.left).toBe(120);
    expect(pos.top).toBe(120);
  });
});
