import {
  captureScreenshotBlob,
  MAX_ATTACHMENT_BYTES,
  uploadAttachment,
} from "@veta/frontend/lib/ticketAttachmentUpload";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("MAX_ATTACHMENT_BYTES", () => {
  it("is 10MB", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("uploadAttachment", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("posts a multipart form with the presigned fields plus the file", async () => {
    let capturedUrl = "";
    let capturedBody: FormData | undefined;
    globalThis.fetch = vi.fn((url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = init?.body as FormData;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    const file = new Blob(["hello"], { type: "image/png" });
    await uploadAttachment(file, {
      postUrl: "http://minio.example/ticket-attachments",
      formFields: { key: "u-1/a.png", policy: "abc", "x-amz-signature": "sig" },
      objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/a.png",
    });

    expect(capturedUrl).toBe("http://minio.example/ticket-attachments");
    expect(capturedBody?.get("key")).toBe("u-1/a.png");
    expect(capturedBody?.get("policy")).toBe("abc");
    expect(capturedBody?.get("x-amz-signature")).toBe("sig");
    expect(capturedBody?.get("file")).toBeInstanceOf(Blob);
  });

  it("throws when the upload response is not ok", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    ) as typeof fetch;

    await expect(
      uploadAttachment(new Blob(["x"]), {
        postUrl: "http://minio.example/ticket-attachments",
        formFields: {},
        objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/a.png",
      })
    ).rejects.toThrow(/403/);
  });
});

describe("captureScreenshotBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  });

  it("captures one frame, encodes it as PNG, and stops all tracks", async () => {
    const stopTrack = vi.fn();
    const track = { stop: stopTrack };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    });

    vi.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      value: 2,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      value: 600,
      configurable: true,
    });

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(
      this: HTMLCanvasElement,
      callback: BlobCallback
    ) {
      callback(new Blob(["png-bytes"], { type: "image/png" }));
    });

    const blob = await captureScreenshotBlob();

    expect(blob.type).toBe("image/png");
    expect(drawImage).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("stops tracks even when canvas encoding fails", async () => {
    const stopTrack = vi.fn();
    const track = { stop: stopTrack };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    });

    vi.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      value: 2,
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    await expect(captureScreenshotBlob()).rejects.toThrow(/2D canvas context/);
    expect(stopTrack).toHaveBeenCalled();
  });
});
