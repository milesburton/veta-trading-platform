import { useSignal } from "@preact/signals-react";
import { setUser } from "@veta/frontend/store/authSlice.ts";
import { useAppDispatch } from "@veta/frontend/store/hooks.ts";
import {
  useCompleteOidcSignInMutation,
  useGetOidcConfigQuery,
  useStartOidcSignInMutation,
} from "@veta/frontend/store/userApi.ts";
import { useEffect, useRef } from "react";

const RETURN_PARAMS = ["code", "state", "error", "error_description"] as const;

export function readOidcReturn(search: string): {
  code: string | null;
  state: string | null;
  error: string | null;
} {
  const params = new URLSearchParams(search);
  return { code: params.get("code"), state: params.get("state"), error: params.get("error") };
}

export function withoutOidcReturn(href: string): string {
  const url = new URL(href);
  for (const name of RETURN_PARAMS) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}

function describeFailure(status: unknown): string {
  if (status === 401) {
    return "Single sign-on needs a second factor. If you have just registered an authenticator, sign in again to finish.";
  }
  if (status === 409) return "Single sign-on failed: a local account already uses this name.";
  if (status === 400) return "Single sign-on expired or was interrupted. Try again.";
  return "Single sign-on is unavailable. Try again shortly.";
}

const leaveForProvider = (url: string) => window.location.assign(url);

export function SingleSignOn({
  disabled,
  navigate = leaveForProvider,
}: {
  disabled: boolean;
  navigate?: (url: string) => void;
}) {
  const dispatch = useAppDispatch();
  const { data: config } = useGetOidcConfigQuery();
  const [startSignIn] = useStartOidcSignInMutation();
  const [completeSignIn] = useCompleteOidcSignInMutation();
  const busy = useSignal(false);
  const failure = useSignal<string | null>(null);
  const handledReturn = useRef(false);

  useEffect(() => {
    if (handledReturn.current) return;
    const { code, state, error } = readOidcReturn(window.location.search);
    if (!error && !(code && state)) return;
    handledReturn.current = true;
    window.history.replaceState(null, "", withoutOidcReturn(window.location.href));
    if (error || !code || !state) {
      failure.value = "Single sign-on was cancelled or refused by the identity provider.";
      return;
    }
    busy.value = true;
    void completeSignIn({ code, state }).then((result) => {
      busy.value = false;
      if ("data" in result && result.data?.user) {
        dispatch(setUser(result.data.user));
        return;
      }
      const status = "error" in result ? (result.error as { status?: unknown }).status : undefined;
      failure.value = describeFailure(status);
    });
  }, [busy, completeSignIn, dispatch, failure]);

  async function handleClick() {
    failure.value = null;
    busy.value = true;
    const result = await startSignIn();
    if ("data" in result && result.data?.authorization_url) {
      navigate(result.data.authorization_url);
      return;
    }
    busy.value = false;
    failure.value = "Single sign-on is unavailable. Try again shortly.";
  }

  if (!config?.enabled && !busy.value && !failure.value) return null;

  return (
    <div className="flex flex-col gap-2">
      {config?.enabled && (
        <button
          type="button"
          data-testid="sso-login-button"
          onClick={handleClick}
          disabled={disabled || busy.value}
          className="w-full inline-flex items-center justify-center gap-2 rounded border border-emerald-700 bg-page px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-emerald-500 disabled:opacity-50"
        >
          {busy.value ? "Signing in…" : "Sign in with single sign-on"}
        </button>
      )}
      {config?.enabled && (
        <p className="text-muted text-[10px]">
          For named accounts. Requires a second factor. Demo personas sign in below.
        </p>
      )}
      {failure.value && (
        <div
          data-testid="sso-error"
          role="alert"
          className="px-3 py-2 rounded-lg border border-red-900 bg-red-950 text-red-200 text-xs"
        >
          {failure.value}
        </div>
      )}
    </div>
  );
}
