import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  getTraderArchetype,
  TRADER_ARCHETYPE_IDS,
  TRADER_ARCHETYPES,
} from "@veta/trader-archetypes";

// Mirrors the CHECK constraints in migration 0010_trader_personas.sql. A new
// archetype using a style or desk outside these sets would be rejected by
// Postgres at registration time, so the test fails fast here instead.
const VALID_TRADING_STYLES = new Set([
  "high_touch",
  "low_touch",
  "fi_voice",
  "fx_electronic",
  "commodities_voice",
  "derivatives_high_touch",
  "derivatives_low_touch",
  "oversight",
]);

const VALID_PRIMARY_DESKS = new Set([
  "equity-cash",
  "equity-derivs",
  "fi-rates",
  "fi-credit",
  "fi-govies",
  "fx-cash",
  "commodities",
  "cross-desk",
]);

const VALID_STRATEGIES = new Set([
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
]);

Deno.test("[trader-archetypes] every archetype uses a DB-valid trading_style and primary_desk", () => {
  for (const a of TRADER_ARCHETYPES) {
    assert(
      VALID_TRADING_STYLES.has(a.tradingStyle),
      `${a.id} has invalid trading_style ${a.tradingStyle}`
    );
    assert(
      VALID_PRIMARY_DESKS.has(a.primaryDesk),
      `${a.id} has invalid primary_desk ${a.primaryDesk}`
    );
  }
});

Deno.test("[trader-archetypes] no archetype is self-registerable as oversight", () => {
  for (const a of TRADER_ARCHETYPES) {
    assert(
      a.tradingStyle !== "oversight",
      `${a.id} is oversight; oversight roles must not be self-registerable`
    );
  }
});

Deno.test("[trader-archetypes] allowed_strategies are all known strategies", () => {
  for (const a of TRADER_ARCHETYPES) {
    const strategies = a.allowedStrategies.split(",").filter(Boolean);
    assert(strategies.length > 0, `${a.id} has no strategies`);
    for (const s of strategies) {
      assert(VALID_STRATEGIES.has(s), `${a.id} has unknown strategy ${s}`);
    }
  }
});

Deno.test("[trader-archetypes] ids are unique and non-empty", () => {
  const ids = new Set<string>();
  for (const a of TRADER_ARCHETYPES) {
    assert(a.id.length > 0, "archetype id must be non-empty");
    assert(!ids.has(a.id), `duplicate archetype id ${a.id}`);
    ids.add(a.id);
  }
  assertEquals(ids.size, TRADER_ARCHETYPES.length);
  assertEquals(TRADER_ARCHETYPE_IDS.length, TRADER_ARCHETYPES.length);
});

Deno.test("[trader-archetypes] every archetype has a label and description", () => {
  for (const a of TRADER_ARCHETYPES) {
    assert(a.label.trim().length > 0, `${a.id} missing label`);
    assert(a.description.trim().length > 0, `${a.id} missing description`);
  }
});

Deno.test("[trader-archetypes] getTraderArchetype resolves known ids and rejects unknown", () => {
  for (const id of TRADER_ARCHETYPE_IDS) {
    const a = getTraderArchetype(id);
    assert(a !== undefined, `getTraderArchetype(${id}) should resolve`);
    assertEquals(a?.id, id);
  }
  assertEquals(getTraderArchetype("not-a-real-archetype"), undefined);
  assertEquals(getTraderArchetype(""), undefined);
});

Deno.test("[trader-archetypes] fx-electronic is the only dark-pool archetype", () => {
  const darkPool = TRADER_ARCHETYPES.filter((a) => a.darkPoolAccess).map((a) => a.id);
  assertEquals(darkPool, ["fx-electronic"]);
});
