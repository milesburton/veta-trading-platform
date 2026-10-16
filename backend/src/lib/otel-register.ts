import { deriveServiceName } from "./service-name.ts";

if ((process.env.OTEL_ENABLED ?? "").toLowerCase() === "true") {
  process.env.OTEL_SERVICE_NAME ||= deriveServiceName();
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ||= "http";
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
  const { UndiciInstrumentation } = await import("@opentelemetry/instrumentation-undici");
  const sdk = new NodeSDK({
    instrumentations: [new HttpInstrumentation(), new UndiciInstrumentation()],
  });
  sdk.start();
  const shutdown = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
