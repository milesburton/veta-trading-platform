---
name: new-panel
description: Scaffold a new frontend dashboard panel with the generator so every coupling point stays in sync. Use when adding a flexlayout panel to the VETA dashboard — adding one by hand touches a component, a test, four Record<PanelId> maps, a registerPanel call, and a duplicate map in ComponentPicker, and missing any one fails the typecheck or silently drops the panel.
---

# Add a dashboard panel

The full procedure lives in the docs playbook and is the source of truth:
`docs/site/src/content/docs/development/playbooks/add-dashboard-panel.mdx`.

Always scaffold with the generator rather than editing the coupling points by hand:

```bash
cd frontend && deno task new:panel <panel-id> "<Title>" --desc "<description>"
```

`<panel-id>` is kebab-case. The generator is idempotent (re-running with the same id is a
no-op). It creates the component and its test and patches every `PanelId`-keyed map in
`panelRegistry.ts`, the `registerPanel` call in `panelComponents.ts`, and the description
map in `ComponentPicker.tsx`.

It deliberately does **not** place the panel into a workspace layout. After scaffolding:

1. Add the panel to a workspace in `frontend/src/components/dashboard/layoutModels.ts`.
2. Flesh out the component in `frontend/src/components/<PanelName>Panel.tsx`, and adjust the
   channel cap, trading-style restriction, or permissions in `panelRegistry.ts` if the
   defaults (cap 1, all read roles) are wrong.
3. Flesh out the test beyond the generated header/placeholder assertions.

Then verify: typecheck (catches any missing registry entry), the panel's vitest, and the
panel-walkthrough screenshot test if the panel is visual.
