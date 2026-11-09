import { afterEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const h = vi.hoisted(() => ({
  answers: [] as string[],
  questions: [] as string[],
  closed: 0,
}));

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: (prompt: string) => {
      h.questions.push(prompt);
      return Promise.resolve(h.answers.shift() ?? "");
    },
    close: () => {
      h.closed += 1;
    },
  }),
}));

const fetchMock = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  h.answers.length = 0;
  h.questions.length = 0;
  h.closed = 0;
  fetchMock.mockReset();
});

async function runCli(answers: string[]) {
  h.answers.push(...answers);
  vi.stubGlobal("fetch", fetchMock);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("../cli/trader.ts");
  await vi.waitFor(() => assertEquals(h.closed, 1));
  return log.mock.calls.map((c) => c.map(String).join(" "));
}

test("[cli] submits a limit order to the OMS using the prompted values", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "o1" }), { status: 200 }));
  const output = await runCli(["1", "MSFT", "2", "25", "99.5", "60"]);

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  assertEquals(url, "http://localhost:5002");
  assertEquals(JSON.parse(init.body as string), {
    asset: "MSFT",
    side: "SELL",
    quantity: 25,
    limitPrice: 99.5,
    expiresAt: 60,
  });
  assert(output.some((line) => line.includes("Trade Result")));
});

test("[cli] uses the defaults when answers are left blank", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  await runCli(["1", "", "1", "", "", ""]);
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  assertEquals(body, { asset: "AAPL", side: "BUY", quantity: 10, limitPrice: 150, expiresAt: 300 });
});

test("[cli] routes TWAP and POV strategies to their algo endpoints", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  await runCli(["2", "", "1", "", "", ""]);
  assertEquals(fetchMock.mock.calls[0][0], "http://localhost:5004");
});

test("[cli] routes POV orders to the POV algo", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  await runCli(["3", "", "1", "", "", ""]);
  assertEquals(fetchMock.mock.calls[0][0], "http://localhost:5005");
});

test("[cli] re-asks until a valid menu choice is given", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  const output = await runCli(["9", "x", "1", "", "1", "", "", ""]);
  assertEquals(output.filter((line) => line === "Invalid choice.").length, 2);
});

test("[cli] rejects a non-positive quantity, limit price or expiry without sending", async () => {
  assert((await runCli(["1", "", "1", "-5"])).some((l) => l.includes("Invalid quantity")));
  assertEquals(fetchMock.mock.calls.length, 0);
  vi.resetModules();
  h.closed = 0;
  assert((await runCli(["1", "", "1", "5", "abc"])).some((l) => l.includes("Invalid limit price")));
  vi.resetModules();
  h.closed = 0;
  assert((await runCli(["1", "", "1", "5", "5", "0"])).some((l) => l.includes("Invalid expiry")));
  assertEquals(fetchMock.mock.calls.length, 0);
});

test("[cli] reports an error response from the OMS", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 500, statusText: "Server Error" }));
  const output = await runCli(["1", "", "1", "", "", ""]);
  assert(output.some((line) => line.includes("500 Server Error")));
});

test("[cli] reports a network failure", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  const output = await runCli(["1", "", "1", "", "", ""]);
  assert(output.some((line) => line.includes("Failed to execute trade")));
});
