import { createSocket } from "node:dgram";

const NTP_EPOCH_OFFSET_SECONDS = 2_208_988_800;
const NTP_PACKET_BYTES = 48;
const TWO_POW_32 = 4_294_967_296;

export interface ClockSource {
  nowMs: () => number;
  monotonicMs: () => number;
}

const systemSource: ClockSource = {
  nowMs: () => Date.now(),
  monotonicMs: () => performance.now(),
};

export const RE_ANCHOR_THRESHOLD_MS = 5;

export function createMicrosClock(source: ClockSource = systemSource): () => number {
  let anchorWallMs = source.nowMs();
  let anchorMonotonicMs = source.monotonicMs();
  let lastMicros = 0;
  return () => {
    const monotonicMs = source.monotonicMs();
    const wallMs = source.nowMs();
    const projectedMs = anchorWallMs + (monotonicMs - anchorMonotonicMs);
    if (Math.abs(wallMs - projectedMs) > RE_ANCHOR_THRESHOLD_MS) {
      anchorWallMs = wallMs;
      anchorMonotonicMs = monotonicMs;
    }
    const micros = Math.round((anchorWallMs + (monotonicMs - anchorMonotonicMs)) * 1000);
    lastMicros = Math.max(lastMicros, micros);
    return lastMicros;
  };
}

export const nowMicros = createMicrosClock();

export function buildSntpRequest(transmitMs: number): Uint8Array {
  const packet = new Uint8Array(NTP_PACKET_BYTES);
  packet[0] = 0x23;
  writeNtpTimestamp(packet, 40, transmitMs);
  return packet;
}

function writeNtpTimestamp(packet: Uint8Array, offset: number, ms: number): void {
  const seconds = Math.floor(ms / 1000) + NTP_EPOCH_OFFSET_SECONDS;
  const fraction = Math.floor(((ms % 1000) / 1000) * TWO_POW_32);
  const view = new DataView(packet.buffer, packet.byteOffset);
  view.setUint32(offset, seconds >>> 0);
  view.setUint32(offset + 4, fraction >>> 0);
}

function readNtpTimestampMs(packet: Uint8Array, offset: number): number {
  const view = new DataView(packet.buffer, packet.byteOffset);
  const seconds = view.getUint32(offset) - NTP_EPOCH_OFFSET_SECONDS;
  const fraction = view.getUint32(offset + 4) / TWO_POW_32;
  return (seconds + fraction) * 1000;
}

export interface SntpResult {
  offsetMicros: number;
  roundTripMicros: number;
}

export function parseSntpResponse(
  packet: Uint8Array,
  originateMs: number,
  destinationMs: number
): SntpResult | null {
  if (packet.length < NTP_PACKET_BYTES) return null;
  const leapIndicator = packet[0] >> 6;
  const mode = packet[0] & 0x07;
  const stratum = packet[1];
  if (leapIndicator === 3 || mode !== 4 || stratum === 0 || stratum >= 16) return null;
  const receiveMs = readNtpTimestampMs(packet, 32);
  const transmitMs = readNtpTimestampMs(packet, 40);
  const offsetMs = (receiveMs - originateMs + (transmitMs - destinationMs)) / 2;
  const roundTripMs = destinationMs - originateMs - (transmitMs - receiveMs);
  return {
    offsetMicros: Math.round(offsetMs * 1000),
    roundTripMicros: Math.round(roundTripMs * 1000),
  };
}

export function querySntp(
  server: string,
  options: { port?: number; timeoutMs?: number; nowMs?: () => number } = {}
): Promise<SntpResult> {
  const nowMs = options.nowMs ?? Date.now;
  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    let originateMs = 0;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`SNTP query to ${server} timed out`));
    }, options.timeoutMs ?? 3000);
    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      const result = parseSntpResponse(message, originateMs, nowMs());
      if (result) resolve(result);
      else reject(new Error(`SNTP response from ${server} was not usable`));
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.connect(options.port ?? 123, server, (err?: Error) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
        return;
      }
      originateMs = nowMs();
      socket.send(buildSntpRequest(originateMs));
    });
  });
}

export const CLOCK_DRIFT_TIERS_MICROS = {
  hftAlgorithmic: 100,
  algorithmic: 1_000,
  other: 1_000_000,
} as const;

export interface ClockMonitorOptions {
  server: string;
  query?: (server: string) => Promise<SntpResult>;
  record: (name: string, value: number, attributes?: Record<string, string>) => Promise<unknown>;
  intervalMs?: number;
  onError?: (err: Error) => void;
}

export interface ClockMonitor {
  sample: () => Promise<void>;
  stop: () => void;
}

export function startClockMonitor(options: ClockMonitorOptions): ClockMonitor {
  const query = options.query ?? ((server: string) => querySntp(server));
  const sample = async (): Promise<void> => {
    try {
      const result = await query(options.server);
      await options.record("veta_clock_offset_microseconds", result.offsetMicros, {
        server: options.server,
      });
      await options.record("veta_clock_sync_healthy", 1);
    } catch (err) {
      await options.record("veta_clock_sync_healthy", 0);
      options.onError?.(err as Error);
    }
  };
  const timer = setInterval(() => void sample(), options.intervalMs ?? 60_000);
  void sample();
  return { sample, stop: () => clearInterval(timer) };
}
