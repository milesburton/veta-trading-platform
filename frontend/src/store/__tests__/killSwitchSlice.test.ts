import { describe, expect, it, vi } from "vitest";
import {
  allBlocksCleared,
  blockAdded,
  blockRemoved,
  isOrderBlocked,
  killSwitchSlice,
} from "../killSwitchSlice";

describe("killSwitchSlice", () => {
  it("adds, removes, and clears blocks", () => {
    const block = {
      id: "b1",
      scope: "symbol" as const,
      scopeValues: ["AAPL"],
      issuedBy: "admin",
      issuedAt: 1,
    };

    const withBlock = killSwitchSlice.reducer(undefined, blockAdded(block));
    expect(withBlock.blocks).toHaveLength(1);

    const removed = killSwitchSlice.reducer(withBlock, blockRemoved({ id: "b1" }));
    expect(removed.blocks).toHaveLength(0);

    const cleared = killSwitchSlice.reducer(withBlock, allBlocksCleared());
    expect(cleared.blocks).toEqual([]);
  });

  it("blocks all orders when scope is all", () => {
    const blocks = [
      {
        id: "all-1",
        scope: "all" as const,
        scopeValues: [],
        issuedBy: "admin",
        issuedAt: 1,
      },
    ];
    expect(
      isOrderBlocked(blocks, {
        asset: "AAPL",
        strategy: "TWAP",
        userId: "u-1",
      })
    ).toBe(true);
  });

  it("matches user, algo, symbol, and market scoped blocks", () => {
    const blocks = [
      {
        id: "u",
        scope: "user" as const,
        scopeValues: [],
        targetUserId: "u-1",
        issuedBy: "risk",
        issuedAt: 1,
      },
      {
        id: "a",
        scope: "algo" as const,
        scopeValues: ["TWAP"],
        issuedBy: "risk",
        issuedAt: 1,
      },
      {
        id: "s",
        scope: "symbol" as const,
        scopeValues: ["AAPL"],
        issuedBy: "risk",
        issuedAt: 1,
      },
      {
        id: "m",
        scope: "market" as const,
        scopeValues: ["FX-"],
        issuedBy: "risk",
        issuedAt: 1,
      },
    ];

    expect(isOrderBlocked([blocks[0]], { userId: "u-1" })).toBe(true);
    expect(isOrderBlocked([blocks[1]], { strategy: "TWAP" })).toBe(true);
    expect(isOrderBlocked([blocks[2]], { asset: "AAPL" })).toBe(true);
    expect(isOrderBlocked([blocks[3]], { asset: "FX-EURUSD" })).toBe(true);
  });

  it("supports wildcard market block and user scope without target user", () => {
    const blocks = [
      {
        id: "m2",
        scope: "market" as const,
        scopeValues: ["*"],
        issuedBy: "risk",
        issuedAt: 1,
      },
      {
        id: "u2",
        scope: "user" as const,
        scopeValues: [],
        issuedBy: "risk",
        issuedAt: 1,
      },
    ];

    expect(isOrderBlocked([blocks[0]], { asset: "ANY" })).toBe(true);
    expect(isOrderBlocked([blocks[1]], { userId: "someone" })).toBe(true);
  });

  it("auto-prunes expired blocks when adding a new one", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const expired = {
      id: "expired",
      scope: "all" as const,
      scopeValues: [],
      issuedBy: "admin",
      issuedAt: 1,
      resumeAt: 5_000,
    };
    const fresh = {
      id: "fresh",
      scope: "symbol" as const,
      scopeValues: ["AAPL"],
      issuedBy: "admin",
      issuedAt: 9_000,
    };

    const withExpired = killSwitchSlice.reducer(undefined, blockAdded(expired));
    expect(withExpired.blocks).toHaveLength(1);

    const afterPrune = killSwitchSlice.reducer(withExpired, blockAdded(fresh));
    expect(afterPrune.blocks).toHaveLength(1);
    expect(afterPrune.blocks[0].id).toBe("fresh");
  });

  it("caps blocks at 200 (memory-leak guard)", () => {
    let state = killSwitchSlice.reducer(
      undefined,
      blockAdded({
        id: "first",
        scope: "symbol",
        scopeValues: ["AAPL"],
        issuedBy: "admin",
        issuedAt: 1,
      })
    );
    for (let i = 0; i < 250; i++) {
      state = killSwitchSlice.reducer(
        state,
        blockAdded({
          id: `b-${i}`,
          scope: "symbol",
          scopeValues: ["MSFT"],
          issuedBy: "admin",
          issuedAt: i + 100,
        })
      );
    }
    expect(state.blocks).toHaveLength(200);
    expect(state.blocks[199].id).toBe("b-249");
  });

  it("ignores expired blocks and returns false for non-matches", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);

    const blocks = [
      {
        id: "expired",
        scope: "all" as const,
        scopeValues: [],
        issuedBy: "admin",
        issuedAt: 1,
        resumeAt: 9999,
      },
      {
        id: "algo",
        scope: "algo" as const,
        scopeValues: ["VWAP"],
        issuedBy: "admin",
        issuedAt: 1,
      },
    ];

    expect(
      isOrderBlocked(blocks, {
        strategy: "TWAP",
        asset: "AAPL",
        userId: "u-1",
      })
    ).toBe(false);
  });
});
