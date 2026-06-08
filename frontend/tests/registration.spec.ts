import { expect, test } from "@playwright/test";
import { SAMPLE_ARCHETYPE_IDS_LIST, DEFAULT_READY_BODY } from "./helpers/constants.ts";

// The login page boots once /api/gateway/ready reports ready and the session
// check returns 401. Routes mirror auth.spec.ts: the broad catch-all is
// registered first, then the specific routes (Playwright gives precedence to
// the most recently registered matching route).
function routeBoot(page: import("@playwright/test").Page) {
  return (async () => {
    await page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    await page.route("**/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", version: "mock" }),
      })
    );
    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DEFAULT_READY_BODY),
      })
    );
    await page.route("**/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 401, body: "" })
    );
  })();
}

test.describe("Registration", () => {
  test("the trader-type picker offers every archetype", async ({ page }) => {
    await routeBoot(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
      timeout: 10_000,
    });

    const select = page.getByTestId("register-archetype");
    await expect(select).toBeVisible();
    const optionCount = await select.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
    for (const id of SAMPLE_ARCHETYPE_IDS_LIST) {
      await expect(select.locator(`option[value="${id}"]`)).toHaveCount(1);
    }
  });

  test("submitting sends the chosen archetype and reaches the dashboard", async ({ page }) => {
    let registeredArchetype: string | null = null;
    let sessionExists = false;

    await page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    await page.route("**/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", version: "mock" }),
      })
    );
    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEFAULT_READY_BODY) })
    );
    await page.route("**/oauth/register", async (route) => {
      const payload = route.request().postDataJSON() as { archetype?: string };
      registeredArchetype = payload?.archetype ?? null;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "newtrader",
          name: "New Trader",
          role: "trader",
          archetype: payload?.archetype,
        }),
      });
    });
    await page.route("**/oauth/authorize", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: "test-code",
          redirect_uri: "postmessage",
          expires_in: 60,
          scope: "trading",
        }),
      })
    );
    await page.route("**/oauth/token", (route) => {
      sessionExists = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": "veta_user=test-token; HttpOnly; Path=/; Max-Age=28800" },
        body: JSON.stringify({
          access_token: "test-token",
          token_type: "bearer",
          expires_in: 28800,
          scope: "trading",
          user: { id: "newtrader", name: "New Trader", role: "trader", avatar_emoji: "NT" },
        }),
      });
    });
    await page.route("**/api/user-service/sessions/me", (route) => {
      if (sessionExists) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "newtrader",
            name: "New Trader",
            role: "trader",
            avatar_emoji: "NT",
          }),
        });
      }
      return route.fulfill({ status: 401, body: "" });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("register-username").fill("newtrader");
    await page.getByTestId("register-display-name").fill("New Trader");
    await page.getByTestId("register-password").fill("longenough");
    await page.getByTestId("register-archetype").selectOption("derivatives-high-touch");
    await page.getByTestId("register-submit").click();

    await expect(page.getByRole("heading", { name: /^sign in$/i })).not.toBeVisible({
      timeout: 10_000,
    });
    expect(registeredArchetype).toBe("derivatives-high-touch");
  });
});
