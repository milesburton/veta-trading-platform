import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { capToDepth } from "../algo/depth-cap.ts";
import { matchAgainstSnapshot } from "../ems/matching-engine.ts";

const MID = 100;
const LEVELS = 10;

function snapshot(dailyVolume: number) {
  const lot = Math.max(100, Math.round(dailyVolume / 5_000));
  const halfSpread = MID * 0.0004;
  const level = (sign: 1 | -1, i: number) => ({
    price: Number((MID + sign * halfSpread * (1 + i * 0.6)).toFixed(4)),
    size: Math.max(100, Math.round(lot * Math.max(0.05, 1 - i * 0.09))),
  });
  const indices = Array.from({ length: LEVELS }, (_, i) => i);
  return {
    bids: indices.map((i) => level(-1, i)),
    asks: indices.map((i) => level(1, i)),
    mid: MID,
    ts: 0,
  };
}

const tickVolume = (dailyVolume: number) => dailyVolume / 390;

const fillRatio = (dailyVolume: number, requested: number) => {
  const tick = { volumes: { X: tickVolume(dailyVolume) } };
  const qty = capToDepth(requested, tick, "X");
  const result = matchAgainstSnapshot(
    "c",
    "X",
    "BUY",
    qty,
    1e9,
    snapshot(dailyVolume),
    0,
  );
  return result.filledQty / qty;
};

const scenarios: ReadonlyArray<readonly [string, number, number]> = [
  ["illiquid name, VWAP maxSlice", 500_000, 1_000],
  ["small name, TWAP slice of a 100k parent", 2_000_000, 1_667],
  ["mid name, oversized child", 10_000_000, 25_000],
  ["large name, oversized child", 55_000_000, 100_000],
];

for (const [name, dailyVolume, requested] of scenarios) {
  Deno.test(`depth cap against the book: ${name} fills fully once capped`, () => {
    assertEquals(fillRatio(dailyVolume, requested), 1);
  });
}

Deno.test("depth cap against the book: uncapped oversized child is only partly filled", () => {
  const result = matchAgainstSnapshot(
    "c",
    "X",
    "BUY",
    2_000,
    1e9,
    snapshot(500_000),
    0,
  );
  assert(result.filledQty / 2_000 < 1);
});
