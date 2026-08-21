import type { eventWithTime } from "@rrweb/types";
import { record } from "rrweb";

const FLUSH_INTERVAL_MS = 30_000;
const MAX_DURATION_MS = 30 * 60 * 1000;
const MAX_BUFFER_EVENTS = 20_000;
const MAX_CHUNK_RETRIES = 5;

type UploadFn = (seq: number, events: eventWithTime[]) => Promise<void>;
type OnStopFn = () => void;

let stopFn: (() => void) | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let buffer: eventWithTime[] = [];
let seq = 0;
let uploadFn: UploadFn | null = null;
let onStopCallback: OnStopFn | null = null;
let startedAt = 0;
let durationTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChunkRetries = 0;

function pushEvent(event: eventWithTime): void {
  buffer.push(event);
  if (buffer.length > MAX_BUFFER_EVENTS) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_EVENTS);
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0 || !uploadFn) return;
  const chunk = [...buffer];
  buffer = [];
  const currentSeq = seq++;
  try {
    await uploadFn(currentSeq, chunk);
    pendingChunkRetries = 0;
  } catch {
    pendingChunkRetries++;
    seq = currentSeq;
    if (pendingChunkRetries > MAX_CHUNK_RETRIES) {
      pendingChunkRetries = 0;
      return;
    }
    buffer = [...chunk, ...buffer].slice(-MAX_BUFFER_EVENTS);
  }
}

export function startRecording(upload: UploadFn, onStop?: OnStopFn): void {
  if (stopFn) return;

  buffer = [];
  seq = 0;
  pendingChunkRetries = 0;
  uploadFn = upload;
  onStopCallback = onStop ?? null;
  startedAt = Date.now();

  stopFn =
    record({
      maskAllInputs: true,
      maskInputOptions: { password: true },
      maskTextSelector: "[data-sensitive]",
      blockSelector: ".no-replay",
      emit(event: eventWithTime) {
        pushEvent(event);
      },
    }) ?? null;

  flushTimer = setInterval(() => {
    flush();
  }, FLUSH_INTERVAL_MS);

  durationTimer = setTimeout(() => {
    stopRecording();
  }, MAX_DURATION_MS);
}

export async function stopRecording(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (durationTimer) {
    clearTimeout(durationTimer);
    durationTimer = null;
  }
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
  await flush();
  if (onStopCallback) {
    onStopCallback();
    onStopCallback = null;
  }
  uploadFn = null;
}

export function isRecording(): boolean {
  return stopFn !== null;
}

export function recordingDurationMs(): number {
  return stopFn ? Date.now() - startedAt : 0;
}
