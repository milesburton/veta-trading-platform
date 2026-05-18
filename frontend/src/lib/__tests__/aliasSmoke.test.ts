import { sha256Async as fromAlias, sha256Async as fromRelative } from "@veta/frontend/lib/sha256";
import { describe, expect, it } from "vitest";

describe("@veta/frontend/* alias", () => {
  it("resolves to the same module as a relative import", () => {
    expect(fromAlias).toBe(fromRelative);
  });
});
