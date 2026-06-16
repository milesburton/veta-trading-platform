import type { eventWithTime } from "@rrweb/types";
import * as htmlToImage from "html-to-image";
import { Replayer } from "rrweb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("rrweb", () => ({
  Replayer: vi.fn(),
}));
vi.mock("html-to-image", () => ({
  toCanvas: vi.fn(),
}));

const { pickMimeType, renderReplayToWebM, timeRangeOfSession, viewportFromEvents } = await import(
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

describe("renderReplayToWebM", () => {
  const ReplayerMock = vi.mocked(Replayer);
  const toCanvasMock = vi.mocked(htmlToImage.toCanvas);

  const win = globalThis as typeof globalThis & {
    MediaRecorder: typeof MediaRecorder;
    requestAnimationFrame: typeof requestAnimationFrame;
  };
  const originalMediaRecorder = win.MediaRecorder;
  const originalRaf = win.requestAnimationFrame;

  let recorderInstances: Array<{
    onstop: (() => void) | null;
    onerror: ((e: unknown) => void) | null;
    ondataavailable: ((e: { data: { size: number } }) => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>;
  let trackStop: ReturnType<typeof vi.fn>;

  function metaEvents(): eventWithTime[] {
    return [ev(1000, 4, { width: 320, height: 240 }), ev(1005, 3, { source: 2 })];
  }

  beforeEach(() => {
    recorderInstances = [];
    trackStop = vi.fn();

    win.MediaRecorder = vi.fn(function (this: Record<string, unknown>) {
      const inst = {
        onstop: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        ondataavailable: null as ((e: { data: { size: number } }) => void) | null,
        start: vi.fn(),
        stop: vi.fn(),
      };
      recorderInstances.push(inst);
      this.start = (...args: unknown[]) => {
        inst.start(...args);
        inst.ondataavailable?.({ data: { size: 8 } } as { data: { size: number } });
      };
      this.stop = (...args: unknown[]) => {
        inst.stop(...args);
        inst.onstop?.();
      };
      Object.defineProperty(this, "ondataavailable", {
        set: (fn) => {
          inst.ondataavailable = fn;
        },
      });
      Object.defineProperty(this, "onstop", {
        set: (fn) => {
          inst.onstop = fn;
        },
      });
      Object.defineProperty(this, "onerror", {
        set: (fn) => {
          inst.onerror = fn;
        },
      });
    }) as unknown as typeof MediaRecorder;
    (win.MediaRecorder as { isTypeSupported: (m: string) => boolean }).isTypeSupported = () => true;

    win.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    (
      HTMLCanvasElement.prototype as unknown as {
        captureStream: () => { getTracks: () => Array<{ stop: () => void }> };
      }
    ).captureStream = vi.fn(() => ({
      getTracks: () => [{ stop: trackStop as unknown as () => void }],
    }));

    ReplayerMock.mockImplementation(function (this: Record<string, unknown>) {
      this.pause = vi.fn();
      this.destroy = vi.fn();
      this.iframe = undefined;
    } as unknown as typeof Replayer);
    toCanvasMock.mockResolvedValue(document.createElement("canvas"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    win.MediaRecorder = originalMediaRecorder;
    win.requestAnimationFrame = originalRaf;
  });

  it("throws when fewer than two events are supplied", async () => {
    await expect(renderReplayToWebM({ events: [ev(1)] })).rejects.toThrow("too few events");
  });

  it("throws and cleans up the host when no 2D context is available", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const before = document.body.childElementCount;

    await expect(renderReplayToWebM({ events: metaEvents() })).rejects.toThrow(
      "2D canvas context unavailable"
    );

    expect(document.body.childElementCount).toBe(before);
  });

  it("aborts before rendering frames when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      renderReplayToWebM({ events: metaEvents(), signal: controller.signal })
    ).rejects.toThrow("Aborted");

    expect(recorderInstances[0]?.stop).toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });

  it("renders a session to a webm blob and reports progress through to done", async () => {
    const phases: string[] = [];
    const result = await renderReplayToWebM({
      events: metaEvents(),
      onProgress: (p) => phases.push(p.phase),
    });

    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
    expect(result.durationMs).toBe(5);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(phases).toContain("preparing");
    expect(phases).toContain("encoding");
    expect(phases[phases.length - 1]).toBe("done");
    expect(trackStop).toHaveBeenCalled();
  });
});
