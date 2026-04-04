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

// Track the mock mutate functions so tests can control OAuth outcomes.
const mockAuthorizeOAuth =
  vi.fn<() => Promise<{ data?: { code: string }; error?: { status: number } }>>();
const mockExchangeOAuthCode =
  vi.fn<() => Promise<{ data?: { user: AuthUser }; error?: { status: number } }>>();
const mockRegisterOAuthUser =
  vi.fn<
    () => Promise<{
      data?: { userId: string; name: string; role: string };
      error?: { status: number };
    }>
  >();

vi.mock("../../store/userApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/userApi")>();
  return {
    ...original,
    useAuthorizeOAuthMutation: () => [
      mockAuthorizeOAuth,
      { isLoading: false, error: undefined, reset: vi.fn() },
    ],
    useExchangeOAuthCodeMutation: () => [
      mockExchangeOAuthCode,
      { isLoading: false, error: undefined, reset: vi.fn() },
    ],
    useRegisterOAuthUserMutation: () => [
      mockRegisterOAuthUser,
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
    mockAuthorizeOAuth.mockResolvedValue({ data: { code: "code-1" } });
    mockExchangeOAuthCode.mockResolvedValue({
      data: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader",
          avatar_emoji: "AC",
        },
      },
    });
    mockRegisterOAuthUser.mockResolvedValue({
      data: { userId: "new-user", name: "New User", role: "viewer" },
    });
  });

  test("renders brand, OAuth heading, and credential fields", () => {
    renderLogin();

    expect(screen.getByTestId("brand-title")).toHaveTextContent("VETA");
    expect(screen.getByTestId("login-heading")).toHaveTextContent("Sign in with OAuth2");
    expect(screen.getByTestId("oauth-mode-signin")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-mode-register")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-username")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-password")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-submit")).toBeInTheDocument();
  });

  test("switches to register mode and shows display name field", () => {
    renderLogin();
    fireEvent.click(screen.getByTestId("oauth-mode-register"));
    expect(screen.getByTestId("oauth-display-name")).toBeInTheDocument();
  });

  test("dispatches setUser on successful OAuth exchange", async () => {
    const authUser: AuthUser = {
      id: "alice",
      name: "Alice Chen",
      role: "trader",
      avatar_emoji: "AC",
    };
    mockExchangeOAuthCode.mockResolvedValue({ data: { user: authUser } });
    const store = makeStore();

    render(
      <Provider store={store}>
        <LoginPage />
      </Provider>
    );

    fireEvent.change(screen.getByTestId("oauth-username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });

  test("calls OAuth authorize and token endpoints on sign in", async () => {
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), { target: { value: "bob" } });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
    await waitFor(() => expect(mockExchangeOAuthCode).toHaveBeenCalled());
  });

  test("register mode calls registration before OAuth authorize", async () => {
    renderLogin();
    fireEvent.click(screen.getByTestId("oauth-mode-register"));
    fireEvent.change(screen.getByTestId("oauth-username"), { target: { value: "newviewer" } });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.change(screen.getByTestId("oauth-display-name"), { target: { value: "New Viewer" } });
    fireEvent.click(screen.getByTestId("oauth-submit"));

    await waitFor(() =>
      expect(mockRegisterOAuthUser).toHaveBeenCalledWith({
        username: "newviewer",
        name: "New Viewer",
        password: "veta-dev-passcode",
      })
    );
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
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
