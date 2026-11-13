import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readOidcReturn, SingleSignOn, withoutOidcReturn } from "../SingleSignOn.tsx";

const startSignIn = vi.fn();
const completeSignIn = vi.fn();
const dispatch = vi.fn();
const config = vi.fn<() => { enabled: boolean } | undefined>();

vi.mock("../../../store/userApi.ts", () => ({
  useGetOidcConfigQuery: () => ({ data: config() }),
  useStartOidcSignInMutation: () => [startSignIn, { isLoading: false }],
  useCompleteOidcSignInMutation: () => [completeSignIn, { isLoading: false }],
}));

vi.mock("../../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
}));

vi.mock("../../../store/authSlice.ts", () => ({
  setUser: (u: unknown) => ({ type: "auth/setUser", payload: u }),
}));

const assign = vi.fn();

const visit = (search: string) => {
  window.history.replaceState(null, "", `/${search}`);
};

describe("SingleSignOn", () => {
  beforeEach(() => {
    startSignIn.mockReset();
    completeSignIn.mockReset();
    dispatch.mockReset();
    assign.mockReset();
    config.mockReturnValue({ enabled: true });
    visit("");
  });

  it("renders nothing when single sign-on is disabled", () => {
    config.mockReturnValue({ enabled: false });
    const { container } = render(<SingleSignOn disabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while the configuration is unknown", () => {
    config.mockReturnValue(undefined);
    const { container } = render(<SingleSignOn disabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("sends the browser to the identity provider", async () => {
    startSignIn.mockResolvedValue({
      data: { authorization_url: "https://idp.test/authorize?x=1" },
    });
    render(<SingleSignOn disabled={false} navigate={assign} />);
    fireEvent.click(screen.getByTestId("sso-login-button"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://idp.test/authorize?x=1"));
    expect(screen.queryByTestId("sso-error")).toBeNull();
  });

  it("reports a failure to start", async () => {
    startSignIn.mockResolvedValue({ error: { status: 503 } });
    render(<SingleSignOn disabled={false} navigate={assign} />);
    fireEvent.click(screen.getByTestId("sso-login-button"));
    await waitFor(() =>
      expect(screen.getByTestId("sso-error").textContent).toContain("unavailable")
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("is disabled while another sign-in is in progress", () => {
    render(<SingleSignOn disabled={true} />);
    expect((screen.getByTestId("sso-login-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("completes the sign-in on return and removes the code from the address", async () => {
    const user = { id: "carol", name: "Carol", role: "trader", avatar_emoji: "🔐" };
    completeSignIn.mockResolvedValue({ data: { user } });
    visit("?code=abc&state=xyz&keep=1");
    render(<SingleSignOn disabled={false} />);
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "auth/setUser", payload: user })
    );
    expect(completeSignIn).toHaveBeenCalledWith({ code: "abc", state: "xyz" });
    expect(window.location.search).toBe("?keep=1");
  });

  it.each([
    [401, "second factor"],
    [409, "local account"],
    [400, "expired"],
    [502, "unavailable"],
  ])("explains a %s refusal", async (status, text) => {
    completeSignIn.mockResolvedValue({ error: { status } });
    visit("?code=abc&state=xyz");
    render(<SingleSignOn disabled={false} />);
    await waitFor(() => expect(screen.getByTestId("sso-error").textContent).toContain(text));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("shows a provider error without calling the platform", async () => {
    visit("?error=access_denied&state=xyz");
    render(<SingleSignOn disabled={false} />);
    await waitFor(() => expect(screen.getByTestId("sso-error").textContent).toContain("cancelled"));
    expect(completeSignIn).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("shows a return error even when single sign-on is reported disabled", async () => {
    config.mockReturnValue({ enabled: false });
    visit("?error=access_denied");
    render(<SingleSignOn disabled={false} />);
    await waitFor(() => expect(screen.getByTestId("sso-error")).toBeTruthy());
    expect(screen.queryByTestId("sso-login-button")).toBeNull();
  });
});

describe("single sign-on return helpers", () => {
  it("reads the return parameters", () => {
    expect(readOidcReturn("?code=a&state=b")).toEqual({ code: "a", state: "b", error: null });
    expect(readOidcReturn("")).toEqual({ code: null, state: null, error: null });
  });

  it("strips only the return parameters", () => {
    expect(
      withoutOidcReturn("https://veta.test/app?code=a&state=b&tab=2&error=x&error_description=y#h")
    ).toBe("/app?tab=2#h");
    expect(withoutOidcReturn("https://veta.test/")).toBe("/");
  });
});
