import {
  clearDraggedPanelId,
  draggedPanelId,
  setDraggedPanelId,
} from "@veta/frontend/components/panelDragState";
import { describe, expect, it } from "vitest";

describe("panelDragState", () => {
  it("stores and clears dragged panel id", () => {
    clearDraggedPanelId();
    expect(draggedPanelId).toBe("");

    setDraggedPanelId("market-depth");
    expect(draggedPanelId).toBe("market-depth");

    clearDraggedPanelId();
    expect(draggedPanelId).toBe("");
  });
});
