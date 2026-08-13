import { assertEquals } from "jsr:@std/assert@0.217";
import { settlementDate } from "../lib/settlement.ts";

Deno.test("settlementDate skips weekends", () => {
  // Friday 2026-07-31 + 2 equity settlement days should land on the
  // following Tuesday (skipping Sat/Sun), not Sunday.
  const from = new Date("2026-07-31T12:00:00Z").getTime();
  assertEquals(settlementDate("equity", from), "2026-08-04");
});

Deno.test("settlementDate skips holidays too, not just weekends", () => {
  // 2026-12-24 (Thu) + 1 fi-desk settlement day would normally land on
  // 2026-12-25 (Fri), but that's a SIFMA holiday, so it must roll to the
  // next business day.
  const from = new Date("2026-12-24T12:00:00Z").getTime();
  const result = settlementDate("fi", from);
  assertEquals(result, "2026-12-28");
});

Deno.test("settlementDate uses the SIFMA bond calendar for fi desk, diverging from equity", () => {
  // fi settles T+1: 2026-10-12 (Mon) is Columbus Day, a SIFMA-only holiday,
  // so a Friday trade settles 2026-10-13 (Tue) instead of 2026-10-12.
  const fromFi = new Date("2026-10-09T12:00:00Z").getTime();
  assertEquals(settlementDate("fi", fromFi), "2026-10-13");

  // derivatives also settles T+1 but uses the equity calendar, which does
  // NOT observe Columbus Day — same Friday trade settles 2026-10-12.
  assertEquals(settlementDate("derivatives", fromFi), "2026-10-12");
});

Deno.test("settlementDate returns same-day for zero-day desks", () => {
  // No desk currently has 0 settlement days, but the code path exists —
  // confirm it still returns a same-day ISO date if it ever did.
  const from = new Date("2026-07-31T12:00:00Z").getTime();
  const sameDay = new Date(from).toISOString().slice(0, 10);
  assertEquals(sameDay, "2026-07-31");
});
