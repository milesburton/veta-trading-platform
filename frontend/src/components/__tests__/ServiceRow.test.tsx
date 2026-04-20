import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ServiceHealth } from "../../types";
import { ServiceRow } from "../ServiceRow";
import { StatusDot } from "../StatusDot";

function makeSvc(overrides: Partial<ServiceHealth> = {}): ServiceHealth {
  return {
    name: "oms",
    url: "http://localhost:8080",
    state: "ok",
    version: "1.2.3",
    meta: {},
    lastChecked: null,
    ...overrides,
  };
}

describe("StatusDot", () => {
  it("renders expected state classes", () => {
    const { rerender, container } = render(<StatusDot state="ok" className="extra" />);
    expect(container.querySelector("span")?.className).toContain("bg-emerald-400");
    expect(container.querySelector("span")?.className).toContain("extra");

    rerender(<StatusDot state="error" />);
    expect(container.querySelector("span")?.className).toContain("bg-red-500");

    rerender(<StatusDot state="unknown" />);
    expect(container.querySelector("span")?.className).toContain("bg-gray-500");
  });
});

describe("ServiceRow", () => {
  it("renders link, metadata, and ok state", () => {
    render(
      <table>
        <tbody>
          <ServiceRow
            svc={makeSvc({
              link: "https://example.test",
              meta: { env: "prod" },
            })}
          />
        </tbody>
      </table>
    );

    const link = screen.getByRole("link", { name: "oms" });
    expect(link).toHaveAttribute("href", "https://example.test");
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByText("env: prod")).toBeInTheDocument();
  });

  it("shows unavailable for optional service in error state", () => {
    const { container } = render(
      <table>
        <tbody>
          <ServiceRow svc={makeSvc({ optional: true, state: "error" })} />
        </tbody>
      </table>
    );

    const row = container.querySelector("tr");
    expect(row?.className).toContain("opacity-40");
    expect(screen.getByText("unavailable")).toBeInTheDocument();

    const dot = container.querySelector("span.inline-block");
    expect(dot).toBeTruthy();
    expect(dot?.className).toContain("bg-gray-500");
  });

  it("falls back to lastChecked time or dash", () => {
    const timeSpy = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockReturnValue("12:34:56 PM" as unknown as string);

    const { rerender } = render(
      <table>
        <tbody>
          <ServiceRow svc={makeSvc({ meta: {}, lastChecked: 1_700_000_000_000 })} />
        </tbody>
      </table>
    );
    expect(screen.getByText("12:34:56 PM")).toBeInTheDocument();

    rerender(
      <table>
        <tbody>
          <ServiceRow svc={makeSvc({ meta: {}, lastChecked: null })} />
        </tbody>
      </table>
    );
    expect(screen.getByText("—")).toBeInTheDocument();

    timeSpy.mockRestore();
  });
});
