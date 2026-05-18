import { describe, expect, it } from "vitest";
import { commitUrl, isShortSha } from "../githubLinks";

describe("commitUrl", () => {
  it("returns a commit URL when a real sha is provided", () => {
    const url = commitUrl("abc1234567");
    expect(url).toMatch(/^https?:\/\/.+\/commit\/abc1234567$/);
  });

  it("returns null for the 'dev' sentinel", () => {
    expect(commitUrl("dev")).toBeNull();
  });

  it("returns null for an empty sha", () => {
    expect(commitUrl("")).toBeNull();
  });
});

describe("isShortSha", () => {
  it("accepts a 7-character hex sha", () => {
    expect(isShortSha("abc1234")).toBe(true);
  });

  it("accepts a 40-character hex sha", () => {
    expect(isShortSha("0123456789abcdef0123456789abcdef01234567")).toBe(true);
  });

  it("rejects 'dev'", () => {
    expect(isShortSha("dev")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isShortSha("")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isShortSha("xyz1234")).toBe(false);
  });
});
