import type { eventWithTime } from "@rrweb/types";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("rrweb", () => ({
  Replayer: vi.fn(),
}));
vi.mock("html-to-image", () => ({
  toCanvas: vi.fn(),
}));

const { pickMimeType, timeRangeOfSession, viewportFromEvents } = await import(
  "../replayVideoExport.ts"
);

function ev(timestamp: number, type = 3, data: unknown = {}): eventWithTime {
  return { type, data, timestamp } as eventWithTime;
}

describe("timeRangeOfSession", () => {
  it("returns 0..0 for empty input", () => {
    expect(timeRangeOfSession([])).toEqual({ start: 0, end: 0 });
  });

  it("returns single timestamp for one event", () => {
    expect(timeRangeOfSession([ev(1000)])).toEqual({ start: 1000, end: 1000 });
  });

  it("picks min start and max end across events", () => {
    const events = [ev(1500), ev(1000), ev(2500), ev(1200)];
    expect(timeRangeOfSession(events)).toEqual({ start: 1000, end: 2500 });
  });

  it("handles already-sorted events", () => {
    const events = [ev(100), ev(200), ev(300)];
    expect(timeRangeOfSession(events)).toEqual({ start: 100, end: 300 });
  });
});

describe("viewportFromEvents", () => {
  it("falls back to 1280x720 when no meta event present", () => {
    expect(viewportFromEvents([ev(1, 3)])).toEqual({ width: 1280, height: 720 });
  });

  it("falls back when meta event is missing dimensions", () => {
    const events = [ev(1, 4, {})];
    expect(viewportFromEvents(events)).toEqual({ width: 1280, height: 720 });
  });

  it("returns first meta event with width and height", () => {
    const events = [
      ev(1, 3),
      ev(2, 4, { width: 1920, height: 1080 }),
      ev(3, 4, { width: 800, height: 600 }),
    ];
    expect(viewportFromEvents(events)).toEqual({ width: 1920, height: 1080 });
  });

  it("ignores meta-shaped events with missing height", () => {
    const events = [ev(1, 4, { width: 1920 }), ev(2, 4, { width: 800, height: 600 })];
    expect(viewportFromEvents(events)).toEqual({ width: 800, height: 600 });
  });
});

describe("pickMimeType", () => {
  const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;

  afterEach(() => {
    if (originalMediaRecorder === undefined) {
      delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    } else {
      (globalThis as { MediaRecorder?: unknown }).MediaRecorder = originalMediaRecorder;
    }
  });

  it("returns generic webm when MediaRecorder is unavailable", () => {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    expect(pickMimeType()).toEqual({ mimeType: "video/webm", ext: "webm" });
  });

  it("prefers vp9 when supported", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: vi.fn((m: string) => m === "video/webm;codecs=vp9"),
    };
    expect(pickMimeType()).toEqual({ mimeType: "video/webm;codecs=vp9", ext: "webm" });
  });

  it("falls back to vp8 when vp9 unsupported", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: vi.fn((m: string) => m === "video/webm;codecs=vp8"),
    };
    expect(pickMimeType()).toEqual({ mimeType: "video/webm;codecs=vp8", ext: "webm" });
  });

  it("falls back to plain webm when only that is supported", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: vi.fn((m: string) => m === "video/webm"),
    };
    expect(pickMimeType()).toEqual({ mimeType: "video/webm", ext: "webm" });
  });

  it("returns generic webm when nothing is supported", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: vi.fn(() => false),
    };
    expect(pickMimeType()).toEqual({ mimeType: "video/webm", ext: "webm" });
  });
});
