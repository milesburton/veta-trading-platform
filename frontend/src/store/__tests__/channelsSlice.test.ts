import { describe, expect, it } from "vitest";
import { channelsSlice } from "../channelsSlice";

describe("channelsSlice", () => {
  it("channelUpdated falls back to emptyChannel when channel is missing", () => {
    // Start from an empty state, force-omitting the channel
    const initial = {
      data: {} as ReturnType<typeof channelsSlice.reducer>["data"],
    };
    const next = channelsSlice.reducer(
      initial,
      channelsSlice.actions.channelUpdated({
        channel: 1 as 1 | 2 | 3 | 4 | 5 | 6,
        patch: { selectedAsset: "AAPL" },
      })
    );
    expect(next.data[1]?.selectedAsset).toBe("AAPL");
  });

  it("channelUpdated patches an existing channel", () => {
    const initial = channelsSlice.getInitialState();
    const next = channelsSlice.reducer(
      initial,
      channelsSlice.actions.channelUpdated({
        channel: 2,
        patch: { selectedAsset: "MSFT" },
      })
    );
    expect(next.data[2].selectedAsset).toBe("MSFT");
  });

  it("channelCleared resets the channel", () => {
    const initial = channelsSlice.getInitialState();
    const withData = channelsSlice.reducer(
      initial,
      channelsSlice.actions.channelUpdated({
        channel: 3,
        patch: { selectedAsset: "GOOGL" },
      })
    );
    const cleared = channelsSlice.reducer(
      withData,
      channelsSlice.actions.channelCleared({ channel: 3 })
    );
    expect(cleared.data[3].selectedAsset).toBeNull();
  });
});
