import { fireEvent, render, screen } from "@testing-library/react";
import { ServiceStatus } from "@veta/frontend/components/ServiceStatus";
import type { ServiceHealth } from "@veta/frontend/types";

const services: ServiceHealth[] = [
  {
    name: "market-sim",
    state: "ok",
    version: "1.2.3",
    meta: {},
    lastChecked: Date.now(),
    url: "",
  },
  {
    name: "ems",
    state: "unknown",
    version: "0.1.0",
    meta: { region: "us" },
    lastChecked: null,
    url: "",
  },
];

test("renders aggregate dot and opens panel with service rows", () => {
  render(<ServiceStatus services={services} />);

  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn).toBeInTheDocument();

  fireEvent.click(btn);

  expect(screen.getByText("market-sim")).toBeInTheDocument();
  expect(screen.getByText("ems")).toBeInTheDocument();
  expect(screen.getAllByText("1.2.3").length).toBeGreaterThan(0);
});

test("shows ok/total count in the Services button", () => {
  render(<ServiceStatus services={services} />);
  const btn = screen.getByRole("button", { name: /services/i });
  // 1 ok out of 2 required (neither is optional)
  expect(btn.textContent).toMatch(/1\/2/);
});

test("shows short commit SHA in button when all required services share one", () => {
  const allOk: ServiceHealth[] = [
    {
      name: "svc-a",
      state: "ok",
      version: "abc1234567",
      meta: {},
      lastChecked: Date.now(),
      url: "",
    },
    {
      name: "svc-b",
      state: "ok",
      version: "abc1234567",
      meta: {},
      lastChecked: Date.now(),
      url: "",
    },
  ];
  render(<ServiceStatus services={allOk} />);
  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn.textContent).toContain("abc1234");
  expect(btn.textContent).not.toContain("vabc1234");
});

test("links the panel-header commit to GitHub when sha is real", () => {
  const allOk: ServiceHealth[] = [
    {
      name: "svc-a",
      state: "ok",
      version: "abc1234567",
      meta: {},
      lastChecked: Date.now(),
      url: "",
    },
  ];
  render(<ServiceStatus services={allOk} />);
  fireEvent.click(screen.getByRole("button", { name: /services/i }));
  const link = screen.getByTestId("service-health-commit-link") as HTMLAnchorElement;
  expect(link.href).toContain("/commit/abc1234567");
  expect(link.target).toBe("_blank");
});

test("renders error dot when services are down", () => {
  const downServices: ServiceHealth[] = [
    {
      name: "svc-down",
      state: "error",
      version: "—",
      meta: {},
      lastChecked: Date.now(),
      url: "",
    },
  ];
  render(<ServiceStatus services={downServices} />);
  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn).toBeInTheDocument();
});

test("renders mixed required and optional services", () => {
  const mixed: ServiceHealth[] = [
    {
      name: "svc-required",
      state: "ok",
      version: "1.0.0",
      meta: {},
      lastChecked: Date.now(),
      url: "",
    },
    {
      name: "svc-optional",
      state: "error",
      version: "—",
      meta: {},
      lastChecked: Date.now(),
      url: "",
      optional: true,
    },
  ];
  render(<ServiceStatus services={mixed} />);
  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn).toBeInTheDocument();
  fireEvent.click(btn);
  expect(screen.getByText("svc-required")).toBeInTheDocument();
});

test("shows tooltips on service table headers", () => {
  render(<ServiceStatus services={services} />);
  fireEvent.click(screen.getByRole("button", { name: /services/i }));

  expect(screen.getByRole("columnheader", { name: "Service" })).toHaveAttribute(
    "title",
    "Backend service name"
  );
  expect(screen.getByRole("columnheader", { name: "Status" })).toHaveAttribute(
    "title",
    "Current health state"
  );
});
