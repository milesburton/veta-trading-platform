import { describe, expect, it } from "vitest";
import { clearDraggedPanelId, draggedPanelId, setDraggedPanelId } from "../panelDragState";

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
