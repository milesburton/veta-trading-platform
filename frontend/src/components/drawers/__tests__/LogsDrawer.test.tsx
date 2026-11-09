import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DrawersProvider, useDrawers } from "@veta/frontend/components/drawers/DrawersContext";
import { LOGS_DRAWER_ID, LogsDrawer } from "@veta/frontend/components/drawers/LogsDrawer";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function Opener() {
  const { open } = useDrawers();
  useEffect(() => {
    open(LOGS_DRAWER_ID);
  }, [open]);
  return null;
}

const sampleResponse = {
  lines: [
    {
      ts: 1_700_000_000_000,
      service: "oms",
      level: "info",
      message: "validated order",
      raw: "{...}",
    },
    {
      ts: 1_700_000_001_000,
      service: "risk-engine",
      level: "warn",
      message: "fat-finger threshold breached",
      raw: "{...}",
    },
  ],
  source: "ring-buffer",
  lokiConfigured: false,
  ringSize: 2000,
};

let lastUrl = "";

beforeEach(() => {
  lastUrl = "";
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    lastUrl = String(input);
    return Promise.resolve(
      new Response(JSON.stringify(sampleResponse), { status: 200 })
    ) as ReturnType<typeof fetch>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LogsDrawer", () => {
  it("loads recent logs and renders them when opened", async () => {
    render(
      <DrawersProvider>
        <Opener />
        <LogsDrawer />
      </DrawersProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("logs-row")).toHaveLength(2);
    });
    expect(screen.getByText(/validated order/)).toBeInTheDocument();
    expect(screen.getByText(/fat-finger threshold breached/)).toBeInTheDocument();
  });

  it("re-queries with the chosen service filter", async () => {
    render(
      <DrawersProvider>
        <Opener />
        <LogsDrawer />
      </DrawersProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("logs-row")).toHaveLength(2);
    });

    fireEvent.change(screen.getByTestId("logs-service"), { target: { value: "oms" } });

    await waitFor(() => {
      expect(lastUrl).toContain("service=oms");
    });
  });

  it("shows the ring-buffer hint when Loki is unavailable", async () => {
    render(
      <DrawersProvider>
        <Opener />
        <LogsDrawer />
      </DrawersProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Loki unavailable/i)).toBeInTheDocument();
    });
  });
});

describe("LogsDrawer error handling and filters", () => {
  const renderDrawer = () =>
    render(
      <DrawersProvider>
        <Opener />
        <LogsDrawer />
      </DrawersProvider>
    );

  it("shows the HTTP status when the query is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    renderDrawer();
    expect(await screen.findByText(/HTTP 503/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("logs-row")).toHaveLength(0);
  });

  it("shows the failure message when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    renderDrawer();
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });

  it("re-queries with the chosen level and window", async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getAllByTestId("logs-row")).toHaveLength(2));

    fireEvent.change(screen.getByTestId("logs-level"), { target: { value: "warn" } });
    await waitFor(() => expect(lastUrl).toContain("level=warn"));

    fireEvent.click(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => expect(lastUrl).toContain("since=1h"));
  });

  it("debounces the search box and sends the trimmed query", async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getAllByTestId("logs-row")).toHaveLength(2));

    fireEvent.input(screen.getByTestId("logs-search"), { target: { value: "  fat finger " } });
    await waitFor(() => expect(lastUrl).toContain("q=fat+finger"), { timeout: 2000 });
  });

  it("refreshes on demand", async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getAllByTestId("logs-row")).toHaveLength(2));
    const spy = vi.mocked(globalThis.fetch);
    const before = spy.mock.calls.length;
    fireEvent.click(screen.getByTestId("logs-refresh"));
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
  });
});
