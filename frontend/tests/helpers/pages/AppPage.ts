import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { AssetDef, AuthUser } from "../GatewayMock.ts";
import {
  ALGO_TRADER,
  ALGO_TRADER_LIMITS,
  ANALYST_LIMITS,
  DEFAULT_ADMIN,
  DEFAULT_TRADER,
  EXTERNAL_CLIENT_LIMITS,
  EXTERNAL_CLIENT_USER,
  FI_TRADER,
  FI_TRADER_LIMITS,
  GatewayMock,
  RESEARCH_ANALYST,
  SALES_LIMITS,
  SALES_USER,
} from "../GatewayMock.ts";
import { MarketLadderPage } from "./MarketLadderPage.ts";
import { OrderBlotterPage } from "./OrderBlotterPage.ts";
import { OrderTicketPage } from "./OrderTicketPage.ts";

export class AppPage {
  readonly page: Page;
  gateway!: GatewayMock;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(opts: { user?: AuthUser; assets?: AssetDef[]; url?: string } = {}): Promise<this> {
    this.gateway = await GatewayMock.attach(this.page, opts);
    await this.page.addInitScript(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("dashboard-layout") || key.startsWith("veta-layout")) {
          localStorage.removeItem(key);
        }
      }
    });
    await this.page.goto(opts.url ?? "/");
    return this;
  }

  async gotoAsTrader(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: DEFAULT_TRADER, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({ user: DEFAULT_TRADER });
    return this;
  }

  async gotoAsAdmin(): Promise<this> {
    await this.goto({ user: DEFAULT_ADMIN });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
    return this;
  }

  async gotoAsAlgoTrader(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: ALGO_TRADER, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({
      user: ALGO_TRADER,
      limits: ALGO_TRADER_LIMITS,
    });
    return this;
  }

  async gotoAsFiTrader(assets?: AssetDef[], workspace?: string): Promise<this> {
    const url = workspace ? `/?ws=${workspace}` : "/";
    await this.goto({ user: FI_TRADER, assets, url });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({
      user: FI_TRADER,
      limits: FI_TRADER_LIMITS,
    });
    await this.waitForAuthIdentity(FI_TRADER.name);
    return this;
  }

  async gotoAsAnalyst(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: RESEARCH_ANALYST, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({
      user: RESEARCH_ANALYST,
      limits: ANALYST_LIMITS,
    });
    return this;
  }

  async gotoAsSales(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: SALES_USER, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({
      user: SALES_USER,
      limits: SALES_LIMITS,
    });
    return this;
  }

  async gotoAsExternalClient(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: EXTERNAL_CLIENT_USER, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({
      user: EXTERNAL_CLIENT_USER,
      limits: EXTERNAL_CLIENT_LIMITS,
    });
    return this;
  }

  async waitForDashboard() {
    await this.waitForAppReady();
    await this.page
      .locator(".flexlayout__tab_button, .flexlayout__tab_button_stretch")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  async waitForAppReady() {
    await this.page.waitForLoadState("domcontentloaded");
    // Wait for the dashboard chrome instead of a more fragile intermediate.
    // The workspace toolbar is the strongest signal that the app shell is mounted.
    await this.page.getByTestId("workspace-toolbar").waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await this.waitForOverlayGone().catch(() => {
      // Some test views do not show the startup overlay; continue when toolbar is present.
    });
  }

  async waitForOverlayGone() {
    await this.page.waitForSelector('[data-testid="startup-overlay"]', {
      state: "detached",
      timeout: 15_000,
    });
  }

  async waitForAuthIdentity(userName: string) {
    // Wait for the user name to appear in the status bar — confirms Redux has
    // received the authIdentity message and both user + limits are in the store.
    await this.page
      .getByTestId("user-menu-btn")
      .getByText(userName)
      .waitFor({ state: "visible", timeout: 8_000 });
    // Wait for React to commit the re-render triggered by the new tradingStyle —
    // panels gated on trading style (e.g. spread-analysis requires fi_voice) show
    // a placeholder until DashboardLayout's renderTabSet callback re-executes.
    await this.page.waitForFunction(
      () =>
        !document.body.innerText.includes("You do not have permission to view this panel."),
      { timeout: 5_000 },
    );
  }

  /**
   * Wait until the market ladder has rendered live price content for at least
   * one asset row. Useful before taking screenshots so the captured frame
   * reflects a populated dashboard rather than empty placeholders. Returns
   * after seeing any tabular numeric content inside an asset-row, which is
   * what the market ladder renders once the first marketUpdate arrives.
   */
  async waitForLivePrices(opts: { timeoutMs?: number } = {}) {
    await this.page.waitForFunction(
      () => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="asset-row-"]'));
        return rows.some((row) => /\d+\.\d+/.test((row.textContent ?? "").trim()));
      },
      undefined,
      { timeout: opts.timeoutMs ?? 5_000 }
    );
  }

  async waitForLoginPage() {
    await expect(this.page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
      timeout: 8_000,
    });
  }

  async panelByTitle(tabTitle: string | RegExp): Promise<ReturnType<Page["locator"]>> {
    const btn = this.page
      .locator(".flexlayout__tab_button, .flexlayout__tab_button_stretch", { hasText: tabTitle })
      .first();
    const visible = await btn.isVisible().catch(() => false);

    const clickTab = async () => {
      await this.waitForOverlayGone().catch(() => {
        // Overlay may already be gone or not present in some routes.
      });
      try {
        await btn.click({ timeout: 5_000 });
      } catch {
        await this.page.waitForTimeout(150);
        await btn.click({ timeout: 5_000, force: true });
      }
    };

    if (visible) {
      await clickTab();
      await this.page.waitForTimeout(100);
      const btnPath = await btn.getAttribute("data-layout-path");
      if (btnPath) {
        const contentPath = btnPath.replace(/tb(\d+)$/, "t$1");
        return this.page.locator(`.flexlayout__tab[data-layout-path="${contentPath}"]`);
      }
    }

    const overflowBtn = this.page.locator(".flexlayout__tab_button_overflow");
    for (const overflow of await overflowBtn.all()) {
      if (!(await overflow.isVisible())) continue;
      await overflow.click();
      await this.page.waitForTimeout(200);
      const menuItem = this.page
        .locator(".flexlayout__popup_menu_item", { hasText: tabTitle })
        .first();
      if (await menuItem.isVisible().catch(() => false)) {
        await menuItem.click();
        await this.page.waitForTimeout(200);
        const activatedBtn = this.page
          .locator(".flexlayout__tab_button", { hasText: tabTitle })
          .first();
        await activatedBtn.waitFor({ state: "attached", timeout: 5_000 });
        const btnPath = await activatedBtn.getAttribute("data-layout-path");
        if (btnPath) {
          const contentPath = btnPath.replace(/tb(\d+)$/, "t$1");
          return this.page.locator(`.flexlayout__tab[data-layout-path="${contentPath}"]`);
        }
      }
      await this.page.keyboard.press("Escape");
    }

    await btn.waitFor({ state: "attached", timeout: 10_000 });
    await clickTab();
    await this.page.waitForTimeout(100);
    const btnPath = await btn.getAttribute("data-layout-path");
    if (!btnPath) throw new Error(`No tab button found with title matching ${tabTitle}`);
    const contentPath = btnPath.replace(/tb(\d+)$/, "t$1");
    return this.page.locator(`.flexlayout__tab[data-layout-path="${contentPath}"]`);
  }

  async getMarketLadder(): Promise<MarketLadderPage> {
    return new MarketLadderPage(await this.panelByTitle(/Market Ladder/i));
  }

  async getOrderTicket(): Promise<OrderTicketPage> {
    const existing = this.page
      .locator(".flexlayout__tab_button", { hasText: /(place trades)/i })
      .first();
    if (!(await existing.isVisible().catch(() => false))) {
      await this.page
        .getByTestId("component-picker")
        .getByRole("button", { name: /Add Panel/i })
        .click();
      await this.page.getByTestId("add-panel-order-ticket").click();
      await this.page.waitForTimeout(200);
    }
    const panel = await this.panelByTitle(/(place trades)/i);
    return new OrderTicketPage(panel, this.page);
  }

  async getOrderBlotter(): Promise<OrderBlotterPage> {
    return new OrderBlotterPage(await this.panelByTitle(/Orders.*active/i));
  }

  async expectUserVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeVisible({
      timeout: 5_000,
    });
  }

  async expectLoginPage() {
    await this.waitForLoginPage();
  }
}
