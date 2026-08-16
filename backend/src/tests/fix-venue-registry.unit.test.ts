import { assertEquals } from "jsr:@std/assert@0.217";
import { getFixVenueCapabilities, isRegisteredVenue, validateVenueRouting } from "../fix/venue-registry.ts";

Deno.test("[fix-venue-registry] no ExDestination is always valid (venue routing optional)", () => {
  assertEquals(validateVenueRouting(undefined, true, 100).ok, true);
  assertEquals(validateVenueRouting("", false, 100).ok, true);
});

Deno.test("[fix-venue-registry] unknown venue is rejected", () => {
  const result = validateVenueRouting("NOTAVENUE", false, 100);
  assertEquals(result.ok, false);
  assertEquals(isRegisteredVenue("NOTAVENUE"), false);
});

Deno.test("[fix-venue-registry] IEX rejects market orders but allows limit orders", () => {
  assertEquals(validateVenueRouting("IEX", true, 100).ok, false);
  assertEquals(validateVenueRouting("IEX", false, 100).ok, true);
});

Deno.test("[fix-venue-registry] DARK1 enforces its minimum quantity", () => {
  assertEquals(validateVenueRouting("DARK1", false, 5_000).ok, false);
  assertEquals(validateVenueRouting("DARK1", false, 10_000).ok, true);
  assertEquals(validateVenueRouting("DARK1", false, 15_000).ok, true);
});

Deno.test("[fix-venue-registry] DARK1 rejects market orders regardless of quantity", () => {
  assertEquals(validateVenueRouting("DARK1", true, 50_000).ok, false);
});

Deno.test("[fix-venue-registry] XNAS allows both market and limit orders with no minimum", () => {
  assertEquals(validateVenueRouting("XNAS", true, 1).ok, true);
  assertEquals(validateVenueRouting("XNAS", false, 1).ok, true);
});

Deno.test("[fix-venue-registry] getFixVenueCapabilities returns undefined for an unregistered MIC", () => {
  assertEquals(getFixVenueCapabilities("NOTAVENUE"), undefined);
  assertEquals(getFixVenueCapabilities("XNAS")?.name, "Nasdaq");
});
