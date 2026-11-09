import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  buildSntpRequest,
  createMicrosClock,
  parseSntpResponse,
  startClockMonitor,
} from "./clock.ts";

const NTP_EPOCH = 2_208_988_800;

function response(receiveMs: number, transmitMs: number, stratum = 2): Uint8Array {
  const packet = new Uint8Array(48);
  packet[0] = 0x24;
  packet[1] = stratum;
  const view = new DataView(packet.buffer);
  const write = (offset: number, ms: number) => {
    view.setUint32(offset, Math.floor(ms / 1000) + NTP_EPOCH);
    view.setUint32(offset + 4, Math.floor(((ms % 1000) / 1000) * 4_294_967_296));
  };
  write(32, receiveMs);
  write(40, transmitMs);
  return packet;
}

test("[clock] micros clock advances with the monotonic source", () => {
  let wall = 1_700_000_000_000;
  let mono = 10;
  const micros = createMicrosClock({ nowMs: () => wall, monotonicMs: () => mono });
  const first = micros();
  mono += 2.5;
  wall += 9999;
  assertEquals(micros() - first, 2500);
});

test("[clock] request is a 48 byte client-mode packet carrying the transmit time", () => {
  const packet = buildSntpRequest(1_700_000_000_000);
  assertEquals(packet.length, 48);
  assertEquals(packet[0], 0x23);
  assertEquals(new DataView(packet.buffer).getUint32(40), 1_700_000_000 + NTP_EPOCH);
});

test("[clock] computes offset and round trip from the four timestamps", () => {
  const originate = 1_700_000_000_000;
  const result = parseSntpResponse(
    response(originate + 10_005, originate + 10_006),
    originate,
    originate + 12
  );
  assert(result);
  assertEquals(Math.round(result.offsetMicros / 1000), 10_000);
  assertEquals(Math.round(result.roundTripMicros / 1000), 11);
});

test("[clock] rejects short packets and kiss-of-death replies", () => {
  assertEquals(parseSntpResponse(new Uint8Array(10), 0, 0), null);
  assertEquals(parseSntpResponse(response(1000, 1000, 0), 0, 0), null);
});

test("[clock] monitor records offset and health, and flags failures", async () => {
  const recorded: Array<[string, number]> = [];
  const errors: string[] = [];
  let fail = false;
  const monitor = startClockMonitor({
    server: "ntp.test",
    intervalMs: 3_600_000,
    query: async () => {
      if (fail) throw new Error("timeout");
      return { offsetMicros: -420, roundTripMicros: 900 };
    },
    record: async (name, value) => {
      recorded.push([name, value]);
    },
    onError: (err) => errors.push(err.message),
  });
  await monitor.sample();
  fail = true;
  await monitor.sample();
  monitor.stop();
  assert(recorded.some(([n, v]) => n === "veta_clock_offset_microseconds" && v === -420));
  assertEquals(recorded.at(-1), ["veta_clock_sync_healthy", 0]);
  assertEquals(errors, ["timeout"]);
});
