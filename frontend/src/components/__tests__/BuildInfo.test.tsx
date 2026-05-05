import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BuildInfo } from "../BuildInfo";

describe("BuildInfo", () => {
  it("renders nothing when no commitSha, buildDate or env are provided", () => {
    const { container } = render(<BuildInfo />);
    expect(container.textContent).toBe("");
  });

  it("renders short SHA prefixed with v", () => {
    render(<BuildInfo commitSha="abc1234567890" />);
    expect(screen.getByTestId("build-info")).toHaveTextContent("vabc1234");
  });

  it("renders build date alongside SHA", () => {
    render(<BuildInfo commitSha="abc1234567890" buildDate="2026-05-04" />);
    const info = screen.getByTestId("build-info");
    expect(info).toHaveTextContent(/vabc1234.*2026-05-04/);
  });

  it("renders the env tag and styles it for local", () => {
    render(<BuildInfo env="local" commitSha="abc1234" />);
    const env = screen.getByTestId("build-info-env");
    expect(env).toHaveTextContent("local");
    expect(env).toHaveClass("text-sky-400");
  });

  it("relabels fly env as DEMO and uses emerald accent", () => {
    render(<BuildInfo env="fly" commitSha="abc1234" />);
    const env = screen.getByTestId("build-info-env");
    expect(env).toHaveTextContent("demo");
    expect(env).toHaveClass("text-emerald-300");
  });

  it("uses amber styling for uat", () => {
    render(<BuildInfo env="uat" commitSha="abc1234" />);
    const env = screen.getByTestId("build-info-env");
    expect(env).toHaveTextContent("uat");
    expect(env).toHaveClass("text-amber-300");
  });

  it("falls back to neutral grey for unknown env", () => {
    render(<BuildInfo env="staging" commitSha="abc1234" />);
    const env = screen.getByTestId("build-info-env");
    expect(env).toHaveTextContent("staging");
    expect(env).toHaveClass("text-gray-400");
  });

  it("renders env without version info when no SHA or date present", () => {
    render(<BuildInfo env="local" />);
    expect(screen.getByTestId("build-info-env")).toHaveTextContent("local");
  });
});
