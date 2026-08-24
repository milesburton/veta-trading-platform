export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface PresignedUpload {
  postUrl: string;
  formFields: Record<string, string>;
  objectUrl: string;
}

export async function uploadAttachment(file: Blob, presigned: PresignedUpload): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(presigned.formFields)) {
    form.append(key, value);
  }
  form.append("file", file);

  const res = await fetch(presigned.postUrl, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`upload failed with status ${res.status}`);
  }
}

export async function captureScreenshotBlob(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("no video track in captured stream");

    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve(undefined);
      else video.onloadeddata = () => resolve(undefined);
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("failed to encode screenshot"));
      }, "image/png");
    });
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
