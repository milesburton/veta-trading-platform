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
} from "../sessionRecorder";

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

    emitCallback!(fakeEvent(1000));
    emitCallback!(fakeEvent(2000));

    vi.advanceTimersByTime(30_000);
    await vi.runAllTimersAsync();

    expect(upload).toHaveBeenCalledWith(0, [fakeEvent(1000), fakeEvent(2000)]);
  });

  it("stopRecording() flushes remaining buffer", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    startRecording(upload);

    emitCallback!(fakeEvent(1000));
    emitCallback!(fakeEvent(2000));

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

    emitCallback!(fakeEvent(1000));

    vi.advanceTimersByTime(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(0, [fakeEvent(1000)]);

    emitCallback!(fakeEvent(2000));

    vi.advanceTimersByTime(30_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(0, [fakeEvent(1000), fakeEvent(2000)]);
  });
});
