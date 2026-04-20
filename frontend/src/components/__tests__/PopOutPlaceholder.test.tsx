import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PopOutPlaceholder } from "../PopOutPlaceholder";

const dispatch = vi.fn();

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
}));

describe("PopOutPlaceholder", () => {
  beforeEach(() => {
    dispatch.mockReset();
  });

  it("renders placeholder text and restore button", () => {
    render(<PopOutPlaceholder panelId={"order-ticket" as never} />);

    expect(screen.getByText(/Panel open in external window/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restore here/i })).toBeInTheDocument();
  });

  it("dispatches panelClosed action on restore", () => {
    render(<PopOutPlaceholder panelId={"order-ticket" as never} />);

    fireEvent.click(screen.getByRole("button", { name: /Restore here/i }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "windows/panelClosed",
        payload: { panelId: "order-ticket" },
      })
    );
  });
});
