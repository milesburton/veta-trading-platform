import { beforeEach, describe, expect, it, vi } from "vitest";
import { openOrderTicketWindow } from "../orderTicketWindow.ts";

describe("openOrderTicketWindow", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      ...window,
      location: { origin: "http://localhost:5173", pathname: "/" },
      open: vi.fn(),
    });
  });

  it("opens with default dimensions when no size passed", () => {
    openOrderTicketWindow();
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("panel=order-ticket"),
      "order-ticket",
      "width=480,height=780,resizable=yes"
    );
  });

  it("opens with provided dimensions", () => {
    openOrderTicketWindow({ w: 600, h: 900 });
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("panel=order-ticket"),
      "order-ticket",
      "width=600,height=900,resizable=yes"
    );
  });

  it("URL contains correct query params", () => {
    openOrderTicketWindow();
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("panel")).toBe("order-ticket");
    expect(params.get("type")).toBe("order-ticket");
    expect(params.get("layout")).toBeTruthy();
  });
});
