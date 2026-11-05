import { deriveSigningKey, hmacSha256, sha256Hex, toHex } from "./sigv4.ts";

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

export interface S3Client {
  putObject: (key: string, body: string) => Promise<void>;
  listKeys: (prefix: string) => Promise<string[]>;
  getObject: (key: string) => Promise<string>;
}

function encodeKeyPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export function createS3Client(config: S3Config, now: () => Date = () => new Date()): S3Client {
  const region = config.region ?? "us-east-1";
  const host = new URL(config.endpoint).host;

  async function signedFetch(
    method: "GET" | "PUT",
    objectKey: string,
    query: Record<string, string>,
    body: string
  ): Promise<Response> {
    const stamp = now()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = stamp.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const payloadHash = await sha256Hex(body);
    const path = `/${config.bucket}${objectKey ? `/${encodeKeyPath(objectKey)}` : ""}`;
    const queryString = canonicalQuery(query);
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      path,
      queryString,
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${stamp}\n`,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonicalRequest)].join(
      "\n"
    );
    const signingKey = await deriveSigningKey(config.secretKey, dateStamp, region);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));
    const url = `${config.endpoint}${path}${queryString ? `?${queryString}` : ""}`;
    return fetch(url, {
      method,
      ...(method === "PUT" ? { body } : {}),
      headers: {
        "x-amz-date": stamp,
        "x-amz-content-sha256": payloadHash,
        authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  }

  return {
    async putObject(key, body) {
      const res = await signedFetch("PUT", key, {}, body);
      if (!res.ok) throw new Error(`S3 PUT ${key} returned ${res.status}`);
    },
    async getObject(key) {
      const res = await signedFetch("GET", key, {}, "");
      if (!res.ok) throw new Error(`S3 GET ${key} returned ${res.status}`);
      return res.text();
    },
    async listKeys(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const res = await signedFetch(
          "GET",
          "",
          {
            "list-type": "2",
            prefix,
            ...(token ? { "continuation-token": token } : {}),
          },
          ""
        );
        if (!res.ok) throw new Error(`S3 LIST ${prefix} returned ${res.status}`);
        const xml = await res.text();
        for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(match[1]);
        token = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
      } while (token);
      return keys;
    },
  };
}
