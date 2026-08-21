import type { eventWithTime } from "@rrweb/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let emitCallback: ((event: eventWithTime) => void) | null = null;
const mockStopFn = vi.fn();

vi.mock("rrweb", () => ({
  record: vi.fn((opts: { emit: (event: eventWithTime) => void }) => {
    emitCallback = opts.emit;
    return mockStopFn;
  }),
}));

import {
  isRecording,
  recordingDurationMs,
  startRecording,
  stopRecording,
} from "@veta/frontend/lib/sessionRecorder";

function fakeEvent(timestamp: number): eventWithTime {
  return { type: 2, data: {}, timestamp } as unknown as eventWithTime;
}

describe("sessionRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitCallback = null;
    mockStopFn.mockClear();
  });

  afterEach(async () => {
    if (isRecording()) {
      await stopRecording();
    }
    vi.useRealTimers();
  });

  it("isRecording() returns false initially", () => {
    expect(isRecording()).toBe(false);
  });

  it("startRecording() sets isRecording to true", () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);
    expect(isRecording()).toBe(true);
  });

  it("stopRecording() sets isRecording to false", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);
    await stopRecording();
    expect(isRecording()).toBe(false);
  });

  it("recordingDurationMs() returns 0 when not recording", () => {
    expect(recordingDurationMs()).toBe(0);
  });

  it("recordingDurationMs() returns elapsed time when recording", () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);
    vi.advanceTimersByTime(5000);
    expect(recordingDurationMs()).toBe(5000);
  });

  it("buffer flush calls the upload function with correct seq and events", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);

    emitCallback?.(fakeEvent(1000));
    emitCallback?.(fakeEvent(2000));

    vi.advanceTimersByTime(30_000);
    await vi.runAllTimersAsync();

    expect(upload).toHaveBeenCalledWith(0, [fakeEvent(1000), fakeEvent(2000)]);
  });

  it("stopRecording() flushes remaining buffer", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);

    emitCallback?.(fakeEvent(1000));
    emitCallback?.(fakeEvent(2000));

    await stopRecording();

    expect(upload).toHaveBeenCalledWith(0, [fakeEvent(1000), fakeEvent(2000)]);
  });

  it("stopRecording() calls onStop callback", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn();
    startRecording(upload, onStop);

    await stopRecording();

    expect(onStop).toHaveBeenCalledOnce();
  });

  it("auto-stops after MAX_DURATION_MS (30 minutes)", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn();
    startRecording(upload, onStop);

    expect(isRecording()).toBe(true);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(isRecording()).toBe(false);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("startRecording() is idempotent — calling twice does not create duplicate", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const { record } = vi.mocked(await import("rrweb"));

    startRecording(upload);
    const callCount = (record as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    startRecording(upload);
    expect((record as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);

    expect(isRecording()).toBe(true);
  });

  it("failed upload retries — buffer is prepended", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue(undefined);
    startRecording(upload);

    emitCallback?.(fakeEvent(1000));

    vi.advanceTimersByTime(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(0, [fakeEvent(1000)]);

    emitCallback?.(fakeEvent(2000));

    vi.advanceTimersByTime(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(0, [fakeEvent(1000), fakeEvent(2000)]);
  });

  it("drops the chunk after exceeding the max retry count instead of retrying forever", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("network error"));
    startRecording(upload);

    emitCallback?.(fakeEvent(1000));

    // 5 retries (MAX_CHUNK_RETRIES) plus the initial attempt, all failing
    for (let i = 0; i < 7; i++) {
      vi.advanceTimersByTime(30_000);
      await vi.advanceTimersByTimeAsync(0);
    }

    const callCountAtDrop = upload.mock.calls.length;
    expect(callCountAtDrop).toBeGreaterThan(0);

    // One more flush cycle: the chunk should have been dropped, so a fresh
    // event starts a new chunk rather than an ever-growing retried one.
    emitCallback?.(fakeEvent(9000));
    vi.advanceTimersByTime(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(upload).toHaveBeenLastCalledWith(expect.any(Number), [fakeEvent(9000)]);
  });

  it("caps the buffer so a stuck upload cannot grow it without bound", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("network error"));
    startRecording(upload);

    // Emit far more events than MAX_BUFFER_EVENTS (20_000) across repeated
    // failed flush cycles, simulating a sustained outage.
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 8000; i++) {
        emitCallback?.(fakeEvent(cycle * 8000 + i));
      }
      vi.advanceTimersByTime(30_000);
      await vi.advanceTimersByTimeAsync(0);
    }

    const lastCall = upload.mock.calls.at(-1);
    const lastChunk = lastCall?.[1] as unknown[];
    expect(lastChunk.length).toBeLessThanOrEqual(20_000);
  });
});
