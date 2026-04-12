import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type Side = "BUY" | "SELL";
export type Strategy = "LIMIT" | "TWAP" | "POV" | "VWAP";

export interface OrderParams {
  asset?: string;
  side?: Side;
  quantity?: number;
  limitPrice?: number;
  strategy?: Strategy;
}

export class OrderTicketPage {
  constructor(
    private readonly root: Locator,
    private readonly page?: Page,
  ) {}

  get container(): Locator {
    return this.root;
  }

  private get form() {
    return this.root.locator("form").first();
  }
  private get strategySelect() {
    return this.root.getByLabel("Execution strategy");
  }
  private get quantityInput() {
    return this.root.getByLabel("Order quantity in shares");
  }
  private get limitPriceInput() {
    return this.root.getByLabel(/Limit Price/i);
  }
  private get buyButton() {
    return this.root.getByRole("button", { name: /^BUY$/i });
  }
  private get sellButton() {
    return this.root.getByRole("button", { name: /^SELL$/i });
  }
  private get submitButton() {
    return this.root.getByRole("button", { name: /submit|place order/i });
  }

  private async ensureOpen() {
    if (!this.page) return;
    const isVisible = await this.root.isVisible().catch(() => false);
    if (!isVisible) {
      await this.page.getByTestId("new-order-btn").click();
      await this.root.waitFor({ state: "visible", timeout: 5_000 });
    }
  }

  async fillOrder(
    { asset, side = "BUY", quantity, limitPrice, strategy = "LIMIT" }:
      OrderParams,
  ) {
    await this.ensureOpen();
    await this.strategySelect.selectOption(strategy);

    if (side === "BUY") await this.buyButton.click();
    else await this.sellButton.click();

    if (quantity !== undefined) {
      await this.quantityInput.fill(String(quantity));
    }

    if (limitPrice !== undefined) {
      await this.limitPriceInput.fill(String(limitPrice));
    }

    if (asset !== undefined) {
      const assetInput = this.root.locator(
        "input[placeholder], input[type='text']",
      ).first();
      await assetInput.fill(asset);
      const option = this.root.getByRole("option", { name: asset }).first();
      const hasOption = await option.isVisible().catch(() => false);
      if (hasOption) await option.click();
    }
  }

  async submit() {
    await this.submitButton.click();
  }

  async placeOrder(params: OrderParams) {
    await this.fillOrder(params);
    await this.submit();
  }

  async expectSubmitEnabled() {
    await expect(this.submitButton).toBeEnabled({ timeout: 5_000 });
  }

  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled({ timeout: 5_000 });
  }

  async expectLimitWarning(textFragment: string | RegExp) {
    await expect(this.root.getByText(textFragment)).toBeVisible({
      timeout: 5_000,
    });
  }

  async expectSuccessFeedback() {
    await expect(this.root.getByText(/Order submitted/i)).toBeVisible({
      timeout: 6_000,
    });
  }

  async expectAdminNotice() {
    await expect(this.root.getByText(/Admin account/i)).toBeVisible({
      timeout: 5_000,
    });
  }

  async switchToOptions() {
    await this.root.getByRole("button", { name: "Options" }).click();
  }

  async switchToEquity() {
    await this.root.getByRole("button", { name: "Equity" }).click();
  }

  async enterStrikeAndWaitForQuote(strike: number, timeoutMs = 5_000) {
    const strikeInput = this.root.getByLabel(/Option strike price/i);
    await strikeInput.click();
    await strikeInput.fill(String(strike));
    await expect(this.root.getByLabel("Option premium")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async selectPut() {
    await this.root.getByRole("button", { name: "PUT" }).click();
  }

  async selectCall() {
    await this.root.getByRole("button", { name: "CALL" }).click();
  }

  async submitOption() {
    await this.root.getByRole("button", { name: /^Submit (BUY|SELL)/i }).click({
      force: true,
    });
  }

  async expectPremiumCard(timeoutMs = 3_000) {
    await expect(this.root.getByLabel("Option premium")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async expectOptionRejectionFeedback(timeoutMs = 5_000) {
    await expect(
      this.root.getByText(/Options not supported in this simulation/i),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async expectOptionSubmitEnabled(timeoutMs = 3_000) {
    await expect(
      this.root.getByRole("button", { name: /^Submit (BUY|SELL)/i }),
    ).toBeEnabled({ timeout: timeoutMs });
  }

  async expectStrategyOptionDisabled(namePattern: string | RegExp) {
    const option = this.root.getByRole("option", { name: namePattern });
    await expect(option).toBeAttached();
    await expect(option).toBeDisabled();
  }

  async expectCallPressed(pressed: boolean) {
    await expect(this.root.getByRole("button", { name: "CALL" }))
      .toHaveAttribute(
        "aria-pressed",
        String(pressed),
      );
  }

  async switchToBond() {
    await this.root.getByRole("button", { name: "Bond" }).click();
  }

  async selectBond(symbol: string) {
    await this.root.locator("#bondSymbol").selectOption(symbol);
  }

  async enterBondYield(yld: number) {
    const input = this.root.locator("#bondYield");
    await input.fill(String(yld));
    await input.dispatchEvent("input");
  }

  async waitForBondQuote(timeoutMs = 5_000) {
    await expect(this.root.getByLabel("Bond price")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async expectBondQuoteCard(timeoutMs = 3_000) {
    await expect(this.root.getByLabel("Bond price")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async expectBondSubmitEnabled(timeoutMs = 5_000) {
    await expect(this.root.getByTestId("submit-order-btn")).toBeEnabled({
      timeout: timeoutMs,
    });
  }

  async submitBond() {
    await this.root.getByTestId("submit-order-btn").click({ force: true });
  }

  async expectBondOrderSubmitted() {
    await expect(this.root.getByText(/Bond order submitted/i)).toBeVisible({
      timeout: 6_000,
    });
  }

  get locator() {
    return this.root;
  }
}
