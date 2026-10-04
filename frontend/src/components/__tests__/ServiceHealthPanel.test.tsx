import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { ServiceHealthPanel } from "@veta/frontend/components/ServiceHealthPanel";
import { alertsSlice } from "@veta/frontend/store/alertsSlice";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  byService: Record<string, { kind: "ok" | "error" | "warn"; version: string }>;
  systemMetrics: {
    disk: {
      total_gb: number;
      used_gb: number;
      free_gb: number;
      used_pct: number;
    };
    diskStatus: "ok" | "critical" | "unavailable";
    diskWarnPct: number;
    memory: {
      rss_mb: number;
      heap_used_mb: number;
      heap_total_mb: number;
      external_mb: number;
    };
  };
} = {
  byService: {
    OMS: { kind: "ok" as const, version: "1.2.3" },
    Gateway: { kind: "error" as const, version: "—" },
  },
  systemMetrics: {
    disk: { total_gb: 100, used_gb: 92, free_gb: 8, used_pct: 92 },
    diskStatus: "critical" as const,
    diskWarnPct: 80,
    memory: {
      rss_mb: 800,
      heap_used_mb: 400,
      heap_total_mb: 1000,
      external_mb: 50,
    },
  },
};

const SERVICE_SPECS = [
  { name: "OMS", url: "http://oms/health", optional: false },
  { name: "Gateway", url: "http://gateway/health", optional: false },
];

vi.mock("../../store/servicesApi.ts", () => ({
  useGetSystemMetricsQuery: () => ({ data: state.systemMetrics }),
}));

vi.mock("../../hooks/useAllServiceHealth", () => ({
  useAllServiceHealth: () =>
    SERVICE_SPECS.map((svc) => {
      const item = state.byService[svc.name];
      return {
        ...svc,
        state: item?.kind ?? "error",
        version: item?.version ?? "—",
        meta: {},
        lastChecked: 1_700_000_000_000,
      };
    }),
}));

function renderPanel() {
  const store = configureStore({
    reducer: { alerts: alertsSlice.reducer },
  });
  render(
    <Provider store={store}>
      <ServiceHealthPanel />
    </Provider>
  );
}

describe("ServiceHealthPanel", () => {
  beforeEach(() => {
    state.byService = {
      OMS: { kind: "ok", version: "1.2.3" },
      Gateway: { kind: "error", version: "—" },
    };
  });

  it("renders degraded status with service rows and host resources", () => {
    renderPanel();

    expect(screen.getByText(/Service Health/i)).toBeInTheDocument();
    expect(screen.getByText(/degraded/i)).toBeInTheDocument();
    expect(screen.getByText("OMS")).toBeInTheDocument();
    expect(screen.getByText("Gateway")).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByText(/Host Resources/i)).toBeInTheDocument();
    expect(screen.getByText("Disk")).toBeInTheDocument();
    expect(screen.getByText("Memory (RSS)")).toBeInTheDocument();
  });

  it("shows all ok when all services are healthy", () => {
    state.byService.Gateway = { kind: "ok", version: "2.0.0" };

    renderPanel();

    expect(screen.getByText(/all ok/i)).toBeInTheDocument();
    expect(screen.getByText("2.0.0")).toBeInTheDocument();
  });

  it("renders a warn-state service distinctly from ok and error", () => {
    state.byService.Gateway = { kind: "warn", version: "—" };

    renderPanel();

    expect(screen.getByText("warn")).toBeInTheDocument();
    // a warn service means the estate isn't "all ok"
    expect(screen.queryByText(/all ok/i)).not.toBeInTheDocument();
  });
});
