import { expect, test } from "@playwright/test";
import { traderTest } from "./helpers/fixtures";

test("homepage title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/VETA Trading Platform/);
});

traderTest("services dropdown layout does not overflow", async ({ page, app }) => {
  // The services status button should be visible in the header
  const servicesBtn = page.getByRole("button", { name: /Services/ });
  await expect(servicesBtn).toBeVisible();

  // Click to open the dropdown
  await servicesBtn.click();

  // Wait for the dropdown panel to appear with the Service Health header
  const dropdownPanel = page.locator(".z-20").filter({ hasText: /Service Health/ }).first();
  await expect(dropdownPanel).toBeVisible();

  // Verify table headers are present using more specific selectors
  const serviceHeader = page.getByRole("columnheader", { name: "Service" });
  const statusHeader = page.getByRole("columnheader", { name: "Status" });
  const versionHeader = page.getByRole("columnheader", { name: "Version" });
  const infoHeader = page.getByRole("columnheader", { name: "Info" });

  await expect(serviceHeader).toBeVisible();
  await expect(statusHeader).toBeVisible();
  await expect(versionHeader).toBeVisible();
  await expect(infoHeader).toBeVisible();

  // Verify that columns are properly laid out using table-fixed CSS
  const table = dropdownPanel.locator("table");
  const headerCells = table.locator("thead th");
  const expectedWidths = ["33%", "14%", "23%", "30%"];

  for (let i = 0; i < 4; i++) {
    const cell = headerCells.nth(i);
    const classAttr = await cell.getAttribute("class");
    expect(classAttr).toContain(`w-[${expectedWidths[i]}]`);
  }

  // Verify that truncate styling is present on cells that need them
  // This prevents long version hashes from overflowing into the Info column
  const dataRows = table.locator("tbody tr");
  const rowCount = await dataRows.count();
  expect(rowCount).toBeGreaterThan(0);

  const firstRow = dataRows.first();
  const versionCell = firstRow.locator("td").nth(2); // Version column
  const infoCellContainer = firstRow.locator("td").nth(3); // Info column

  // Version cell should have max-w-0 to enable text truncation
  let versionClasses = await versionCell.getAttribute("class");
  expect(versionClasses).toContain("max-w-0");

  // Info cell should have max-w-0 to enable text truncation
  let infoClasses = await infoCellContainer.getAttribute("class");
  expect(infoClasses).toContain("max-w-0");

  // Verify truncate is applied on child span in version column (prevents overflow)
  const versionSpan = versionCell.locator("span").first();
  const spanClasses = await versionSpan.getAttribute("class");
  expect(spanClasses).toContain("truncate");

  // Verify truncate is applied on child span in info column (prevents overflow)
  const infoSpan = infoCellContainer.locator("span").first();
  const infoSpanClasses = await infoSpan.getAttribute("class");
  expect(infoSpanClasses).toContain("truncate");

  // Verify that cells have title attributes for accessibility (tooltip on hover)
  expect(await versionSpan.getAttribute("title")).toBeTruthy();
  expect(await infoSpan.getAttribute("title")).toBeTruthy();
});
