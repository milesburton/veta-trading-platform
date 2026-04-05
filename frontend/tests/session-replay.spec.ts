import { expect, test } from "@playwright/test";
import { DEFAULT_ADMIN, GatewayMock } from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

test.describe("Session Replay panel", () => {
  test("renders Session Replay panel in administration workspace", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_ADMIN, url: "/?ws=ws-administration" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });

    const panel = await app.panelByTitle(/Session Replay/i);
    await expect(panel.getByText(/Session Replay/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("shows empty state when no sessions recorded", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_ADMIN, url: "/?ws=ws-administration" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });

    const panel = await app.panelByTitle(/Session Replay/i);
    await expect(
      panel.getByText(/No recorded sessions/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("admin user sees the recording toggle switch", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_ADMIN, url: "/?ws=ws-administration" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });

    const panel = await app.panelByTitle(/Session Replay/i);
    const toggle = panel.locator("button").filter({ has: page.locator("span.rounded-full.bg-white") });
    await expect(toggle.first()).toBeVisible({ timeout: 8_000 });
  });

  test("renders session table when sessions exist", async ({ page }) => {
    const app = new AppPage(page);
    app.gateway = await GatewayMock.attach(page, { user: DEFAULT_ADMIN });

    await page.route("/api/replay/sessions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessions: [
            {
              id: "sess-001",
              userId: "trader-1",
              userName: "Alice Chen",
              userRole: "trader",
              startedAt: new Date(Date.now() - 3600_000).toISOString(),
              endedAt: new Date(Date.now() - 1800_000).toISOString(),
              durationMs: 1800_000,
              metadata: {},
            },
            {
              id: "sess-002",
              userId: "admin-1",
              userName: "Admin User",
              userRole: "admin",
              startedAt: new Date(Date.now() - 600_000).toISOString(),
              endedAt: null,
              durationMs: null,
              metadata: {},
            },
          ],
          total: 2,
        }),
      })
    );

    await page.goto("/?ws=ws-administration");
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });

    const panel = await app.panelByTitle(/Session Replay/i);
    await expect(panel.getByText("Alice Chen")).toBeVisible({ timeout: 8_000 });
    await expect(panel.getByText("Admin User")).toBeVisible();
    await expect(panel.getByText("2 sessions total")).toBeVisible();
    await expect(panel.getByText("live")).toBeVisible();
  });
});
