import { assertEquals } from "jsr:@std/assert@0.217";
import {
  isProgramRunning,
  startProgram,
  stopProgram,
  type SupervisorctlRunner,
} from "../shared/supervisor-control.ts";

function fakeRunner(response: { ok: boolean; output: string }): {
  runner: SupervisorctlRunner;
  calls: string[][];
} {
  const calls: string[][] = [];
  const runner: SupervisorctlRunner = (args) => {
    calls.push(args);
    return Promise.resolve(response);
  };
  return { runner, calls };
}

Deno.test("[startProgram] invokes supervisorctl start <program>", async () => {
  const { runner, calls } = fakeRunner({ ok: true, output: "limit-algo: started" });
  const result = await startProgram("limit-algo", runner);
  assertEquals(calls, [["start", "limit-algo"]]);
  assertEquals(result, { ok: true, output: "limit-algo: started" });
});

Deno.test("[stopProgram] invokes supervisorctl stop <program>", async () => {
  const { runner, calls } = fakeRunner({ ok: true, output: "limit-algo: stopped" });
  const result = await stopProgram("limit-algo", runner);
  assertEquals(calls, [["stop", "limit-algo"]]);
  assertEquals(result, { ok: true, output: "limit-algo: stopped" });
});

Deno.test("[isProgramRunning] true when status output contains RUNNING", async () => {
  const { runner } = fakeRunner({ ok: true, output: "limit-algo RUNNING pid 123, uptime 0:01:00" });
  assertEquals(await isProgramRunning("limit-algo", runner), true);
});

Deno.test("[isProgramRunning] false when status output contains STOPPED", async () => {
  const { runner } = fakeRunner({ ok: true, output: "limit-algo STOPPED Not started" });
  assertEquals(await isProgramRunning("limit-algo", runner), false);
});

Deno.test("[isProgramRunning] false when the runner fails with no output", async () => {
  const { runner } = fakeRunner({ ok: false, output: "" });
  assertEquals(await isProgramRunning("limit-algo", runner), false);
});

Deno.test("[isProgramRunning] queries status for the given program", async () => {
  const { runner, calls } = fakeRunner({ ok: true, output: "RUNNING" });
  await isProgramRunning("analytics", runner);
  assertEquals(calls, [["status", "analytics"]]);
});
