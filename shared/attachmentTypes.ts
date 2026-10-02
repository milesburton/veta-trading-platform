export const ATTACHMENT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export function isAllowedAttachmentType(contentType: string): boolean {
  return (ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType.toLowerCase());
}
