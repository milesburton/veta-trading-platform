import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSharedWorkspace,
  fetchSharedWorkspace,
  listSharedWorkspaces,
  loadWorkspacePrefs,
  publishSharedWorkspace,
  saveWorkspacePrefs,
} from "../useWorkspaceSync";

describe("useWorkspaceSync helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads prefs and preserves unrelated preference fields", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        theme: "dark",
        workspaces: [{ id: "ws-1", name: "Main" }],
        layouts: { "ws-1": { layout: { type: "row", children: [] } } },
      }),
    });

    const loaded = await loadWorkspacePrefs();
    expect(loaded).toEqual({
      workspaces: [{ id: "ws-1", name: "Main" }],
      layouts: { "ws-1": { layout: { type: "row", children: [] } } },
    });

    fetchMock.mockResolvedValueOnce({ ok: true });
    await saveWorkspacePrefs({
      workspaces: [{ id: "ws-2", name: "Desk" }],
      layouts: { "ws-2": { layout: { type: "row", children: [] } } },
    });

    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      theme: "dark",
      workspaces: [{ id: "ws-2", name: "Desk" }],
    });
  });

  it("returns null when loading prefs fails validation or request", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(loadWorkspacePrefs()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workspaces: [] }),
    });
    await expect(loadWorkspacePrefs()).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(loadWorkspacePrefs()).resolves.toBeNull();
  });

  it("dispatches workspace-save-error events for failed saves", async () => {
    const listener = vi.fn();
    window.addEventListener("workspace-save-error", listener as EventListener);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await saveWorkspacePrefs({ workspaces: [], layouts: {} });
    expect(listener).toHaveBeenCalledTimes(1);
    const firstEvent = listener.mock.calls[0][0] as CustomEvent;
    expect(firstEvent.detail).toEqual({ status: 503 });

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await saveWorkspacePrefs({ workspaces: [], layouts: {} });
    expect(listener).toHaveBeenCalledTimes(2);
    const secondEvent = listener.mock.calls[1][0] as CustomEvent;
    expect(secondEvent.detail).toEqual({ status: 0 });
  });

  it("lists and fetches shared workspaces with graceful fallback", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "shared-1", name: "Shared" }],
    });
    await expect(listSharedWorkspaces()).resolves.toEqual([{ id: "shared-1", name: "Shared" }]);

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(listSharedWorkspaces()).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "shared-1",
        name: "Shared",
        model: { layout: {} },
      }),
    });
    await expect(fetchSharedWorkspace("shared-1")).resolves.toMatchObject({
      id: "shared-1",
      name: "Shared",
    });

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(fetchSharedWorkspace("missing")).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(fetchSharedWorkspace("error")).resolves.toBeNull();
  });

  it("publishes and deletes shared workspaces", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new-id" }),
    });
    await expect(
      publishSharedWorkspace("Desk", "Desc", {
        layout: { type: "row", children: [] },
      })
    ).resolves.toBe("new-id");

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(
      publishSharedWorkspace("Desk", "Desc", {
        layout: { type: "row", children: [] },
      })
    ).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: true });
    await expect(deleteSharedWorkspace("shared-1")).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(deleteSharedWorkspace("shared-2")).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(deleteSharedWorkspace("shared-3")).resolves.toBe(false);
  });
});
