/**
 * OrderTicketPage — selectors and actions for the Order Ticket panel.
 */

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

  /** Ensure the dialog is open, reopening it via the header button if closed. */
  private async ensureOpen() {
    if (!this.page) return;
    const isVisible = await this.root.isVisible().catch(() => false);
    if (!isVisible) {
      await this.page.getByTestId("new-order-btn").click();
      await this.root.waitFor({ state: "visible", timeout: 5_000 });
    }
  }

  /** Fill and submit an order. Only overrides the fields you specify. */
  async fillOrder(
    { asset, side = "BUY", quantity, limitPrice, strategy = "LIMIT" }:
      OrderParams,
  ) {
    await this.ensureOpen();
    // Strategy
    await this.strategySelect.selectOption(strategy);

    // Side
    if (side === "BUY") await this.buyButton.click();
    else await this.sellButton.click();

    // Quantity
    if (quantity !== undefined) {
      await this.quantityInput.fill(String(quantity));
    }

    // Limit price
    if (limitPrice !== undefined) {
      await this.limitPriceInput.fill(String(limitPrice));
    }

    // Asset — type into the asset search input
    if (asset !== undefined) {
      const assetInput = this.root.locator(
        "input[placeholder], input[type='text']",
      ).first();
      await assetInput.fill(asset);
      // Wait for the suggestion and click it if a dropdown appears
      const option = this.root.getByRole("option", { name: asset }).first();
      const hasOption = await option.isVisible().catch(() => false);
      if (hasOption) await option.click();
    }
  }

  /** Click the submit button. */
  async submit() {
    await this.submitButton.click();
  }

  /** Fill the form and immediately submit. */
  async placeOrder(params: OrderParams) {
    await this.fillOrder(params);
    await this.submit();
  }

  /** Assert the submit button is enabled. */
  async expectSubmitEnabled() {
    await expect(this.submitButton).toBeEnabled({ timeout: 5_000 });
  }

  /** Assert the submit button is disabled (e.g. limit violation or admin role). */
  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled({ timeout: 5_000 });
  }

  /** Assert a limit warning message is visible. */
  async expectLimitWarning(textFragment: string | RegExp) {
    await expect(this.root.getByText(textFragment)).toBeVisible({
      timeout: 5_000,
    });
  }

  /** Assert success feedback is shown after submission. */
  async expectSuccessFeedback() {
    await expect(this.root.getByText(/Order submitted/i)).toBeVisible({
      timeout: 6_000,
    });
  }

  /** Assert the admin-cannot-trade notice is shown. */
  async expectAdminNotice() {
    await expect(this.root.getByText(/Admin account/i)).toBeVisible({
      timeout: 5_000,
    });
  }

  // ── Options mode helpers ───────────────────────────────────────────────────

  /** Click the Options instrument type tab. */
  async switchToOptions() {
    await this.root.getByRole("button", { name: "Options" }).click();
  }

  /** Click the Equity instrument type tab. */
  async switchToEquity() {
    await this.root.getByRole("button", { name: "Equity" }).click();
  }

  /** Enter a strike price and wait for the premium card to appear. */
  async enterStrikeAndWaitForQuote(strike: number, timeoutMs = 5_000) {
    const strikeInput = this.root.getByLabel(/Option strike price/i);
    await strikeInput.click();
    await strikeInput.fill(String(strike));
    await expect(this.root.getByLabel("Option premium")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  /** Click the PUT option type toggle button. */
  async selectPut() {
    await this.root.getByRole("button", { name: "PUT" }).click();
  }

  /** Click the CALL option type toggle button. */
  async selectCall() {
    await this.root.getByRole("button", { name: "CALL" }).click();
  }

  /** Click the options-mode submit button (aria-label starts with Submit). */
  async submitOption() {
    await this.root.getByRole("button", { name: /^Submit (BUY|SELL)/i }).click({
      force: true,
    });
  }

  /** Assert the option premium card is visible. */
  async expectPremiumCard(timeoutMs = 3_000) {
    await expect(this.root.getByLabel("Option premium")).toBeVisible({
      timeout: timeoutMs,
    });
  }

  /** Assert the rejection feedback for options is shown. */
  async expectOptionRejectionFeedback(timeoutMs = 5_000) {
    await expect(
      this.root.getByText(/Options not supported in this simulation/i),
    ).toBeVisible({ timeout: timeoutMs });
  }

  /** Assert the options submit button is enabled. */
  async expectOptionSubmitEnabled(timeoutMs = 3_000) {
    await expect(
      this.root.getByRole("button", { name: /^Submit (BUY|SELL)/i }),
    ).toBeEnabled({ timeout: timeoutMs });
  }

  /** Assert the strategy option with given name is in the DOM and disabled. */
  async expectStrategyOptionDisabled(namePattern: string | RegExp) {
    const option = this.root.getByRole("option", { name: namePattern });
    await expect(option).toBeAttached();
    await expect(option).toBeDisabled();
  }

  /** Assert the CALL button has aria-pressed state. */
  async expectCallPressed(pressed: boolean) {
    await expect(this.root.getByRole("button", { name: "CALL" }))
      .toHaveAttribute(
        "aria-pressed",
        String(pressed),
      );
  }

  // ── Bond mode helpers ──────────────────────────────────────────────────────

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

  /** Expose root locator for assertions not covered by helpers. */
  get locator() {
    return this.root;
  }
}
