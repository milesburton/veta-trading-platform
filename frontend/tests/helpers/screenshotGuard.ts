import type { Locator, Page } from "@playwright/test";

export interface ErrorMarker {
  label: string;
  text: RegExp;
}

export const ERROR_MARKERS: ErrorMarker[] = [
  { label: "flexlayout render error", text: /Error rendering component/i },
  { label: "app error boundary", text: /Something went wrong/i },
  { label: "news-aggregator unreachable", text: /Could not reach news-aggregator/i },
  { label: "advisory unreachable", text: /Could not reach llm-advisory/i },
];

function isLocator(scope: Page | Locator): scope is Locator {
  return typeof (scope as Locator).elementHandle === "function";
}

export async function findErrorMarkers(scope: Page | Locator): Promise<string[]> {
  const text = isLocator(scope)
    ? await scope.evaluate((node) => (node as HTMLElement).innerText ?? "").catch(() => "")
    : await scope.evaluate(() => document.body.innerText ?? "").catch(() => "");
  if (!text) return [];
  const hits: string[] = [];
  for (const m of ERROR_MARKERS) {
    if (m.text.test(text)) hits.push(m.label);
  }
  return hits;
}
