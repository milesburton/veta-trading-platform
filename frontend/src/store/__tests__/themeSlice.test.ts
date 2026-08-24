import { loadTheme, saveTheme, setTheme, themeSlice } from "@veta/frontend/store/themeSlice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const [, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(getInit.credentials).toBe("include");
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
    expect(putInit.credentials).toBe("include");
    const body = JSON.parse(String(putInit.body));
    expect(body).toMatchObject({
      theme: "light",
      density: "compact",
      workspaces: [{ id: "ws-1" }],
    });
  });

  it("saveTheme still writes theme when initial fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true });

    const thunk = saveTheme("high-contrast");
    const result = await thunk(vi.fn(), vi.fn(), undefined);

    expect(result.type).toBe("theme/save/fulfilled");
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(putInit.body))).toEqual({
      theme: "high-contrast",
    });
  });
});

describe("themeSlice initial state (localStorage-derived)", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("defaults to 'dark' when localStorage has no saved theme", async () => {
    localStorage.removeItem("veta-theme");
    vi.resetModules();
    const mod = await import("@veta/frontend/store/themeSlice");
    expect(mod.themeSlice.getInitialState().theme).toBe("dark");
  });

  it("uses the saved theme from localStorage when it's a valid Theme value", async () => {
    localStorage.setItem("veta-theme", "high-contrast");
    vi.resetModules();
    const mod = await import("@veta/frontend/store/themeSlice");
    expect(mod.themeSlice.getInitialState().theme).toBe("high-contrast");
  });

  it("falls back to 'dark' when localStorage holds an invalid theme value", async () => {
    localStorage.setItem("veta-theme", "not-a-real-theme");
    vi.resetModules();
    const mod = await import("@veta/frontend/store/themeSlice");
    expect(mod.themeSlice.getInitialState().theme).toBe("dark");
  });
});
