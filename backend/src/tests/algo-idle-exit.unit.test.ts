import { assertEquals } from "jsr:@std/assert@0.217";
import { armAlgoIdleExit } from "../algo/common-http.ts";

Deno.test("[armAlgoIdleExit] does not exit while orders are pending, even past timeout", () => {
  const exitCodes: number[] = [];
  const { checkNow, stop } = armAlgoIdleExit(1_000, () => false, "test-algo", {
    exit: (code) => exitCodes.push(code),
  });
  try {
    checkNow();
    assertEquals(exitCodes, [], "must not exit while an order is still pending");
  } finally {
    stop();
  }
});

Deno.test("[armAlgoIdleExit] exits once quiescent and past the idle timeout", () => {
  const exitCodes: number[] = [];
  let now = 0;
  const realDateNow = Date.now;
  Date.now = () => now;
  const { checkNow, stop } = armAlgoIdleExit(1_000, () => true, "test-algo", {
    exit: (code) => exitCodes.push(code),
  });
  try {
    now += 500;
    checkNow();
    assertEquals(exitCodes, [], "must not exit before the idle timeout has elapsed");
    now += 600;
    checkNow();
    assertEquals(exitCodes, [0]);
  } finally {
    stop();
    Date.now = realDateNow;
  }
});

Deno.test("[armAlgoIdleExit] touch() resets the idle clock even when quiescent", () => {
  const exitCodes: number[] = [];
  let now = 0;
  const realDateNow = Date.now;
  Date.now = () => now;
  const { touch, checkNow, stop } = armAlgoIdleExit(1_000, () => true, "test-algo", {
    exit: (code) => exitCodes.push(code),
  });
  try {
    now += 900;
    touch();
    now += 900;
    checkNow();
    assertEquals(exitCodes, [], "touch() should have reset the idle window");
    now += 200;
    checkNow();
    assertEquals(exitCodes, [0]);
  } finally {
    stop();
    Date.now = realDateNow;
  }
});

Deno.test("[armAlgoIdleExit] becoming non-quiescent again blocks a previously-due exit", () => {
  const exitCodes: number[] = [];
  let now = 0;
  let quiescent = true;
  const realDateNow = Date.now;
  Date.now = () => now;
  const { checkNow, stop } = armAlgoIdleExit(1_000, () => quiescent, "test-algo", {
    exit: (code) => exitCodes.push(code),
  });
  try {
    now += 1_100;
    quiescent = false;
    checkNow();
    assertEquals(exitCodes, [], "a new order arrived — must not exit even though the timer expired");
  } finally {
    stop();
    Date.now = realDateNow;
  }
});
