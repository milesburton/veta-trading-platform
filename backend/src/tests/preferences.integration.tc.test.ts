/**
 * Preferences persistence through the gateway (testcontainers).
 *
 * Proves the full round-trip a trader's UI state depends on: browser cookie ->
 * gateway requireAuth -> user-service -> Postgres -> read back. This is the
 * path that silently broke when frontend prefs fetches dropped
 * credentials:"include": the session cookie never reached the gateway, every
 * write 401'd, and theme / grid / workspace state was lost on reload. A mocked
 * fetch can't catch that because the bug is the absence of the real cookie.
 *
 * The "no cookie" steps are the regression guard: they assert the gateway
 * rejects unauthenticated prefs traffic with 401, which is exactly what the
 * browser produced when credentials were omitted. If the frontend convention
 * is ever broken again, these are the conditions under which trades silently
 * stop persisting.
 *
 * Gated behind RUN_TESTCONTAINERS=1.
 */
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 10_000) => AbortSignal.timeout(ms);
const ORIGIN = "http://localhost:5173";

function gatewayUrl(stack: TestStack): string {
  const u = stack.urls.gateway;
  if (!u) throw new Error("gateway URL not in stack");
  return u;
}

async function getPrefs(gw: string, cookie?: string): Promise<Response> {
  return await fetch(`${gw}/preferences`, {
    headers: cookie ? { Cookie: `veta_user=${cookie}` } : {},
    signal: T(),
  });
}

async function putPrefs(
  gw: string,
  body: unknown,
  cookie?: string,
  origin: string | null = ORIGIN,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = `veta_user=${cookie}`;
  if (origin) headers.Origin = origin;
  return await fetch(`${gw}/preferences`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
    signal: T(),
  });
}

Deno.test({
  name:
    "preferences (testcontainers): persist through gateway only with the session cookie",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack: TestStack = await startStack({
      services: ["user-service", "gateway"],
      startupTimeoutMs: 60_000,
    });
    try {
      const gw = gatewayUrl(stack);
      const cookie = await login(stack, "alice");

      await t.step(
        "authenticated PUT then GET round-trips the full preference blob",
        async () => {
          const prefs = {
            theme: "high-contrast",
            orderTicketWindowSize: { w: 512, h: 800 },
            gridPrefs: {
              orderBlotter: { sortField: "createdAt", sortDir: "desc" },
            },
            workspaces: [{ id: "ws-1", name: "Main Desk" }],
            layouts: { "ws-1": { layout: { type: "row", children: [] } } },
          };

          const put = await putPrefs(gw, prefs, cookie);
          assertEquals(put.status, 200, "authenticated PUT should persist");
          await put.body?.cancel();

          const get = await getPrefs(gw, cookie);
          assertEquals(get.status, 200, "authenticated GET should read back");
          const blob = (await get.json()) as typeof prefs;
          assertEquals(blob.theme, "high-contrast");
          assertEquals(blob.orderTicketWindowSize, { w: 512, h: 800 });
          assertEquals(blob.gridPrefs, prefs.gridPrefs);
          assertEquals(blob.workspaces, prefs.workspaces);
          assertEquals(blob.layouts, prefs.layouts);
        },
      );

      await t.step(
        "a second authenticated PUT overwrites prior state",
        async () => {
          const put = await putPrefs(
            gw,
            { theme: "darker", workspaces: [] },
            cookie,
          );
          assertEquals(put.status, 200);
          await put.body?.cancel();

          const get = await getPrefs(gw, cookie);
          assertEquals(get.status, 200);
          const blob = (await get.json()) as {
            theme: string;
            workspaces: unknown[];
          };
          assertEquals(blob.theme, "darker");
          assertEquals(blob.workspaces, []);
        },
      );

      await t.step(
        "GET without the session cookie is rejected with 401",
        async () => {
          const get = await getPrefs(gw);
          assertEquals(
            get.status,
            401,
            "anonymous GET must not read another user's prefs",
          );
          await get.body?.cancel();
        },
      );

      await t.step(
        "PUT without the session cookie is rejected and does not persist",
        async () => {
          const put = await putPrefs(gw, { theme: "light" }, undefined);
          assert(
            put.status === 401 || put.status === 403,
            `anonymous PUT must be rejected, got ${put.status}`,
          );
          await put.body?.cancel();

          const get = await getPrefs(gw, cookie);
          assertEquals(get.status, 200);
          const blob = (await get.json()) as { theme: string };
          assertEquals(
            blob.theme,
            "darker",
            "anonymous PUT must not have mutated stored prefs",
          );
        },
      );

      await t.step(
        "authenticated PUT from a disallowed origin is rejected by CSRF",
        async () => {
          const put = await putPrefs(
            gw,
            { theme: "light" },
            cookie,
            "http://evil.example",
          );
          assertEquals(
            put.status,
            403,
            "cross-origin write must be blocked even with a valid cookie",
          );
          await put.body?.cancel();

          const get = await getPrefs(gw, cookie);
          const blob = (await get.json()) as { theme: string };
          assertEquals(
            blob.theme,
            "darker",
            "CSRF-blocked PUT must not have mutated stored prefs",
          );
        },
      );
    } finally {
      await stack.teardown();
    }
  },
});
