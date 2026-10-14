import { assertEquals } from "jsr:@std/assert@0.217";
import {
  capToDepth,
  depthSliceCap,
  estimatedDepth,
} from "../algo/depth-cap.ts";

const tick = (volume: number | undefined): { volumes: Record<string, number> } => ({
  volumes: volume === undefined ? {} : { AAPL: volume },
});

Deno.test("estimatedDepth: scales tick volume by the depth ratio", () => {
  assertEquals(estimatedDepth(tick(10_000), "AAPL"), 5_000);
});

Deno.test("estimatedDepth: zero when the asset has no volume", () => {
  assertEquals(estimatedDepth(tick(undefined), "AAPL"), 0);
  assertEquals(estimatedDepth(tick(0), "AAPL"), 0);
});

Deno.test("depthSliceCap: participation fraction of estimated depth", () => {
  assertEquals(depthSliceCap(tick(10_000), "AAPL", 0.5), 2_500);
});

Deno.test("depthSliceCap: never below one share", () => {
  assertEquals(depthSliceCap(tick(1), "AAPL", 0.1), 1);
});

Deno.test("depthSliceCap: uncapped when depth is unknown", () => {
  assertEquals(
    depthSliceCap(tick(undefined), "AAPL"),
    Number.POSITIVE_INFINITY,
  );
});

Deno.test("capToDepth: leaves small slices alone", () => {
  assertEquals(capToDepth(100, tick(10_000), "AAPL", 0.5), 100);
});

Deno.test("capToDepth: trims slices that exceed visible depth", () => {
  assertEquals(capToDepth(16_667, tick(10_000), "AAPL", 0.5), 2_500);
});

Deno.test("capToDepth: illiquid name caps a fixed 1000 VWAP slice", () => {
  assertEquals(capToDepth(1_000, tick(1_282), "AAPL", 0.5), 320);
});

Deno.test("capToDepth: passes the request through when depth is unknown", () => {
  assertEquals(capToDepth(5_000, tick(undefined), "AAPL"), 5_000);
});
