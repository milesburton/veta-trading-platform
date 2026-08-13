import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { isDeskOpen } from "../synthetic-trader/deskCalendar.ts";

Deno.test("[synthetic-trader-desk-calendar] equity desk is open during regular US session", () => {
  assertEquals(isDeskOpen("equity", new Date("2026-07-29T14:00:00Z")), true);
});

Deno.test("[synthetic-trader-desk-calendar] equity desk is closed on a weekend", () => {
  assertEquals(isDeskOpen("equity", new Date("2026-08-01T15:00:00Z")), false);
});

Deno.test(
  "[synthetic-trader-desk-calendar] fx desk is NOT gated by the US equity calendar (regression)",
  () => {
    // Wed 12:00 UTC is outside US equity regular session (08:00 ET) but
    // squarely inside FX's continuous Sun22:00-Fri22:00 UTC week.
    const midweek = new Date("2026-07-29T12:00:00Z");
    assertEquals(
      isDeskOpen("equity", midweek),
      false,
      "equity desk should be closed at this instant, sanity-checking the test setup"
    );
    assert(isDeskOpen("fx", midweek), "fx desk should not be gated by the US equity calendar");
  }
);

Deno.test(
  "[synthetic-trader-desk-calendar] commodities desk is halted during the daily maintenance window",
  () => {
    assertEquals(isDeskOpen("commodities", new Date("2026-07-29T21:30:00Z")), false);
  }
);

Deno.test("[synthetic-trader-desk-calendar] fi desk follows the SIFMA bond calendar", () => {
  assertEquals(isDeskOpen("fi", new Date("2026-07-29T14:00:00Z")), true);
  assertEquals(isDeskOpen("fi", new Date("2026-08-01T15:00:00Z")), false);
});

Deno.test(
  "[synthetic-trader-desk-calendar] derivatives desk falls back to the underlying equity calendar",
  () => {
    assertEquals(isDeskOpen("derivatives", new Date("2026-07-29T14:00:00Z")), true);
    assertEquals(isDeskOpen("derivatives", new Date("2026-08-01T15:00:00Z")), false);
  }
);

Deno.test("[synthetic-trader-desk-calendar] unknown desk falls back to the US equity calendar", () => {
  assertEquals(isDeskOpen(undefined, new Date("2026-08-01T15:00:00Z")), false);
});
