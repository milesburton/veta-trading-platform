import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type AuthUser, authSlice } from "../../store/authSlice";
import { servicesApi } from "../../store/servicesApi";
import { userApi } from "../../store/userApi";
import { LoginPage } from "../LoginPage";

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  };
});

// Track the mock mutate function so tests can control its behaviour
const mockCreateSession = vi.fn<() => Promise<{ data?: AuthUser; error?: { status: number } }>>();

vi.mock("../../store/userApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/userApi")>();
  return {
    ...original,
    useCreateSessionMutation: () => [
      mockCreateSession,
      { isLoading: false, error: undefined, reset: vi.fn() },
    ],
  };
});

function makeStore() {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
      [userApi.reducerPath]: userApi.reducer,
    },
    middleware: (m) => m().concat(servicesApi.middleware).concat(userApi.middleware),
  });
}

function renderLogin(props: { buildDate?: string; commitSha?: string } = {}, store = makeStore()) {
  const result = render(
    <Provider store={store}>
      <LoginPage {...props} />
    </Provider>
  );
  return { ...result, store };
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({ data: undefined });
  });

  test("renders brand, heading, and all user buttons", () => {
    renderLogin();

    expect(screen.getByTestId("brand-title")).toHaveTextContent("VETA");
    expect(screen.getByTestId("login-heading")).toHaveTextContent("Select your profile");
    expect(screen.getByTestId("user-btn-alice")).toBeInTheDocument();
    expect(screen.getByTestId("user-btn-bob")).toBeInTheDocument();
    expect(screen.getByTestId("user-btn-carol")).toBeInTheDocument();
    expect(screen.getByTestId("user-btn-dave")).toBeInTheDocument();
    expect(screen.getByTestId("user-btn-admin")).toBeInTheDocument();
  });

  test("shows trader names and role badges", () => {
    renderLogin();

    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
    expect(screen.getAllByText("trader")).toHaveLength(4);
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  test("dispatches setUser on successful login", async () => {
    const authUser: AuthUser = {
      id: "alice",
      name: "Alice Chen",
      role: "trader",
      avatar_emoji: "AC",
    };
    mockCreateSession.mockResolvedValue({ data: authUser });
    const store = makeStore();

    render(
      <Provider store={store}>
        <LoginPage />
      </Provider>
    );

    fireEvent.click(screen.getByTestId("user-btn-alice"));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });

  test("calls createSession with the userId when a user is clicked", async () => {
    renderLogin();
    fireEvent.click(screen.getByTestId("user-btn-bob"));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledWith({ userId: "bob" }));
  });

  test("renders build info footer when props provided", () => {
    renderLogin({ buildDate: "2026-03-08", commitSha: "abc1234" });

    const footer = screen.getByTestId("login-build-info");
    expect(footer).toHaveTextContent("2026-03-08");
    expect(footer).toHaveTextContent("abc1234");
  });

  test("renders empty build info footer when props omitted", () => {
    renderLogin();
    expect(screen.getByTestId("login-build-info")).toBeEmptyDOMElement();
  });

  test("shows platform status section", () => {
    renderLogin();
    expect(screen.getByTestId("platform-status")).toBeInTheDocument();
    expect(screen.getByTestId("platform-status-label")).toHaveTextContent("Checking platform…");
  });

  test("shows all service category headings in the platform status grid", () => {
    renderLogin();
    const status = screen.getByTestId("platform-status");
    expect(status).toHaveTextContent("Order Flow");
    expect(status).toHaveTextContent("Algo Engines");
    expect(status).toHaveTextContent("Data Services");
    expect(status).toHaveTextContent("Infrastructure");
    expect(status).toHaveTextContent("Observability");
  });

  test("shows core service names with port numbers in platform status", () => {
    renderLogin();
    const status = screen.getByTestId("platform-status");
    expect(status).toHaveTextContent("Market Sim");
    expect(status).toHaveTextContent(":5000");
    expect(status).toHaveTextContent("Gateway");
    expect(status).toHaveTextContent(":5011");
  });

  test("shows algo engine services in platform status", () => {
    renderLogin();
    const status = screen.getByTestId("platform-status");
    expect(status).toHaveTextContent("TWAP Algo");
    expect(status).toHaveTextContent("POV Algo");
    expect(status).toHaveTextContent("VWAP Algo");
    expect(status).toHaveTextContent("Iceberg Algo");
    expect(status).toHaveTextContent("Sniper Algo");
    expect(status).toHaveTextContent("Arrival Price Algo");
    expect(status).toHaveTextContent("IS Algo");
    expect(status).toHaveTextContent("Momentum Algo");
  });

  test("shows observability services including Kafka Relay", () => {
    renderLogin();
    const status = screen.getByTestId("platform-status");
    expect(status).toHaveTextContent("Kafka Relay");
  });

  test("services show their description text", () => {
    renderLogin();
    const status = screen.getByTestId("platform-status");
    expect(status).toHaveTextContent("GBM price simulation");
    expect(status).toHaveTextContent("Black-Scholes");
  });
});
