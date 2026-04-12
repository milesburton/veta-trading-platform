import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class MarketLadderPage {
  constructor(private readonly root: Locator) {}

  rows() {
    return this.root.getByRole("listitem");
  }

  rowForSymbol(symbol: string) {
    return this.root.getByRole("listitem").filter({ hasText: symbol }).first();
  }

  async waitForSymbol(symbol: string) {
    await expect(this.rowForSymbol(symbol)).toBeVisible({ timeout: 8_000 });
  }

  async selectSymbol(symbol: string) {
    await this.rowForSymbol(symbol).click();
  }

  async getPriceText(symbol: string): Promise<string> {
    const row = this.rowForSymbol(symbol);
    const priceCell = row.locator(".tabular-nums").nth(2);
    return (await priceCell.textContent()) ?? "";
  }

  async getPriceColour(symbol: string): Promise<"up" | "down" | "neutral"> {
    const row = this.rowForSymbol(symbol);
    const priceSpan = row.locator(".tabular-nums").nth(2);
    const cls = await priceSpan.getAttribute("class") ?? "";
    if (cls.includes("emerald")) return "up";
    if (cls.includes("red")) return "down";
    return "neutral";
  }

  async expectVisible(symbol: string) {
    const row = this.rowForSymbol(symbol);
    await expect(row).toBeVisible({ timeout: 8_000 });
    const bb = await row.boundingBox();
    expect(bb?.width).toBeGreaterThan(0);
    expect(bb?.height).toBeGreaterThan(0);
  }

  async expectPositiveChange(symbol: string) {
    const row = this.rowForSymbol(symbol);
    const changeBadge = row.locator(".text-emerald-400").last();
    await expect(changeBadge).toBeVisible({ timeout: 5_000 });
  }

  async expectNegativeChange(symbol: string) {
    const row = this.rowForSymbol(symbol);
    const changeBadge = row.locator(".text-red-400").last();
    await expect(changeBadge).toBeVisible({ timeout: 5_000 });
  }
}
