import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

const GATEWAY = "/api/gateway";
const API = `${GATEWAY}/api`;

interface SubmitResult {
  event: string;
  clientOrderId: string;
  detail: unknown;
}

async function signInAs(browser: Browser, persona: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 30_000 });
  await page.close();
  return context;
}

async function livePrice(context: BrowserContext, symbol: string): Promise<number> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await context.request.get(`${API}/market-sim/prices`);
    if (res.ok()) {
      const body = (await res.json()) as Record<string, unknown>;
      const entry = body[symbol];
      const price =
        typeof entry === "number" ? entry : (entry as { price?: number } | undefined)?.price;
      if (typeof price === "number" && price > 0) return Math.round(price * 100) / 100;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`no live price for ${symbol} within 30s`);
}

async function submitOrder(
  context: BrowserContext,
  order: { asset: string; side: "BUY" | "SELL"; quantity: number; limitPrice: number },
): Promise<SubmitResult> {
  const page = await context.newPage();
  await page.goto("/");
  const clientOrderId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const result = await page.evaluate(
    ({ order, clientOrderId }) =>
      new Promise<{ event: string; detail: unknown }>((resolve, reject) => {
        const scheme = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${scheme}://${location.host}/ws/gateway`);
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error("no order response within 20s"));
        }, 20_000);
        const send = () =>
          ws.send(
            JSON.stringify({
              type: "submitOrder",
              payload: {
                clientOrderId,
                asset: order.asset,
                side: order.side,
                quantity: order.quantity,
                limitPrice: order.limitPrice,
                expiresAt: 60,
                strategy: "LIMIT",
                algoParams: { strategy: "LIMIT" },
              },
            }),
          );
        let sent = false;
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string) as { event: string; data?: unknown };
          if (msg.event === "authIdentity" && !sent) {
            sent = true;
            send();
          }
          if (msg.event === "orderAck" || msg.event === "orderRejected" || msg.event === "error") {
            clearTimeout(timer);
            ws.close();
            resolve({ event: msg.event, detail: msg.data ?? null });
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("websocket error"));
        };
      }),
    { order, clientOrderId },
  );
  await page.close();
  return { ...result, clientOrderId };
}

async function pollJson<T>(
  context: BrowserContext,
  path: string,
  predicate: (body: T) => boolean,
  timeoutMs = 30_000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    const res = await context.request.get(`${GATEWAY}${path}`);
    if (res.ok()) {
      const body = (await res.json()) as T;
      if (predicate(body)) return body;
      last = JSON.stringify(body).slice(0, 1500);
    } else {
      last = `status ${res.status()}`;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  console.log(`pollJson ${path} gave up, last body: ${last}`);
  return null;
}

interface JournalOrder {
  id: string;
  asset: string;
  side: string;
  quantity: number;
}

test.describe("deploy-gate order flow", () => {
  test("a trader's limit order is acknowledged, journalled and audited", async ({ browser }) => {
    const trader = await signInAs(browser, "alice");
    const price = await livePrice(trader, "AAPL");

    const submitted = await submitOrder(trader, {
      asset: "AAPL",
      side: "BUY",
      quantity: 1,
      limitPrice: price,
    });
    expect(submitted.event, JSON.stringify(submitted.detail)).toBe("orderAck");

    const orders = await pollJson<JournalOrder[]>(
      trader,
      "/orders?limit=500",
      (body) => Array.isArray(body) && body.some((o) => JSON.stringify(o).includes(submitted.clientOrderId)),
    );
    expect(orders, "order should appear in the journal within 30s").not.toBeNull();
    const journalled = orders?.find((o) => JSON.stringify(o).includes(submitted.clientOrderId));
    expect(journalled).toMatchObject({ asset: "AAPL", side: "BUY", quantity: 1 });
    await trader.close();

    const compliance = await signInAs(browser, "compliance");
    const audit = await pollJson<Array<{ action: string }>>(
      compliance,
      "/audit/events?limit=500",
      (body) =>
        Array.isArray(body) &&
        body.some(
          (e) => e.action === "order_submitted" && JSON.stringify(e).includes(submitted.clientOrderId),
        ),
    );
    expect(audit, "order should appear in the audit trail within 30s").not.toBeNull();

    const verify = await compliance.request.get(`${GATEWAY}/audit/verify`);
    expect(verify.status()).toBe(200);
    await compliance.close();
  });

  test("a trader cannot read the audit trail", async ({ browser }) => {
    const trader = await signInAs(browser, "alice");
    const res = await trader.request.get(`${GATEWAY}/audit/events`);
    expect(res.status()).toBe(403);
    await trader.close();
  });
});
