import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export type OrderStatus =
  | "queued"
  | "executing"
  | "filled"
  | "expired"
  | "rejected";

export class OrderBlotterPage {
  constructor(private readonly root: Locator) {}

  private get table() {
    return this.root.locator("table");
  }

  orderRows() {
    return this.table.locator("tbody tr[aria-selected]");
  }

  rowByIdPrefix(prefix: string) {
    return this.table.locator("tbody tr[aria-selected]").filter({
      hasText: prefix,
    });
  }

  async waitForStatus(status: OrderStatus, timeoutMs = 8_000) {
    await expect(
      this.root.locator(`span:has-text("${status}")`),
    ).toBeVisible({ timeout: timeoutMs });
  }

  async latestOrderStatus(): Promise<string> {
    const rows = this.orderRows();
    const count = await rows.count();
    if (count === 0) throw new Error("No order rows in blotter");
    const lastRow = rows.last();
    const badge = lastRow.locator("span.uppercase").first();
    return (await badge.textContent())?.toLowerCase().trim() ?? "";
  }

  async statusOf(idPrefix: string): Promise<string> {
    const row = this.rowByIdPrefix(idPrefix);
    const badge = row.locator("span.uppercase").first();
    return (await badge.textContent())?.toLowerCase().trim() ?? "";
  }

  async expectHasOrders() {
    await expect(this.orderRows().first()).toBeVisible({ timeout: 8_000 });
  }

  async expectEmpty() {
    await expect(this.root.getByText(/No orders submitted yet/i)).toBeVisible({
      timeout: 5_000,
    });
  }

  async expectLatestStatus(status: OrderStatus) {
    await expect(async () => {
      const s = await this.latestOrderStatus();
      expect(s).toBe(status);
    }).toPass({ timeout: 8_000 });
  }

  async expectAssetVisible(asset: string) {
    await expect(
      this.table.locator("tbody td").filter({ hasText: asset }).first(),
    ).toBeVisible({ timeout: 6_000 });
  }
}
