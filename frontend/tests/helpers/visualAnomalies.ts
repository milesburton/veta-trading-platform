import type { Page } from "@playwright/test";

export interface OverflowFinding {
  selector: string;
  text: string;
  axis: "x" | "y";
  scrollSize: number;
  clientSize: number;
  overflowBy: number;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  helpUrl: string;
  nodeCount: number;
  sampleSelector?: string;
}

export interface AnomalyReport {
  scenario: string;
  url: string;
  overflows: OverflowFinding[];
  axe: AxeViolation[];
}

const TOLERANCE_PX = 1;

export async function findOverflows(page: Page): Promise<OverflowFinding[]> {
  return page.evaluate((tolerance) => {
    function describe(el: Element): string {
      if (el instanceof HTMLElement && el.dataset.testid) {
        return `[data-testid="${el.dataset.testid}"]`;
      }
      const id = el.id ? `#${el.id}` : "";
      const cls =
        el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 2).join(".")}` : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    }

    function isVisible(el: Element): boolean {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") {
        return false;
      }
      if (el.classList.contains("sr-only")) return false;
      if (cs.position === "absolute" && (cs.clip !== "auto" || cs.clipPath !== "none")) {
        return false;
      }
      return true;
    }

    function shortText(el: Element): string {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      return t.length > 80 ? `${t.slice(0, 77)}...` : t;
    }

    const findings: OverflowFinding[] = [];
    const elements = document.querySelectorAll<HTMLElement>("body *");
    for (const el of elements) {
      if (!isVisible(el)) continue;
      const cs = getComputedStyle(el);
      // Only flag containers that are visibly clipping (not legitimate scrollers).
      if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") continue;

      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;

      if (dx > tolerance && cs.overflowX === "hidden") {
        findings.push({
          selector: describe(el),
          text: shortText(el),
          axis: "x",
          scrollSize: el.scrollWidth,
          clientSize: el.clientWidth,
          overflowBy: dx,
        });
      }
      if (dy > tolerance && cs.overflowY === "hidden") {
        findings.push({
          selector: describe(el),
          text: shortText(el),
          axis: "y",
          scrollSize: el.scrollHeight,
          clientSize: el.clientHeight,
          overflowBy: dy,
        });
      }
    }
    return findings;
  }, TOLERANCE_PX);
}
