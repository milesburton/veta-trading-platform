---
title: Visual anomalies
description: Non-gating Playwright suite that detects DOM overflows and accessibility violations. Catches bugs that pixel-diff regression misses.
---

The visual anomalies suite is informational, not gating. It walks 10 scenarios (login plus every persona's dashboard plus four theme variants of the trader dashboard) and reports two classes of problem that traditional pixel-diff testing misses.

**File:** [`frontend/tests/visual-anomalies.spec.ts`](https://github.com/milesburton/veta-trading-platform/blob/main/frontend/tests/visual-anomalies.spec.ts)
**Run:** `cd frontend && npx playwright test tests/visual-anomalies.spec.ts`
**Output:** `docs/visual-anomalies/report.json` (gitignored; regenerated per run)

## What it catches

### DOM overflows

`findOverflows()` walks the DOM and identifies every visible element where `scrollWidth > clientWidth` (or vertical equivalent) while a parent has `overflow: hidden`. This is the structural signature of:

- Text clipping inside fixed-width badges
- Truncated table cells
- Container sizing bugs where a flex child has grown past its parent
- Header chrome elements collapsing on narrow viewports

Pixel-diff screenshot regression cannot catch these because the previous screenshot was also wrong; the bug looks identical to its baseline.

Tolerance is **1px**. Elements with `clip` or `clip-path` are filtered out (legitimate visual trimming). Elements with the `sr-only` class are also skipped; those are intentionally clipped accessibility text for screen readers.

### Accessibility violations

`@axe-core/playwright` runs against the rendered page and reports WCAG and ARIA issues:

- Colour contrast failures (any text under 4.5:1, or large text under 3:1)
- `aria-*` misuse (invalid roles, contradictory `aria-hidden` with a focusable child, etc.)
- Link distinguishability (links that rely on colour alone to differ from surrounding text)
- Form labelling (inputs without an associated label)

The `region` rule is disabled because Starlight pages have their own landmark structure that does not pass axe's default heuristic.

## Scenarios run

Ten scenarios, all read-only navigations:

| Scenario | What gets captured |
|----------|-------------------|
| Login page | Pre-auth chrome, OAuth form |
| Trader dashboard | Default cash-equity workspace |
| Admin dashboard | Mission Control and admin panels |
| Algo trader dashboard | Algo workspace, child orders |
| FI trader dashboard | Fixed-income workspace |
| Analyst dashboard | Research analyst layout |
| Trader dashboard, dark theme | (theme variant) |
| Trader dashboard, OLED theme | (theme variant: `darker`) |
| Trader dashboard, light theme | (theme variant) |
| Trader dashboard, high-contrast theme | (theme variant) |

Theme variants exist because a dark-mode change can silently break contrast on individual labels. Capturing all four themes catches readability regressions before users encounter them.

## Report shape

`captureAnomalies(page, scenarioName)` returns and accumulates:

```typescript
type AnomalyReport = {
  scenario: string;
  url: string;
  overflows: Array<{
    selector: string;
    text: string;        // truncated content
    axis: "x" | "y";
    scrollSize: number;
    clientSize: number;
    overflowBy: number;
  }>;
  axe: Array<{
    id: string;
    impact: "minor" | "moderate" | "serious" | "critical";
    description: string;
    helpUrl: string;
    nodeCount: number;
    sampleSelectors: string[];   // first 3 affected elements
  }>;
};
```

After all tests run, the suite writes the array of reports to `docs/visual-anomalies/report.json`.

## In CI

The [`pr-visual-anomalies` job](https://github.com/milesburton/veta-trading-platform/blob/main/.github/workflows/ci.yml) runs the spec on every pull request, uploads the report JSON as an artefact, and posts a summary comment to the PR with the diff against the latest `main` run. This makes regressions visible to reviewers without blocking merge; the team can decide per-issue whether to address before or after merge.

## Adding a scenario

1. Add a new `test()` block inside `visual-anomalies.spec.ts`.
2. Drive the page to the state you want to inspect (log in as the appropriate user, navigate to the workspace, wait for the relevant panels to render).
3. Call `await captureAnomalies(page, "your-scenario-name")`.

Each added scenario costs roughly three to five seconds of CI time. This suite is already the second-slowest Playwright job after `panel-walkthrough`. Prefer coverage of an under-tested area (a new admin sub-view, for example) over additional theme variants of an already-covered view.

## Filing fixes

Do not fix violations from the report blindly. Some are intentional:

- `color-contrast` on a known disabled-state element is by design.
- `aria-allowed-attr` on an HTML element with a vendor extension may be a third-party library issue.

For each new finding, decide:

1. Is the underlying intent correct? (A button *should* be focusable; a label *should* be associated.)
2. Does the fix require restructuring the component, or only a class or attribute tweak?
3. Is there an accessibility-aware way to silence the rule that also documents the intent? (`aria-hidden="true"` plus alt text on the parent, for example.)

Then fix or annotate; do not blanket-suppress.
