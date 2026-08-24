import { json, jsonError, parseBody } from "@veta/http";
import { z } from "@veta/zod";
import { type GatewayContext, isResponse } from "../context.ts";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE = /^(image|video)\//;
const PRESIGN_EXPIRY_SECONDS = 300;

const PresignRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

interface MinioConfig {
  endpoint: string;
  publicBaseUrl: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

function readMinioConfig(): MinioConfig | null {
  const endpoint = Deno.env.get("MINIO_ENDPOINT");
  const publicBaseUrl = Deno.env.get("MINIO_PUBLIC_URL");
  const accessKey = Deno.env.get("MINIO_ROOT_USER");
  const secretKey = Deno.env.get("MINIO_ROOT_PASSWORD");
  if (!endpoint || !publicBaseUrl || !accessKey || !secretKey) return null;
  return {
    endpoint,
    publicBaseUrl,
    bucket: Deno.env.get("MINIO_BUCKET") ?? "ticket-attachments",
    accessKey,
    secretKey,
    region: "us-east-1",
  };
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .slice(-100);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toHex(digest);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice().buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  return hmacSha256(kService, "aws4_request");
}

interface PresignedPost {
  postUrl: string;
  formFields: Record<string, string>;
}

async function presignPost(
  cfg: MinioConfig,
  objectKey: string,
  contentType: string,
  maxBytes: number
): Promise<PresignedPost> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const credential = `${cfg.accessKey}/${credentialScope}`;
  const expiration = new Date(now.getTime() + PRESIGN_EXPIRY_SECONDS * 1000).toISOString();

  const policy = {
    expiration,
    conditions: [
      { bucket: cfg.bucket },
      ["starts-with", "$key", objectKey],
      { "Content-Type": contentType },
      ["content-length-range", 0, maxBytes],
      { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
      { "x-amz-credential": credential },
      { "x-amz-date": amzDate },
    ],
  };
  const policyBase64 = btoa(JSON.stringify(policy));
  const signingKey = await deriveSigningKey(cfg.secretKey, dateStamp, cfg.region);
  const signature = toHex(await hmacSha256(signingKey, policyBase64));

  return {
    postUrl: `${cfg.endpoint}/${cfg.bucket}`,
    formFields: {
      key: objectKey,
      "Content-Type": contentType,
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": credential,
      "x-amz-date": amzDate,
      policy: policyBase64,
      "x-amz-signature": signature,
    },
  };
}

export async function handleTicketAttachmentsRoute(
  req: Request,
  path: string,
  context: GatewayContext
): Promise<Response | null> {
  if (path !== "/ticket-attachments/presign") return null;
  if (req.method !== "POST") return null;

  const authResult = await context.requireAuth(req);
  if (isResponse(authResult)) return authResult;

  const cfg = readMinioConfig();
  if (!cfg) return jsonError("attachments not configured", 503);

  const parsed = await parseBody(req, PresignRequestSchema);
  if (!parsed.ok) return parsed.res;
  const { fileName, contentType, sizeBytes } = parsed.data;

  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return jsonError("file exceeds 10MB limit", 413);
  }
  if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
    return jsonError("only image and video attachments are supported", 400);
  }

  const objectKey = `${authResult.user.id}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
  const { postUrl, formFields } = await presignPost(
    cfg,
    objectKey,
    contentType,
    MAX_ATTACHMENT_BYTES
  );
  const objectUrl = `${cfg.publicBaseUrl}/${cfg.bucket}/${objectKey}`;

  return json(
    {
      postUrl,
      formFields,
      objectUrl,
      objectKey,
      expiresAt: Date.now() + PRESIGN_EXPIRY_SECONDS * 1000,
    },
    200
  );
}

export const _internalForTests = { sha256Hex, sanitizeFileName, readMinioConfig };
