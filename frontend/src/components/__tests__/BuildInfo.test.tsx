import { render, screen } from "@testing-library/react";
import { BuildInfo } from "@veta/frontend/components/BuildInfo";
import { describe, expect, it } from "vitest";

describe("BuildInfo", () => {
  it("renders nothing when no version, sha or date are provided", () => {
    const { container } = render(<BuildInfo />);
    expect(container.textContent).toBe("");
  });

  it("renders short SHA only", () => {
    render(<BuildInfo commitSha="abc1234567890" />);
    expect(screen.getByTestId("build-info")).toHaveTextContent("abc1234");
  });

  it("renders semver version when provided", () => {
    render(<BuildInfo version="1.24.0" commitSha="abc1234567890" />);
    expect(screen.getByTestId("build-info")).toHaveTextContent(/1\.24\.0.*abc1234/);
  });

  it("joins version, sha and date with separators", () => {
    render(<BuildInfo version="1.24.0" commitSha="abc1234" buildDate="2026-05-04" />);
    const info = screen.getByTestId("build-info");
    expect(info).toHaveTextContent("1.24.0 · abc1234 · 2026-05-04");
  });

  it("renders just the version when only that is provided", () => {
    render(<BuildInfo version="1.24.0" />);
    expect(screen.getByTestId("build-info")).toHaveTextContent("1.24.0");
  });

  it("title attribute includes version, build sha and date", () => {
    render(<BuildInfo version="1.24.0" commitSha="abc1234567890" buildDate="2026-05-04" />);
    const info = screen.getByTestId("build-info");
    expect(info.getAttribute("title")).toContain("Version 1.24.0");
    expect(info.getAttribute("title")).toContain("Build abc1234567890");
    expect(info.getAttribute("title")).toContain("2026-05-04");
  });

  it("trims ISO timestamp build date to date-only in the visible chip", () => {
    render(<BuildInfo version="1.39.0" commitSha="406cbdc" buildDate="2026-05-18T17:31:18Z" />);
    const info = screen.getByTestId("build-info");
    expect(info).toHaveTextContent("1.39.0 · 406cbdc · 2026-05-18");
    expect(info.textContent).not.toContain("T17:31:18Z");
  });

  it("keeps full ISO timestamp in the tooltip", () => {
    render(<BuildInfo version="1.39.0" commitSha="406cbdc" buildDate="2026-05-18T17:31:18Z" />);
    expect(screen.getByTestId("build-info").getAttribute("title")).toContain(
      "2026-05-18T17:31:18Z"
    );
  });
});
