import { assertEquals } from "jsr:@std/assert@0.217";
import { FakeTime } from "jsr:@std/testing@0.217/time";
import { armConsumerIdleExit, armIdleExit } from "../shared/idle-exit.ts";

Deno.test("[armIdleExit] exits after timeoutMs with no touch()", () => {
  const time = new FakeTime();
  try {
    const exitCodes: number[] = [];
    armIdleExit(1_000, undefined, (code) => exitCodes.push(code));
    time.tick(999);
    assertEquals(exitCodes, []);
    time.tick(2);
    assertEquals(exitCodes, [0]);
  } finally {
    time.restore();
  }
});

Deno.test("[armIdleExit] touch() resets the timer", () => {
  const time = new FakeTime();
  try {
    const exitCodes: number[] = [];
    const { touch } = armIdleExit(1_000, undefined, (code) => exitCodes.push(code));
    time.tick(900);
    touch();
    time.tick(900);
    assertEquals(exitCodes, [], "should not have exited — touch() reset the 1000ms window");
    time.tick(200);
    assertEquals(exitCodes, [0]);
  } finally {
    time.restore();
  }
});

Deno.test("[armIdleExit] awaits onExit before exiting", async () => {
  const time = new FakeTime();
  try {
    const order: string[] = [];
    let resolveOnExit: () => void = () => {};
    const onExit = () =>
      new Promise<void>((resolve) => {
        resolveOnExit = () => {
          order.push("onExit");
          resolve();
        };
      });
    armIdleExit(1_000, onExit, () => order.push("exit"));
    time.tick(1_000);
    // Let the microtask queue drain up to the point onExit's promise is pending.
    await Promise.resolve();
    assertEquals(order, [], "exit() must not fire until onExit's promise resolves");
    resolveOnExit();
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(order, ["onExit", "exit"]);
  } finally {
    time.restore();
  }
});

Deno.test("[armIdleExit] still exits when onExit rejects", async () => {
  const time = new FakeTime();
  try {
    const exitCodes: number[] = [];
    const onExit = () => Promise.reject(new Error("cleanup failed"));
    armIdleExit(1_000, onExit, (code) => exitCodes.push(code));
    time.tick(1_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(exitCodes, [0], "a failing onExit must not prevent the process from exiting");
  } finally {
    time.restore();
  }
});

Deno.test("[armConsumerIdleExit] exits after timeoutMs with no touch()", () => {
  const time = new FakeTime();
  try {
    const exitCodes: number[] = [];
    armConsumerIdleExit(1_000, "test-consumer", (code) => exitCodes.push(code));
    time.tick(1_000);
    assertEquals(exitCodes, [0]);
  } finally {
    time.restore();
  }
});

Deno.test("[armConsumerIdleExit] touch() resets the timer", () => {
  const time = new FakeTime();
  try {
    const exitCodes: number[] = [];
    const { touch } = armConsumerIdleExit(1_000, "test-consumer", (code) => exitCodes.push(code));
    time.tick(900);
    touch();
    time.tick(900);
    assertEquals(exitCodes, []);
    time.tick(200);
    assertEquals(exitCodes, [0]);
  } finally {
    time.restore();
  }
});
