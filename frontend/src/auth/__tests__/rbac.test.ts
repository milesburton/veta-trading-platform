import { describe, expect, it } from "vitest";
import { AUTH_ROLES, canSubmitOrders, NON_TRADING_ROLES, ROLE_LABELS } from "../rbac";

describe("auth/rbac", () => {
  describe("AUTH_ROLES", () => {
    it("contains the expected set of roles", () => {
      expect(AUTH_ROLES).toContain("trader");
      expect(AUTH_ROLES).toContain("admin");
      expect(AUTH_ROLES).toContain("compliance");
      expect(AUTH_ROLES).toHaveLength(8);
    });
  });

  describe("NON_TRADING_ROLES", () => {
    it("does not include the trader role", () => {
      expect(NON_TRADING_ROLES.has("trader")).toBe(false);
    });

    it("includes admin and risk-manager", () => {
      expect(NON_TRADING_ROLES.has("admin")).toBe(true);
      expect(NON_TRADING_ROLES.has("risk-manager")).toBe(true);
    });
  });

  describe("ROLE_LABELS", () => {
    it("has a display label for every role", () => {
      for (const role of AUTH_ROLES) {
        expect(ROLE_LABELS[role]).toBeTruthy();
      }
    });
  });

  describe("canSubmitOrders", () => {
    it("returns true only for the trader role", () => {
      expect(canSubmitOrders("trader")).toBe(true);
    });

    it("returns false for non-trading roles", () => {
      expect(canSubmitOrders("admin")).toBe(false);
      expect(canSubmitOrders("compliance")).toBe(false);
      expect(canSubmitOrders("viewer")).toBe(false);
    });

    it("returns false when role is undefined", () => {
      expect(canSubmitOrders(undefined)).toBe(false);
    });
  });
});
