import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { servicesApi } from "../../store/servicesApi";
import { LoginPage } from "../LoginPage";

vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  };
});

function makeStore() {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
    },
    middleware: (m) => m().concat(servicesApi.middleware),
  });
}

function renderLogin(props: { buildDate?: string; commitSha?: string } = {}) {
  return render(
    <Provider store={makeStore()}>
      <LoginPage {...props} />
    </Provider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  test("disables all buttons while one is loading", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderLogin();

    fireEvent.click(screen.getByTestId("user-btn-alice"));

    await waitFor(() => {
      for (const id of [
        "user-btn-alice",
        "user-btn-bob",
        "user-btn-carol",
        "user-btn-dave",
        "user-btn-admin",
      ]) {
        expect(screen.getByTestId(id)).toBeDisabled();
      }
    });
  });

  test("dispatches setUser on successful login", async () => {
    const authUser = { id: "alice", name: "Alice Chen", role: "trader", sessionToken: "tok123" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(authUser), { status: 200 })
    );
    const store = makeStore();

    render(
      <Provider store={store}>
        <LoginPage />
      </Provider>
    );

    fireEvent.click(screen.getByTestId("user-btn-alice"));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe("alice"));
  });

  test("shows error message on failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    renderLogin();

    fireEvent.click(screen.getByTestId("user-btn-bob"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
      expect(screen.getByTestId("login-error")).toHaveTextContent("Login failed");
    });
  });

  test("shows error message on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    renderLogin();

    fireEvent.click(screen.getByTestId("user-btn-carol"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toHaveTextContent("Network error");
    });
  });

  test("re-enables buttons after login attempt completes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    renderLogin();

    fireEvent.click(screen.getByTestId("user-btn-dave"));

    await waitFor(() => screen.getByTestId("login-error"));

    for (const id of [
      "user-btn-alice",
      "user-btn-bob",
      "user-btn-carol",
      "user-btn-dave",
      "user-btn-admin",
    ]) {
      expect(screen.getByTestId(id)).not.toBeDisabled();
    }
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
});
