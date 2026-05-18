import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginPage } from "@veta/frontend/components/LoginPage";
import { type AuthUser, authSlice } from "@veta/frontend/store/authSlice";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { userApi } from "@veta/frontend/store/userApi";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, test, vi } from "vitest";

// LoginPage now embeds the shared <AppHeader />. The chrome itself is tested
// in StatusBar.test.tsx; here we mock it so these tests stay focused on the
// auth form behaviour.
vi.mock("../StatusBar", () => ({
  AppHeader: () => <div data-testid="app-header-mock" />,
  useAllServiceHealth: () => [],
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
  });

  test("embeds the shared app header and renders the credential form", () => {
    renderLogin();

    expect(screen.getByTestId("app-header-mock")).toBeInTheDocument();
    expect(screen.getByTestId("login-heading")).toHaveTextContent("Sign in");
    expect(screen.getByTestId("oauth-username")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-password")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-submit")).toBeInTheDocument();
  });

  test("does not render registration mode controls", () => {
    renderLogin();
    expect(screen.queryByTestId("oauth-mode-register")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-mode-signin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-display-name")).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });

  test("calls OAuth authorize and token endpoints on sign in", async () => {
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "bob" },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
    await waitFor(() => expect(mockExchangeOAuthCode).toHaveBeenCalled());
  });

  test("does not duplicate footer chrome — build info lives in the shared AppHeader", () => {
    renderLogin();
    // Build info, GitHub link, and author attribution are now part of AppHeader,
    // mocked above. The login layout itself adds no footer.
    expect(screen.queryByText(/Miles Burton/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-build-info")).not.toBeInTheDocument();
  });

  test("shows specific error when OAuth returns 401", async () => {
    mockAuthorizeOAuth.mockResolvedValue({ error: { status: 401 } } as never);
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "bad" },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));
    await waitFor(() => expect(mockAuthorizeOAuth).toHaveBeenCalled());
  });

  test("surfaces a visible error when PKCE generation throws", async () => {
    sha256AsyncMock.mockRejectedValueOnce(new Error("crypto.subtle is undefined"));
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    fireEvent.click(screen.getByTestId("oauth-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/crypto.subtle is undefined/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });

  test("rejects empty username with a local validation error before hitting the API", async () => {
    renderLogin();
    // useSignal initialises username to "alice" — explicitly clear it so the
    // !normalizedUsername guard fires.
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    // fireEvent.submit on the form is more reliable in jsdom than clicking
    // a type=submit button (jsdom doesn't always synthesise the submit
    // event from a button click).
    const form = screen.getByTestId("oauth-username").closest("form");
    if (!form) throw new Error("oauth-username has no enclosing form");
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/Username is required/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });

  test("rejects empty password with a local validation error before hitting the API", async () => {
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "alice" },
    });
    // useSignal initialises password to a default — explicitly clear it.
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "" },
    });
    const form = screen.getByTestId("oauth-username").closest("form");
    if (!form) throw new Error("oauth-username has no enclosing form");
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/Passcode is required/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });

  test("rejects whitespace-only username (covers the trim() guard)", async () => {
    renderLogin();
    fireEvent.change(screen.getByTestId("oauth-username"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByTestId("oauth-password"), {
      target: { value: "veta-dev-passcode" },
    });
    const form = screen.getByTestId("oauth-username").closest("form");
    if (!form) throw new Error("oauth-username has no enclosing form");
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByTestId("login-error")).toHaveTextContent(/Username is required/)
    );
    expect(mockAuthorizeOAuth).not.toHaveBeenCalled();
  });
});

describe("LoginPage – DegradedServicesOverlay", () => {
  const { useAllServiceHealth } = vi.hoisted(() => ({
    useAllServiceHealth: vi.fn(() => [] as import("../../types").ServiceHealth[]),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    // Override the StatusBar mock to control useAllServiceHealth per-test
    vi.mock("../StatusBar", () => ({
      AppHeader: () => <div data-testid="app-header-mock" />,
      useAllServiceHealth,
    }));
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
        version: "—",
        meta: {},
        lastChecked: Date.now(),
        url: "",
        optional: false,
      },
      {
        name: "EMS",
        state: "error",
        version: "—",
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
        version: "—",
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
        version: "—",
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

  test("does not show overlay for optional services in error state", () => {
    useAllServiceHealth.mockReturnValue([
      {
        name: "Traefik",
        state: "error",
        version: "—",
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
