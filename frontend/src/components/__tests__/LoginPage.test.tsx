import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginPage } from "@veta/frontend/components/LoginPage";
import { type AuthUser, authSlice } from "@veta/frontend/store/authSlice";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { userApi } from "@veta/frontend/store/userApi";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const { useAllServiceHealth } = vi.hoisted(() => ({
  useAllServiceHealth: vi.fn(() => [] as import("../../types").ServiceHealth[]),
}));

vi.mock("../StatusBar", () => ({
  AppHeader: () => <div data-testid="app-header-mock" />,
}));

vi.mock("../LoginPage/SingleSignOn", () => ({
  SingleSignOn: () => null,
}));

vi.mock("../../hooks/useAllServiceHealth", () => ({
  useAllServiceHealth,
}));

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({
      data: undefined,
      isLoading: true,
      isError: false,
    }),
  };
});

const sha256AsyncMock = vi.fn(async (_data: Uint8Array) => new Uint8Array(32).fill(1));
vi.mock("../../lib/sha256", () => ({
  sha256Async: (data: Uint8Array) => sha256AsyncMock(data),
}));

const mockAuthorizeOAuth =
  vi.fn<() => Promise<{ data?: { code: string }; error?: { status: number } }>>();
const mockExchangeOAuthCode =
  vi.fn<() => Promise<{ data?: { user: AuthUser }; error?: { status: number } }>>();
const mockLoginAsGuest =
  vi.fn<() => Promise<{ data?: { user: AuthUser }; error?: { status: number } }>>();
const mockDemoPersonas = vi.fn<() => import("@veta/frontend/store/userApi").DemoPersona[]>(
  () => []
);

vi.mock("../../store/userApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/userApi")>();
  return {
    ...original,
    useGetDemoPersonasQuery: () => ({
      data: { personas: mockDemoPersonas() },
      isLoading: false,
      error: undefined,
    }),
    useAuthorizeOAuthMutation: () => [
      mockAuthorizeOAuth,
      { isLoading: false, error: undefined, reset: vi.fn() },
    ],
    useExchangeOAuthCodeMutation: () => [
      mockExchangeOAuthCode,
      { isLoading: false, error: undefined, reset: vi.fn() },
    ],
    useLoginAsGuestMutation: () => [
      mockLoginAsGuest,
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

function personaWith(overrides: Partial<import("@veta/frontend/store/userApi").DemoPersona> = {}) {
  return {
    id: "alice",
    name: "Alice Chen",
    role: "trader",
    avatar_emoji: "AC",
    description: "Equity cash trader",
    trading_style: "high_touch",
    primary_desk: "equity-cash",
    allowed_strategies: [],
    max_order_qty: 1000,
    dark_pool_access: false,
    passcode: "veta-dev-passcode",
    ...overrides,
  } as import("@veta/frontend/store/userApi").DemoPersona;
}

function showPersona(overrides: Partial<import("@veta/frontend/store/userApi").DemoPersona> = {}) {
  mockDemoPersonas.mockReturnValue([personaWith(overrides)]);
}

function renderLogin(store = makeStore()) {
  const result = render(
    <Provider store={store}>
      <LoginPage />
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
    mockLoginAsGuest.mockResolvedValue({
      data: {
        user: {
          id: "guest-1",
          name: "Guest",
          role: "viewer",
          avatar_emoji: "G",
        },
      },
    });
    mockDemoPersonas.mockReturnValue([]);
  });

  test("embeds the shared app header and offers no username or passcode form", () => {
    renderLogin();

    expect(screen.getByTestId("app-header-mock")).toBeInTheDocument();
    expect(screen.getByTestId("login-heading")).toHaveTextContent("Sign in");
    expect(screen.queryByTestId("oauth-username")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-password")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-submit")).not.toBeInTheDocument();
  });

  test("offers no way to register an account", () => {
    renderLogin();
    expect(screen.queryByTestId("registration-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-username")).not.toBeInTheDocument();
    expect(screen.queryByTestId("register-submit")).not.toBeInTheDocument();
  });

  test("dispatches setUser on successful OAuth exchange", async () => {
    const authUser: AuthUser = {
      id: "alice",
      name: "Alice Chen",
      role: "trader",
      avatar_emoji: "AC",
    };
    mockExchangeOAuthCode.mockResolvedValue({ data: { user: authUser } });
    showPersona();
    const { store } = renderLogin();

    fireEvent.click(screen.getByTestId("persona-alice"));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });

  test("calls OAuth authorize and token endpoints on sign in", async () => {
    showPersona({ id: "bob", name: "Bob" });
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-bob"));
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
    await waitFor(() => expect(mockExchangeOAuthCode).toHaveBeenCalled());
  });

  test("shows the footer with version, build date and GitHub links", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.3");
    vi.stubEnv("VITE_BUILD_DATE", "2026-11-14T10:00:00Z");
    vi.stubEnv("VITE_COMMIT_SHA", "abcdef1234567890");
    try {
      renderLogin();
      const footer = screen.getByTestId("login-footer");
      expect(footer).toBeInTheDocument();
      expect(screen.getByTestId("build-info")).toHaveTextContent("1.2.3");
      expect(screen.getByTestId("build-info")).toHaveTextContent("abcdef1");
      expect(screen.getByTestId("build-info")).toHaveTextContent("2026-11-14");
      expect(screen.getByTestId("login-footer-github")).toHaveAttribute(
        "href",
        "https://github.com/milesburton/veta-trading-platform"
      );
      expect(screen.getByTestId("login-footer-docs")).toHaveAttribute(
        "href",
        "https://milesburton.github.io/veta-trading-platform/"
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("shows specific error when OAuth returns 401", async () => {
    mockAuthorizeOAuth.mockResolvedValue({ error: { status: 401 } } as never);
    showPersona({ id: "bad", name: "Bad", passcode: "wrong" });
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-bad"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/invalid username or passcode/i)
    );
  });

  test("surfaces a visible error when PKCE generation throws", async () => {
    sha256AsyncMock.mockRejectedValueOnce(new Error("crypto.subtle is undefined"));
    showPersona();
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-alice"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/crypto.subtle is undefined/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });

  test("rejects a persona with no passcode before hitting the API", async () => {
    showPersona({ passcode: "" });
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-alice"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/Passcode is required/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });

  test("shows error when token exchange succeeds but returns no user profile", async () => {
    mockExchangeOAuthCode.mockResolvedValue({ data: {} } as never);
    showPersona();
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-alice"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/no user profile was returned/i)
    );
  });

  test("shows error when token exchange returns an error", async () => {
    mockExchangeOAuthCode.mockResolvedValue({ error: { status: 403 } } as never);
    showPersona();
    renderLogin();
    fireEvent.click(screen.getByTestId("persona-alice"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/not permitted to sign in/i)
    );
  });

  test("guest login dispatches setUser on success", async () => {
    const { store } = renderLogin();
    fireEvent.click(screen.getByTestId("guest-login-button"));
    await waitFor(() => expect(mockLoginAsGuest).toHaveBeenCalled());
    await waitFor(() => expect(store.getState().auth.user?.id).toBe("guest-1"));
  });

  test("guest login shows error when guest access is disabled (403)", async () => {
    mockLoginAsGuest.mockResolvedValue({ error: { status: 403 } });
    renderLogin();
    fireEvent.click(screen.getByTestId("guest-login-button"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/Guest access is not enabled/i)
    );
  });

  test("guest login surfaces a visible error when the request throws", async () => {
    mockLoginAsGuest.mockRejectedValueOnce(new Error("network down"));
    renderLogin();
    fireEvent.click(screen.getByTestId("guest-login-button"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(
        /Guest sign in failed: network down/
      )
    );
  });

  test("selecting a demo persona signs in with the persona credentials", async () => {
    mockDemoPersonas.mockReturnValue([
      {
        id: "alice",
        name: "Alice Chen",
        role: "trader",
        avatar_emoji: "AC",
        description: "Equity cash trader",
        trading_style: "high_touch",
        primary_desk: "equity-cash",
        allowed_strategies: [],
        max_order_qty: 1000,
        dark_pool_access: false,
        passcode: "veta-dev-passcode",
      },
    ]);
    const { store } = renderLogin();
    fireEvent.click(screen.getByTestId("persona-alice"));
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });
});

describe("LoginPage – DegradedServicesOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAllServiceHealth.mockReturnValue([]);
  });

  function makeServicesHealthy(): import("../../types").ServiceHealth[] {
    return [
      {
        name: "Gateway",
        state: "ok",
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
      {
        name: "EMS",
        state: "ok",
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
    ];
  }

  function makeDegradedServices(count = 2): import("../../types").ServiceHealth[] {
    return [
      {
        name: "Gateway",
        state: "error",
        version: "n/a",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
      {
        name: "EMS",
        state: "error",
        version: "n/a",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
      ...Array.from({ length: count - 2 }, (_, i) => ({
        name: `Service${i}`,
        state: "ok" as const,
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      })),
    ];
  }

  test("does not show overlay when all services are healthy", () => {
    useAllServiceHealth.mockReturnValue(makeServicesHealthy());
    renderLogin();
    expect(screen.queryByTestId("degraded-services-overlay")).not.toBeInTheDocument();
  });

  test("does not show overlay when services are still loading (all unknown)", () => {
    useAllServiceHealth.mockReturnValue([
      {
        name: "Gateway",
        state: "unknown",
        version: "n/a",
        meta: {},
        lastChecked: null,
        url: "",
        optional: false,
      },
    ]);
    renderLogin();
    expect(screen.queryByTestId("degraded-services-overlay")).not.toBeInTheDocument();
  });

  test("shows overlay when required services are degraded", () => {
    useAllServiceHealth.mockReturnValue(makeDegradedServices(2));
    renderLogin();
    expect(screen.getByTestId("degraded-services-overlay")).toBeInTheDocument();
    expect(screen.getByText(/2 required services are offline/)).toBeInTheDocument();
  });

  test("shows singular message for exactly 1 degraded service", () => {
    useAllServiceHealth.mockReturnValue([
      {
        name: "Gateway",
        state: "error",
        version: "n/a",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
      {
        name: "EMS",
        state: "ok",
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
    ]);
    renderLogin();
    expect(screen.getByText(/1 required service is offline/)).toBeInTheDocument();
  });

  test("overlay is dismissed when Sign in anyway is clicked", () => {
    useAllServiceHealth.mockReturnValue(makeDegradedServices(2));
    renderLogin();
    expect(screen.getByTestId("degraded-services-overlay")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("degraded-dismiss"));
    expect(screen.queryByTestId("degraded-services-overlay")).not.toBeInTheDocument();
  });

  test("View details click invokes the services dropdown button", () => {
    useAllServiceHealth.mockReturnValue(makeDegradedServices(2));
    const dropdownBtn = document.createElement("button");
    dropdownBtn.setAttribute("data-testid", "services-status-btn");
    const onClick = vi.fn();
    dropdownBtn.addEventListener("click", onClick);
    document.body.appendChild(dropdownBtn);
    renderLogin();
    fireEvent.click(screen.getByTestId("degraded-view-details"));
    expect(onClick).toHaveBeenCalled();
    document.body.removeChild(dropdownBtn);
  });

  test("updates the overlay when service health changes after mount", async () => {
    useAllServiceHealth.mockReturnValue(makeServicesHealthy());
    const { rerender, store } = renderLogin();
    expect(screen.queryByTestId("degraded-services-overlay")).not.toBeInTheDocument();
    useAllServiceHealth.mockReturnValue(makeDegradedServices(2));
    rerender(
      <Provider store={store}>
        <LoginPage />
      </Provider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("degraded-services-overlay")).toBeInTheDocument()
    );
  });

  test("does not show overlay for optional services in error state", () => {
    useAllServiceHealth.mockReturnValue([
      {
        name: "Traefik",
        state: "error",
        version: "n/a",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: true,
      },
      {
        name: "Gateway",
        state: "ok",
        version: "1.0.0",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
    ]);
    renderLogin();
    expect(screen.queryByTestId("degraded-services-overlay")).not.toBeInTheDocument();
  });
});
