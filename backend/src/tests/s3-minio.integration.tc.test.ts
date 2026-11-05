import { GenericContainer, Wait } from "testcontainers";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { createS3AnchorStore } from "../gateway/audit-anchor.ts";
import { createS3Client } from "../lib/s3.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";
const IMAGE = "minio/minio:RELEASE.2025-04-08T15-41-24Z";

test({
  name: "s3: the signed client stores and finds the newest anchor on a real MinIO",
  ignore: !SHOULD_RUN,
  async fn() {
    const container = await new GenericContainer(IMAGE)
      .withExposedPorts(9000)
      .withEnvironment({ MINIO_ROOT_USER: "veta", MINIO_ROOT_PASSWORD: "test-password-123" })
      .withCommand(["server", "/data"])
      .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
      .withStartupTimeout(60_000)
      .start();
    try {
      const s3 = createS3Client({
        endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
        accessKey: "veta",
        secretKey: "test-password-123",
        bucket: "audit-anchors",
      });
      const createBucket = () => s3.putObject("", "");
      await createBucket();
      const store = createS3AnchorStore(s3);
      assertEquals(await store.latest(), null);
      await store.put({ seq: 9, hash: "a".repeat(64) });
      await store.put({ seq: 100, hash: "b".repeat(64) });
      assertEquals(await store.latest(), { seq: 100, hash: "b".repeat(64) });
    } finally {
      await container.stop();
    }
  },
});
