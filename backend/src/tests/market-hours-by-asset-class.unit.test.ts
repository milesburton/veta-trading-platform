import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  ASSET_CLASSES,
  type AssetClass,
  buildMarketHoursPayload,
  isAssetClass,
  isAssetClassOpen,
} from "../market-sim/market-hours-by-asset-class.ts";
import {
  applyMarketHoursUpdate,
  createMarketHoursSettingsStore,
  marketHoursUpdateSchema,
  mergeStoredAllowOutOfHours,
} from "../market-sim/market-hours-settings.ts";

function allowNone(): Record<AssetClass, boolean> {
  return { equity: false, fx: false, commodity: false, bond: false };
}

test("[market-hours-by-asset-class] equity is open during regular US session", () => {
  assertEquals(isAssetClassOpen("equity", new Date("2026-07-29T14:00:00Z")), true);
});

test("[market-hours-by-asset-class] equity is closed on a weekend", () => {
  assertEquals(isAssetClassOpen("equity", new Date("2026-08-01T15:00:00Z")), false);
});

test("[market-hours-by-asset-class] fx is NOT gated by the US equity calendar (regression)", () => {
  const midweek = new Date("2026-07-29T12:00:00Z");
  assertEquals(isAssetClassOpen("equity", midweek), false);
  assert(isAssetClassOpen("fx", midweek), "fx should not be gated by the US equity calendar");
});

test("[market-hours-by-asset-class] isAssetClass validates against the real enum", () => {
  for (const ac of ASSET_CLASSES) assert(isAssetClass(ac));
  assert(!isAssetClass("crypto"));
  assert(!isAssetClass(undefined));
  assert(!isAssetClass(123));
});

test("[market-hours-by-asset-class] buildMarketHoursPayload covers every asset class", () => {
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

test("[market-hours-by-asset-class] buildMarketHoursPayload reflects real session state per class", () => {
  const midweek = new Date("2026-07-29T12:00:00Z");
  const payload = buildMarketHoursPayload(allowNone(), midweek);
  assertEquals(payload.assetClasses.equity.isOpen, false);
  assertEquals(payload.assetClasses.fx.isOpen, true);
});

test("[market-hours-by-asset-class] buildMarketHoursPayload echoes back the override flags passed in", () => {
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
});

function allowAll(): Record<AssetClass, boolean> {
  return { equity: true, fx: true, commodity: true, bond: true };
}

function fakePool(rows: { value: unknown }[], calls: unknown[][] = [], fail = false) {
  return {
    connect: () =>
      fail
        ? Promise.reject(new Error("connection refused"))
        : Promise.resolve({
            queryObject: <T>(_query: string, args?: unknown[]) => {
              calls.push(args ?? []);
              return Promise.resolve({ rows: rows as T[] });
            },
            release: () => {},
          }),
  };
}

test("[market-hours-settings] update without assetClass switches every asset class", () => {
  assertEquals(applyMarketHoursUpdate(allowAll(), { allowOutOfHours: false }), allowNone());
});

test("[market-hours-settings] update with assetClass only changes that class", () => {
  assertEquals(applyMarketHoursUpdate(allowAll(), { assetClass: "fx", allowOutOfHours: false }), {
    ...allowAll(),
    fx: false,
  });
});

test("[market-hours-settings] update schema rejects unknown asset classes", () => {
  assertEquals(
    marketHoursUpdateSchema.safeParse({ assetClass: "crypto", allowOutOfHours: true }).success,
    false
  );
  assertEquals(marketHoursUpdateSchema.safeParse({ allowOutOfHours: "yes" }).success, false);
});

test("[market-hours-settings] stored value fills missing classes from defaults", () => {
  assertEquals(mergeStoredAllowOutOfHours(allowAll(), { equity: false }), {
    ...allowAll(),
    equity: false,
  });
  assertEquals(mergeStoredAllowOutOfHours(allowAll(), "garbage"), null);
});

test("[market-hours-settings] load returns the saved mode", async () => {
  const store = createMarketHoursSettingsStore(fakePool([{ value: allowNone() }]));
  assertEquals(await store.load(allowAll()), allowNone());
});

test("[market-hours-settings] load returns null when nothing is saved", async () => {
  const store = createMarketHoursSettingsStore(fakePool([]));
  assertEquals(await store.load(allowAll()), null);
});

test("[market-hours-settings] load falls back to null when the database is down", async () => {
  const store = createMarketHoursSettingsStore(fakePool([], [], true));
  assertEquals(await store.load(allowAll()), null);
});

test("[market-hours-settings] save upserts the value with the updater", async () => {
  const calls: unknown[][] = [];
  const store = createMarketHoursSettingsStore(fakePool([], calls));
  await store.save(allowNone(), "admin-1");
  assertEquals(calls, [["allow_out_of_hours", JSON.stringify(allowNone()), "admin-1"]]);
});
