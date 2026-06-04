import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BugReportModal } from "@veta/frontend/components/BugReportModal";
import { gatewayApi } from "@veta/frontend/store/gatewayApi";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSubmit = vi.fn();

vi.mock("@veta/frontend/store/gatewayApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@veta/frontend/store/gatewayApi")>();
  return {
    ...original,
    useSubmitBugReportMutation: () => [mockSubmit, { isLoading: false }],
  };
});

function renderModal(open = true) {
  const store = configureStore({
    reducer: { [gatewayApi.reducerPath]: gatewayApi.reducer },
    middleware: (m) => m().concat(gatewayApi.middleware),
  });
  const onClose = vi.fn();
  const utils = render(
    <Provider store={store}>
      <BugReportModal open={open} onClose={onClose} />
    </Provider>
  );
  return { ...utils, onClose };
}

describe("BugReportModal", () => {
  beforeEach(() => {
    mockSubmit.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when closed", () => {
    renderModal(false);
    expect(screen.queryByTestId("bug-report-modal")).toBeNull();
  });

  it("renders title, category, description, and submit when open", () => {
    renderModal();
    expect(screen.getByTestId("bug-report-modal")).toBeInTheDocument();
    expect(screen.getByTestId("bug-report-title")).toBeInTheDocument();
    expect(screen.getByTestId("bug-report-category")).toBeInTheDocument();
    expect(screen.getByTestId("bug-report-description")).toBeInTheDocument();
    expect(screen.getByTestId("bug-report-submit")).toBeInTheDocument();
  });

  it("rejects too-short title locally without calling the API", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "ab" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Something has happened that doesn't seem right." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/at least 3/i);
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects too-short description locally", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), { target: { value: "tiny" } });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/at least 10/i);
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("submits with title, description, category, and url on success", async () => {
    mockSubmit.mockResolvedValueOnce({ data: { ok: true } });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), {
      target: { value: "Real bug title" },
    });
    fireEvent.change(screen.getByTestId("bug-report-category"), { target: { value: "data" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "The blotter shows yesterday's fills as today's." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });
    const arg = mockSubmit.mock.calls[0][0];
    expect(arg.title).toBe("Real bug title");
    expect(arg.category).toBe("data");
    expect(arg.description).toMatch(/blotter/);
    expect(typeof arg.url).toBe("string");
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-success")).toBeInTheDocument();
    });
  });

  it("shows the friendly 'received but not delivered' message on 202", async () => {
    mockSubmit.mockResolvedValueOnce({ data: { ok: false, error: "webhook not configured" } });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-success")).toBeInTheDocument();
    });
    expect(screen.getByText(/operator will pick it up|isn't configured/i)).toBeInTheDocument();
  });

  it("surfaces a 401 from the backend with a friendly message", async () => {
    mockSubmit.mockResolvedValueOnce({ error: { status: 401 } });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/sign in/i);
    });
  });

  it("closes via the X button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId("bug-report-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("submits only the pathname, never query strings", async () => {
    mockSubmit.mockResolvedValueOnce({ data: { ok: true } });
    const original = globalThis.location.pathname;
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboard", search: "?token=should-not-leak" },
      writable: true,
    });
    try {
      renderModal();
      fireEvent.change(screen.getByTestId("bug-report-title"), {
        target: { value: "Real bug title" },
      });
      fireEvent.change(screen.getByTestId("bug-report-description"), {
        target: { value: "Long-enough description of what happened." },
      });
      fireEvent.click(screen.getByTestId("bug-report-submit"));
      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledTimes(1);
      });
      const arg = mockSubmit.mock.calls[0][0];
      expect(arg.url).toBe("/dashboard");
      expect(arg.url).not.toContain("token");
    } finally {
      Object.defineProperty(window, "location", {
        value: { pathname: original, search: "" },
        writable: true,
      });
    }
  });
});
