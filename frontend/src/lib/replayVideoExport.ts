import type { eventWithTime } from "@rrweb/types";
import * as htmlToImage from "html-to-image";
import { Replayer } from "rrweb";

const FRAME_FPS = 10;
const FRAME_INTERVAL_MS = Math.round(1000 / FRAME_FPS);

export interface RenderProgress {
  phase: "preparing" | "rendering" | "encoding" | "done";
  percent: number;
  framesRendered: number;
  totalFrames: number;
}

export interface RenderOptions {
  events: eventWithTime[];
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  durationMs: number;
  width: number;
  height: number;
}

export function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return { mimeType: m, ext: "webm" };
    }
  }
  return { mimeType: "video/webm", ext: "webm" };
}

export function timeRangeOfSession(events: eventWithTime[]): { start: number; end: number } {
  if (events.length === 0) return { start: 0, end: 0 };
  let start = events[0].timestamp;
  let end = start;
  for (const e of events) {
    if (e.timestamp < start) start = e.timestamp;
    if (e.timestamp > end) end = e.timestamp;
  }
  return { start, end };
}

export function viewportFromEvents(events: eventWithTime[]): { width: number; height: number } {
  for (const e of events) {
    const meta = e as { type: number; data?: { width?: number; height?: number } };
    if (meta.type === 4 && meta.data?.width && meta.data?.height) {
      return { width: meta.data.width, height: meta.data.height };
    }
  }
  return { width: 1280, height: 720 };
}

export async function renderReplayToWebM(opts: RenderOptions): Promise<RenderResult> {
  const { events, onProgress, signal } = opts;
  if (events.length < 2) {
    throw new Error("Session has too few events to render");
  }

  const { mimeType } = pickMimeType();
  const { width, height } = viewportFromEvents(events);
  const range = timeRangeOfSession(events);
  const durationMs = range.end - range.start;
  const totalFrames = Math.max(1, Math.ceil(durationMs / FRAME_INTERVAL_MS));

  onProgress?.({ phase: "preparing", percent: 0, framesRendered: 0, totalFrames });

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(host);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    host.remove();
    throw new Error("2D canvas context unavailable");
  }
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  const stream = canvas.captureStream(FRAME_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject((e as ErrorEvent).error ?? new Error("MediaRecorder error"));
  });

  const replayer = new Replayer(events, {
    root: host,
    skipInactive: false,
    showWarning: false,
    showDebug: false,
    mouseTail: false,
    UNSAFE_replayCanvas: true,
  });

  recorder.start(250);

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t = Math.min(durationMs, i * FRAME_INTERVAL_MS);
      replayer.pause(t);
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));

      const iframe = (replayer as unknown as { iframe?: HTMLIFrameElement }).iframe;
      const body = iframe?.contentDocument?.body;
      if (body) {
        const dataUrl = await htmlToImage.toCanvas(body, {
          width,
          height,
          backgroundColor: "#0f172a",
          pixelRatio: 1,
          cacheBust: false,
          fetchRequestInit: { credentials: "same-origin" },
        });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(dataUrl, 0, 0, width, height);
      }

      onProgress?.({
        phase: "rendering",
        percent: ((i + 1) / totalFrames) * 95,
        framesRendered: i + 1,
        totalFrames,
      });
      await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
    }
  } finally {
    onProgress?.({ phase: "encoding", percent: 97, framesRendered: totalFrames, totalFrames });
    recorder.stop();
    await finished;
    replayer.destroy();
    host.remove();
    for (const track of stream.getTracks()) track.stop();
  }

  const blob = new Blob(chunks, { type: mimeType });
  onProgress?.({ phase: "done", percent: 100, framesRendered: totalFrames, totalFrames });
  return { blob, durationMs, width, height };
}
