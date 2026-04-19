import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTheme, saveTheme, setTheme, themeSlice } from "../themeSlice";

describe("themeSlice", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets theme via reducer action", () => {
    const next = themeSlice.reducer(undefined, setTheme("light"));
    expect(next.theme).toBe("light");
  });

  it("applies loaded theme on fulfilled loadTheme", () => {
    const action = loadTheme.fulfilled("high-contrast", "req-1");
    const next = themeSlice.reducer(undefined, action);
    expect(next.theme).toBe("high-contrast");
  });

  it("keeps existing theme when fulfilled payload is null", () => {
    const start = { theme: "darker" as const };
    const action = loadTheme.fulfilled(null, "req-2");
    const next = themeSlice.reducer(start, action);
    expect(next.theme).toBe("darker");
  });

  it("loadTheme returns theme when preferences fetch succeeds", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ theme: "light" }),
    });

    const thunk = loadTheme();
    const result = await thunk(vi.fn(), vi.fn(), undefined);

    expect(result.type).toBe("theme/load/fulfilled");
    expect(result.payload).toBe("light");
  });

  it("loadTheme returns null when preferences fetch fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    const thunk = loadTheme();
    const result = await thunk(vi.fn(), vi.fn(), undefined);

    expect(result.type).toBe("theme/load/fulfilled");
    expect(result.payload).toBeNull();
  });

  it("saveTheme merges existing prefs and writes theme", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspaces: [{ id: "ws-1" }],
          density: "compact",
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    const thunk = saveTheme("light");
    const result = await thunk(vi.fn(), vi.fn(), undefined);

    expect(result.type).toBe("theme/save/fulfilled");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putInit.method).toBe("PUT");
    const body = JSON.parse(String(putInit.body));
    expect(body).toMatchObject({
      theme: "light",
      density: "compact",
      workspaces: [{ id: "ws-1" }],
    });
  });

  it("saveTheme still writes theme when initial fetch throws", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true });

    const thunk = saveTheme("high-contrast");
    const result = await thunk(vi.fn(), vi.fn(), undefined);

    expect(result.type).toBe("theme/save/fulfilled");
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(putInit.body))).toEqual({
      theme: "high-contrast",
    });
  });
});
