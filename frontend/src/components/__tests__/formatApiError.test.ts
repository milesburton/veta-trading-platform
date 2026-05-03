import { describe, expect, it } from "vitest";
import { formatApiError } from "../LoginPage";

describe("formatApiError", () => {
  it("falls back to a generic message for null", () => {
    expect(formatApiError(null)).toMatch(/Check your username and passcode/);
  });

  it("falls back to a generic message for non-objects", () => {
    expect(formatApiError("oops")).toMatch(/Check your username and passcode/);
    expect(formatApiError(42)).toMatch(/Check your username and passcode/);
  });

  it("uses data.error if present", () => {
    expect(formatApiError({ data: { error: "user_locked" } })).toBe("Sign in failed: user_locked");
  });

  it("uses data.message when data.error absent", () => {
    expect(formatApiError({ data: { message: "account suspended" } })).toBe(
      "Sign in failed: account suspended"
    );
  });

  it("returns a specific message for HTTP 401", () => {
    expect(formatApiError({ status: 401 })).toMatch(/invalid username or passcode/);
  });

  it("returns a specific message for HTTP 403", () => {
    expect(formatApiError({ status: 403 })).toMatch(/not permitted/);
  });

  it("returns a generic HTTP message for other numeric status codes", () => {
    expect(formatApiError({ status: 500 })).toBe("Sign in failed (HTTP 500).");
  });

  it("falls back when status is non-numeric", () => {
    expect(formatApiError({ status: "boom" })).toMatch(/user-service is reachable/);
  });
});
