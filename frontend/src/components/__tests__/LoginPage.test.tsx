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
    expect(screen.getByTestId("login-heading")).toHaveTextContent("Sign in");
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

  test("renders footer with author and github link", () => {
    renderLogin({ buildDate: "2026-03-08", commitSha: "abc1234" });

    expect(screen.getByText(/Miles Burton/)).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toHaveAttribute(
      "href",
      "https://github.com/milesburton/veta-trading-platform"
    );
    expect(screen.getByText("vabc1234")).toBeInTheDocument();
    expect(screen.getByText("Alert Ops")).toBeInTheDocument();
  });

  test("renders footer without build info when props omitted", () => {
    renderLogin();
    expect(screen.getByText(/Miles Burton/)).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  test("does not render platform status section", () => {
    renderLogin();
    expect(screen.queryByTestId("platform-status")).not.toBeInTheDocument();
  });
});
