import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals, assertRejects } from "#veta/test-assert";
import { createS3Client } from "../lib/s3.ts";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = createS3Client(
  { endpoint: "http://minio:9000", bucket: "audit", accessKey: "AK", secretKey: "SK" },
  () => new Date("2026-01-02T03:04:05.678Z")
);

test("[s3] signs a PUT with the object body and scoped credentials", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 200 }));
  await client.putObject("anchors/a b.json", '{"seq":1}');

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  assertEquals(url, "http://minio:9000/audit/anchors/a%20b.json");
  assertEquals(init.method, "PUT");
  assertEquals(init.body, '{"seq":1}');
  const headers = init.headers as Record<string, string>;
  assertEquals(headers["x-amz-date"], "20260102T030405Z");
  assert(headers.authorization.includes("Credential=AK/20260102/us-east-1/s3/aws4_request"));
  assert(headers.authorization.includes("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
});

test("[s3] reads an object and sends no body on GET", async () => {
  fetchMock.mockResolvedValue(new Response("payload", { status: 200 }));
  assertEquals(await client.getObject("k"), "payload");
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  assertEquals(init.method, "GET");
  assertEquals("body" in init, false);
});

test("[s3] surfaces non-2xx responses as errors", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 403 }));
  await assertRejects(() => client.putObject("k", "x"), Error, "S3 PUT k returned 403");
  await assertRejects(() => client.getObject("k"), Error, "S3 GET k returned 403");
  await assertRejects(() => client.listKeys("p/"), Error, "S3 LIST p/ returned 403");
});

test("[s3] follows continuation tokens when listing keys", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        "<Key>a/1</Key><Key>a/2</Key><NextContinuationToken>tok+1</NextContinuationToken>",
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(new Response("<Key>a/3</Key>", { status: 200 }));

  assertEquals(await client.listKeys("a/"), ["a/1", "a/2", "a/3"]);
  const first = fetchMock.mock.calls[0][0] as string;
  const second = fetchMock.mock.calls[1][0] as string;
  assert(first.includes("list-type=2") && first.includes("prefix=a%2F"));
  assert(second.includes("continuation-token=tok%2B1"));
});

test("[s3] honours an explicit region", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 200 }));
  const regional = createS3Client({
    endpoint: "http://minio:9000",
    bucket: "b",
    accessKey: "AK",
    secretKey: "SK",
    region: "eu-west-2",
  });
  await regional.putObject("k", "x");
  const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
  assert(headers.authorization.includes("/eu-west-2/s3/aws4_request"));
});
