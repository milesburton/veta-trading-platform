import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawersProvider, useDrawers } from "../DrawersContext";
import { LOGS_DRAWER_ID, LogsDrawer } from "../LogsDrawer";

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
