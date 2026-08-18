import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  ASSET_CLASSES,
  type AssetClass,
  buildMarketHoursPayload,
  isAssetClass,
  isAssetClassOpen,
} from "../market-sim/market-hours-by-asset-class.ts";

function allowNone(): Record<AssetClass, boolean> {
  return { equity: false, fx: false, commodity: false, bond: false };
}

Deno.test("[market-hours-by-asset-class] equity is open during regular US session", () => {
  assertEquals(isAssetClassOpen("equity", new Date("2026-07-29T14:00:00Z")), true);
});

Deno.test("[market-hours-by-asset-class] equity is closed on a weekend", () => {
  assertEquals(isAssetClassOpen("equity", new Date("2026-08-01T15:00:00Z")), false);
});

Deno.test(
  "[market-hours-by-asset-class] fx is NOT gated by the US equity calendar (regression)",
  () => {
    const midweek = new Date("2026-07-29T12:00:00Z");
    assertEquals(isAssetClassOpen("equity", midweek), false);
    assert(isAssetClassOpen("fx", midweek), "fx should not be gated by the US equity calendar");
  }
);

Deno.test("[market-hours-by-asset-class] isAssetClass validates against the real enum", () => {
  for (const ac of ASSET_CLASSES) assert(isAssetClass(ac));
  assert(!isAssetClass("crypto"));
  assert(!isAssetClass(undefined));
  assert(!isAssetClass(123));
});

Deno.test("[market-hours-by-asset-class] buildMarketHoursPayload covers every asset class", () => {
  const payload = buildMarketHoursPayload(allowNone(), new Date("2026-07-29T14:00:00Z"));
  for (const ac of ASSET_CLASSES) {
    const entry = payload.assetClasses[ac];
    assert(entry, `missing entry for ${ac}`);
    assert(typeof entry.calendarLabel === "string" && entry.calendarLabel.length > 0);
    assert(typeof entry.isOpen === "boolean");
    assert(typeof entry.phase === "string" && entry.phase.length > 0);
    assertEquals(entry.allowOutOfHoursOverride, false);
  }
});

Deno.test(
  "[market-hours-by-asset-class] buildMarketHoursPayload reflects real session state per class",
  () => {
    const midweek = new Date("2026-07-29T12:00:00Z");
    const payload = buildMarketHoursPayload(allowNone(), midweek);
    assertEquals(payload.assetClasses.equity.isOpen, false);
    assertEquals(payload.assetClasses.fx.isOpen, true);
  }
);

Deno.test(
  "[market-hours-by-asset-class] buildMarketHoursPayload echoes back the override flags passed in",
  () => {
    const overrides: Record<AssetClass, boolean> = {
      equity: true,
      fx: false,
      commodity: true,
      bond: false,
    };
    const payload = buildMarketHoursPayload(overrides, new Date("2026-07-29T14:00:00Z"));
    for (const ac of ASSET_CLASSES) {
      assertEquals(payload.assetClasses[ac].allowOutOfHoursOverride, overrides[ac]);
    }
  }
);
