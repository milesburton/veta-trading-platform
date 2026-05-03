import { sha256Async as fromAlias } from "@veta/frontend/lib/sha256";
import { describe, expect, it } from "vitest";
import { sha256Async as fromRelative } from "../sha256";

describe("@veta/frontend/* alias", () => {
  it("resolves to the same module as a relative import", () => {
    expect(fromAlias).toBe(fromRelative);
  });
});
