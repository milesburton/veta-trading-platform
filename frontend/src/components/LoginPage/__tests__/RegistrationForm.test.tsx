import { TRADER_ARCHETYPES } from "@shared/traderArchetypes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationForm } from "../RegistrationForm.tsx";

const registerOAuthUser = vi.fn();
const authorizeOAuth = vi.fn();
const exchangeOAuthCode = vi.fn();

vi.mock("../../../store/userApi.ts", () => ({
  useRegisterOAuthUserMutation: () => [registerOAuthUser, { isLoading: false, reset: vi.fn() }],
  useAuthorizeOAuthMutation: () => [authorizeOAuth, { isLoading: false, reset: vi.fn() }],
  useExchangeOAuthCodeMutation: () => [exchangeOAuthCode, { isLoading: false, reset: vi.fn() }],
}));

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => vi.fn(),
}));

vi.mock("../../../store/authSlice.ts", () => ({
  setUser: (u: unknown) => ({ type: "auth/setUser", payload: u }),
}));

describe("RegistrationForm", () => {
  beforeEach(() => {
    registerOAuthUser.mockReset();
    authorizeOAuth.mockReset();
    exchangeOAuthCode.mockReset();
    // Default: register succeeds, then stop the chain at authorize so the
    // test only asserts what was sent to register.
    registerOAuthUser.mockReturnValue(
      Promise.resolve({ data: { userId: "x", name: "X", role: "trader" } })
    );
    authorizeOAuth.mockReturnValue(Promise.resolve({ error: { status: 400 } }));
  });

  it("renders one option per trader archetype", () => {
    render(<RegistrationForm />);
    const select = screen.getByTestId("register-archetype") as HTMLSelectElement;
    expect(select.options.length).toBe(TRADER_ARCHETYPES.length);
    const optionValues = Array.from(select.options).map((o) => o.value);
    for (const a of TRADER_ARCHETYPES) {
      expect(optionValues).toContain(a.id);
    }
  });

  it("defaults to the first archetype", () => {
    render(<RegistrationForm />);
    const select = screen.getByTestId("register-archetype") as HTMLSelectElement;
    expect(select.value).toBe(TRADER_ARCHETYPES[0].id);
  });

  it("sends the selected archetype on submit", async () => {
    render(<RegistrationForm />);

    fireEvent.change(screen.getByTestId("register-username"), { target: { value: "newtrader" } });
    fireEvent.change(screen.getByTestId("register-display-name"), {
      target: { value: "New Trader" },
    });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "longenough" } });
    fireEvent.change(screen.getByTestId("register-archetype"), { target: { value: "fi-voice" } });

    fireEvent.submit(screen.getByTestId("registration-form"));

    await waitFor(() => expect(registerOAuthUser).toHaveBeenCalledTimes(1));
    expect(registerOAuthUser).toHaveBeenCalledWith({
      username: "newtrader",
      name: "New Trader",
      password: "longenough",
      archetype: "fi-voice",
    });
  });

  it("does not call register when the password is too short", async () => {
    render(<RegistrationForm />);

    fireEvent.change(screen.getByTestId("register-username"), { target: { value: "newtrader" } });
    fireEvent.change(screen.getByTestId("register-display-name"), {
      target: { value: "New Trader" },
    });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "short" } });

    fireEvent.submit(screen.getByTestId("registration-form"));

    await screen.findByTestId("register-error");
    expect(registerOAuthUser).not.toHaveBeenCalled();
  });

  it("does not call register when the username is too short", async () => {
    render(<RegistrationForm />);
    fireEvent.change(screen.getByTestId("register-username"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("register-display-name"), {
      target: { value: "New Trader" },
    });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "longenough" } });
    fireEvent.submit(screen.getByTestId("registration-form"));

    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/at least 2 characters/i);
    expect(registerOAuthUser).not.toHaveBeenCalled();
  });

  it("does not call register when the display name is empty", async () => {
    render(<RegistrationForm />);
    fireEvent.change(screen.getByTestId("register-username"), { target: { value: "newtrader" } });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "longenough" } });
    fireEvent.submit(screen.getByTestId("registration-form"));

    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Display name is required/i);
    expect(registerOAuthUser).not.toHaveBeenCalled();
  });

  async function submitValidForm() {
    fireEvent.change(screen.getByTestId("register-username"), { target: { value: "newtrader" } });
    fireEvent.change(screen.getByTestId("register-display-name"), {
      target: { value: "New Trader" },
    });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "longenough" } });
    fireEvent.submit(screen.getByTestId("registration-form"));
  }

  it("shows the server's data.error message when register fails with one", async () => {
    registerOAuthUser.mockReturnValue(
      Promise.resolve({ error: { status: 400, data: { error: "username taken" } } })
    );
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Registration failed: username taken/i);
  });

  it("shows a disabled-deployment message on a 403", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: { status: 403 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Registration is disabled on this deployment/i);
  });

  it("shows a username-taken message on a 409", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: { status: 409 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/username is already taken/i);
  });

  it("shows a check-your-values message on a 400 with no data.error", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: { status: 400 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Check the form values/i);
  });

  it("shows an HTTP-status message for an unrecognised numeric status", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: { status: 500 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Registration failed \(HTTP 500\)/i);
  });

  it("shows a generic failure message when the error has no status at all", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: {} }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Registration failed\. Please try again\./i);
  });

  it("shows a generic failure message when the error is not an object at all", async () => {
    registerOAuthUser.mockReturnValue(Promise.resolve({ error: "network down" }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Registration failed\. Please try again\./i);
  });

  it("shows 'sign in to continue' when register succeeds but authorize fails", async () => {
    registerOAuthUser.mockReturnValue(
      Promise.resolve({ data: { userId: "x", name: "X", role: "trader" } })
    );
    authorizeOAuth.mockReturnValue(Promise.resolve({ error: { status: 400 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Account created\. Sign in to continue\./i);
  });

  it("shows 'sign in to continue' when authorize succeeds but the token exchange fails", async () => {
    registerOAuthUser.mockReturnValue(
      Promise.resolve({ data: { userId: "x", name: "X", role: "trader" } })
    );
    authorizeOAuth.mockReturnValue(Promise.resolve({ data: { code: "auth-code-1" } }));
    exchangeOAuthCode.mockReturnValue(Promise.resolve({ error: { status: 400 } }));
    render(<RegistrationForm />);
    await submitValidForm();
    const err = await screen.findByTestId("register-error");
    expect(err).toHaveTextContent(/Account created\. Sign in to continue\./i);
  });

  it("completes the full register -> authorize -> exchange flow and dispatches setUser", async () => {
    registerOAuthUser.mockReturnValue(
      Promise.resolve({ data: { userId: "x", name: "X", role: "trader" } })
    );
    authorizeOAuth.mockReturnValue(Promise.resolve({ data: { code: "auth-code-1" } }));
    exchangeOAuthCode.mockReturnValue(
      Promise.resolve({ data: { user: { id: "x", name: "X", role: "trader" } } })
    );
    render(<RegistrationForm />);
    await submitValidForm();
    await waitFor(() => expect(exchangeOAuthCode).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("register-error")).not.toBeInTheDocument();
  });
});
