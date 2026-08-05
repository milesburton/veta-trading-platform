import type { OrderRecord } from "@veta/frontend/types.ts";
import {
  openOrderTicketWindow,
  orderToTicketPrefill,
} from "@veta/frontend/utils/orderTicketWindow.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("openOrderTicketWindow", () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    vi.stubGlobal("location", { origin: "http://localhost:5173", pathname: "/" });
  });

  it("opens with default dimensions when no size passed", () => {
    openOrderTicketWindow();
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("panel=order-ticket"),
      "order-ticket",
      "width=480,height=780,resizable=yes"
    );
  });

  it("opens with provided dimensions", () => {
    openOrderTicketWindow({ w: 600, h: 900 });
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("panel=order-ticket"),
      "order-ticket",
      "width=600,height=900,resizable=yes"
    );
  });

  it("URL contains correct query params", () => {
    openOrderTicketWindow();
    const url = openSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("panel")).toBe("order-ticket");
    expect(params.get("type")).toBe("order-ticket");
    expect(params.get("layout")).toBeTruthy();
  });

  it("encodes a prefill intent into the URL when provided", () => {
    openOrderTicketWindow(undefined, {
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
      limitPrice: 200,
    });
    const url = openSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    const prefill = params.get("prefill");
    expect(prefill).toBeTruthy();
    const parsed = JSON.parse(decodeURIComponent(prefill ?? ""));
    expect(parsed).toMatchObject({
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
      limitPrice: 200,
    });
  });
});

describe("orderToTicketPrefill", () => {
  const baseOrder: OrderRecord = {
    id: "order-1",
    submittedAt: 1,
    asset: "AAPL",
    side: "BUY",
    quantity: 500,
    limitPrice: 200,
    expiresAt: 2,
    strategy: "LIMIT",
    status: "filled",
    filled: 500,
    algoParams: { strategy: "LIMIT" },
    children: [],
  };

  it("copies the original order fields into a new-order draft", () => {
    expect(orderToTicketPrefill({ ...baseOrder, timeInForce: "IOC" })).toEqual({
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
      limitPrice: 200,
      strategy: "LIMIT",
      tif: "IOC",
    });
  });

  it("preserves ticket-compatible algo parameters", () => {
    expect(
      orderToTicketPrefill({
        ...baseOrder,
        strategy: "ICEBERG",
        algoParams: { strategy: "ICEBERG", visibleQty: 75 },
      })
    ).toMatchObject({ strategy: "ICEBERG", icebergVisibleQty: 75 });
  });

  it("drops an out-of-range TWAP duration instead of failing the whole prefill", () => {
    const prefill = orderToTicketPrefill({
      ...baseOrder,
      strategy: "TWAP",
      algoParams: { strategy: "TWAP", numSlices: 1000, participationCap: 25 },
    });
    expect(prefill.twapDurationMinutes).toBeUndefined();
    expect(prefill).toMatchObject({ side: "BUY", symbol: "AAPL", quantity: 500, limitPrice: 200 });
  });

  it("drops an out-of-range iceberg visible quantity", () => {
    const prefill = orderToTicketPrefill({
      ...baseOrder,
      strategy: "ICEBERG",
      algoParams: { strategy: "ICEBERG", visibleQty: 200_000_000 },
    });
    expect(prefill.icebergVisibleQty).toBeUndefined();
    expect(prefill.symbol).toBe("AAPL");
  });

  it("drops an out-of-range POV participation rate", () => {
    const prefill = orderToTicketPrefill({
      ...baseOrder,
      strategy: "POV",
      algoParams: {
        strategy: "POV",
        participationRate: 150,
        minSliceSize: 10,
        maxSliceSize: 1000,
      },
    });
    expect(prefill.povRatePercent).toBeUndefined();
    expect(prefill.symbol).toBe("AAPL");
  });

  it("drops a GTD time-in-force since the ticket does not accept it", () => {
    expect(orderToTicketPrefill({ ...baseOrder, timeInForce: "GTD" }).tif).toBeUndefined();
  });
});
