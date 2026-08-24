import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BugReportModal } from "@veta/frontend/components/BugReportModal";
import { gatewayApi } from "@veta/frontend/store/gatewayApi";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSubmit = vi.fn();
const mockPresign = vi.fn();

vi.mock("@veta/frontend/store/gatewayApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@veta/frontend/store/gatewayApi")>();
  return {
    ...original,
    useSubmitBugReportMutation: () => [mockSubmit, { isLoading: false }],
    usePresignTicketAttachmentMutation: () => [mockPresign, { isLoading: false }],
  };
});

vi.mock("@veta/frontend/lib/ticketAttachmentUpload.ts", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@veta/frontend/lib/ticketAttachmentUpload.ts")>();
  return {
    ...original,
    uploadAttachment: vi.fn().mockResolvedValue(undefined),
    captureScreenshotBlob: vi.fn(),
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
    mockPresign.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when closed", () => {
    renderModal(false);
    expect(screen.queryByTestId("bug-report-modal")).toBeNull();
  });

  it("renders type, title, category, description, and submit when open", () => {
    renderModal();
    expect(screen.getByTestId("bug-report-modal")).toBeInTheDocument();
    expect(screen.getByLabelText("Feature")).toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText("Feature"));
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "The blotter shows yesterday's fills as today's." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });
    const arg = mockSubmit.mock.calls[0][0];
    expect(arg.kind).toBe("feature");
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
    expect(screen.getByText(/no external ticket sink/i)).toBeInTheDocument();
  });

  it("does not claim Support was notified for GitHub-only success", async () => {
    mockSubmit.mockResolvedValueOnce({
      data: {
        ok: true,
        discordDelivered: false,
        ticket: {
          created: true,
          issueNumber: 42,
          url: "https://github.com/foo/bar/issues/42",
          reason: null,
        },
      },
    });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-success")).toBeInTheDocument();
    });
    expect(screen.getByText(/Created GitHub issue #42/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Support notification is not configured or failed/i)
    ).toBeInTheDocument();
  });

  it("warns when Support is notified but GitHub ticketing fails", async () => {
    mockSubmit.mockResolvedValueOnce({
      data: {
        ok: true,
        discordDelivered: true,
        ticket: { created: false, issueNumber: null, url: null, reason: "unauthorised" },
      },
    });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("github-ticketing-warning")).toHaveTextContent("unauthorised");
    });
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

  it("surfaces the backend error message when one is provided", async () => {
    mockSubmit.mockResolvedValueOnce({
      error: { status: 400, data: { error: "Title too spicy" } },
    });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/Title too spicy/);
    });
  });

  it("falls back to a generic message when the error has no detail", async () => {
    mockSubmit.mockResolvedValueOnce({ error: { status: 500 } });
    renderModal();
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/try again/i);
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

  it("uploads an attached file and includes its URL on submit", async () => {
    mockPresign.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          postUrl: "http://minio.example/ticket-attachments",
          formFields: { key: "u-1/abc-photo.png" },
          objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/abc-photo.png",
          objectKey: "u-1/abc-photo.png",
          expiresAt: Date.now() + 60_000,
        }),
    });
    mockSubmit.mockResolvedValueOnce({ data: { ok: true } });
    renderModal();

    const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("bug-report-attachments")).getByText("Done")
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });
    const arg = mockSubmit.mock.calls[0][0];
    expect(arg.attachments).toEqual([
      "http://localhost:3000/attachments/ticket-attachments/u-1/abc-photo.png",
    ]);
  });

  it("rejects an oversized file before calling presign", async () => {
    renderModal();
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "huge.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), {
      target: { files: [bigFile] },
    });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("bug-report-attachments")).getByText(/exceeds 10MB/i)
      ).toBeInTheDocument();
    });
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it("blocks submission while an attachment is still uploading", async () => {
    let resolvePresign!: () => void;
    mockPresign.mockReturnValue({
      unwrap: () =>
        new Promise((resolve) => {
          resolvePresign = () =>
            resolve({
              postUrl: "http://minio.example/ticket-attachments",
              formFields: {},
              objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/a.png",
              objectKey: "u-1/a.png",
              expiresAt: Date.now() + 60_000,
            });
        }),
    });
    renderModal();

    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("bug-report-attachments")).getByText(/Uploading/i)
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Real title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Long-enough description of what happened." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/wait for attachments/i);
    });
    expect(mockSubmit).not.toHaveBeenCalled();
    resolvePresign();
  });

  it("marks an attachment as errored when upload fails", async () => {
    mockPresign.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network down")),
    });
    renderModal();

    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("bug-report-attachments")).getByText(/failed/i)
      ).toBeInTheDocument();
    });
  });

  it("removes an attachment from the list", async () => {
    mockPresign.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          postUrl: "http://minio.example/ticket-attachments",
          formFields: {},
          objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/a.png",
          objectKey: "u-1/a.png",
          expiresAt: Date.now() + 60_000,
        }),
    });
    renderModal();

    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("bug-report-attachments")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Remove photo.png"));
    await waitFor(() => {
      expect(screen.queryByTestId("bug-report-attachments")).toBeNull();
    });
  });

  it("rejects a 6th attachment once 5 are already attached", async () => {
    mockPresign.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          postUrl: "http://minio.example/ticket-attachments",
          formFields: {},
          objectUrl: "http://localhost:3000/attachments/ticket-attachments/u-1/a.png",
          objectKey: "u-1/a.png",
          expiresAt: Date.now() + 60_000,
        }),
    });
    renderModal();

    for (let i = 0; i < 5; i++) {
      const file = new File(["bytes"], `photo-${i}.png`, { type: "image/png" });
      fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [file] } });
      await waitFor(() => {
        expect(mockPresign).toHaveBeenCalledTimes(i + 1);
      });
    }

    const sixth = new File(["bytes"], "photo-5.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("bug-report-file-input"), { target: { files: [sixth] } });

    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toHaveTextContent(/up to 5 files/i);
    });
    expect(mockPresign).toHaveBeenCalledTimes(5);
  });
});
