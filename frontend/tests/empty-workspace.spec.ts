import { expect } from "@playwright/test";
import { traderTest } from "./helpers/fixtures";
import { findOverflows } from "./helpers/visualAnomalies.ts";

// The empty-workspace chooser ("Choose a layout to get started") must flow its
// template cards across the available width and, when the cards exceed the
// viewport height, scroll rather than clip. Regression cover for both.

async function openEmptyWorkspace(app: import("./helpers/pages/AppPage.ts").AppPage) {
  await app.page.getByTestId("add-workspace-btn").click();
  await app.page.getByText("Choose a layout to get started").waitFor({ state: "visible" });
}

traderTest("empty workspace: cards flow across the screen without overflow", async ({ app }) => {
  await openEmptyWorkspace(app);

  // Cards are visible and laid out across the width (more than one column on a
  // wide viewport means they flowed rather than stacking in a narrow box).
  const cards = app.page.locator("button", { hasText: "Full Dashboard" });
  await expect(cards.first()).toBeVisible();

  const overflows = await findOverflows(app.page);
  expect(overflows, JSON.stringify(overflows, null, 2)).toHaveLength(0);

  await expect(app.page.locator("body")).toHaveScreenshot("empty-workspace-wide.png", {
    maxDiffPixelRatio: 0.02,
  });
});

traderTest("empty workspace: scrolls instead of clipping on a short viewport", async ({ app }) => {
  await app.page.setViewportSize({ width: 1280, height: 360 });
  await openEmptyWorkspace(app);

  // The chooser's scroll container is the element with the overflow-y-auto.
  // On a short viewport the cards exceed its height, so it must be scrollable
  // (scrollHeight > clientHeight) rather than clipping content with no scroll.
  const scroller = app.page
    .locator("text=Choose a layout to get started")
    .locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')]")
    .first();
  await expect(scroller).toBeVisible();

  const { scrollable, lastCardReachable } = await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    const cards = el.querySelectorAll("button");
    const last = cards[cards.length - 1] as HTMLElement | undefined;
    const elBox = el.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    return {
      scrollable: el.scrollHeight > el.clientHeight,
      lastCardReachable: lastBox ? lastBox.bottom <= elBox.bottom + 1 : false,
    };
  });

  // Content overflows the viewport (the bug) — but the container scrolls and
  // the last card can be scrolled fully into view (the fix).
  expect(scrollable).toBe(true);
  expect(lastCardReachable).toBe(true);

  await expect(app.page.locator("body")).toHaveScreenshot("empty-workspace-short.png", {
    maxDiffPixelRatio: 0.02,
  });
});
