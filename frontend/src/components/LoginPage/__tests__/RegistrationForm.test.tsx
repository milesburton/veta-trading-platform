import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TRADER_ARCHETYPES } from "@shared/traderArchetypes";
import { RegistrationForm } from "@veta/frontend/components/LoginPage/RegistrationForm";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    registerOAuthUser.mockReturnValue(Promise.resolve({ data: { userId: "x", name: "X", role: "trader" } }));
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
    fireEvent.change(screen.getByTestId("register-display-name"), { target: { value: "New Trader" } });
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
    fireEvent.change(screen.getByTestId("register-display-name"), { target: { value: "New Trader" } });
    fireEvent.change(screen.getByTestId("register-password"), { target: { value: "short" } });

    fireEvent.submit(screen.getByTestId("registration-form"));

    await screen.findByTestId("register-error");
    expect(registerOAuthUser).not.toHaveBeenCalled();
  });
});
