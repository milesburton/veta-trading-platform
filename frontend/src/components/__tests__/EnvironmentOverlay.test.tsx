import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockedDeployment = "uat";

vi.mock("../../store/servicesApi", () => ({
  get DEPLOYMENT() {
    return mockedDeployment;
  },
}));

afterEach(() => {
  mockedDeployment = "uat";
  vi.unstubAllEnvs();
});

async function importOverlay() {
  vi.resetModules();
  const mod = await import("../EnvironmentOverlay");
  return mod.EnvironmentOverlay;
}

describe("EnvironmentOverlay", () => {
  it("renders a watermark on uat", async () => {
    mockedDeployment = "uat";
    const Overlay = await importOverlay();
    render(<Overlay />);
    expect(screen.getByTestId("environment-overlay")).toBeInTheDocument();
  });

  it("renders nothing on local", async () => {
    mockedDeployment = "local";
    const Overlay = await importOverlay();
    render(<Overlay />);
    expect(screen.queryByTestId("environment-overlay")).not.toBeInTheDocument();
  });

  it("renders nothing on fly (production)", async () => {
    mockedDeployment = "fly";
    const Overlay = await importOverlay();
    render(<Overlay />);
    expect(screen.queryByTestId("environment-overlay")).not.toBeInTheDocument();
  });

  it("can be force-disabled via VITE_DISABLE_ENV_OVERLAY=1", async () => {
    mockedDeployment = "uat";
    vi.stubEnv("VITE_DISABLE_ENV_OVERLAY", "1");
    const Overlay = await importOverlay();
    render(<Overlay />);
    expect(screen.queryByTestId("environment-overlay")).not.toBeInTheDocument();
  });

  it("watermark element ignores pointer events", async () => {
    mockedDeployment = "uat";
    const Overlay = await importOverlay();
    render(<Overlay />);
    const overlay = screen.getByTestId("environment-overlay");
    expect(overlay.className).toContain("pointer-events-none");
  });
});
