import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsSourcesPanel } from "../NewsSourcesPanel";

const refetch = vi.fn();
const toggleNewsSource = vi.fn();
const createNewsSource = vi.fn();
const updateNewsSource = vi.fn();
const deleteNewsSource = vi.fn();

const state = {
  isLoading: false,
  isError: false,
  sources: [
    {
      id: "src-1",
      label: "Reuters",
      rssTemplate: "https://example.com/reuters",
      enabled: true,
      symbolSpecific: false,
    },
    {
      id: "src-2",
      label: "Symbol Feed",
      rssTemplate: "https://example.com/{symbol}",
      enabled: false,
      symbolSpecific: true,
    },
  ],
};

vi.mock("../../store/newsApi.ts", () => ({
  useGetNewsSourcesQuery: () => ({
    data: state.sources,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch,
  }),
  useToggleNewsSourceMutation: () => [
    toggleNewsSource,
    { isLoading: false, originalArgs: null },
  ],
  useCreateNewsSourceMutation: () => [createNewsSource, { isLoading: false }],
  useUpdateNewsSourceMutation: () => [updateNewsSource, { isLoading: false }],
  useDeleteNewsSourceMutation: () => [deleteNewsSource, { isLoading: false }],
}));

function renderPanel() {
  render(<NewsSourcesPanel />);
}

describe("NewsSourcesPanel", () => {
  beforeEach(() => {
    state.isLoading = false;
    state.isError = false;
    state.sources = [
      {
        id: "src-1",
        label: "Reuters",
        rssTemplate: "https://example.com/reuters",
        enabled: true,
        symbolSpecific: false,
      },
      {
        id: "src-2",
        label: "Symbol Feed",
        rssTemplate: "https://example.com/{symbol}",
        enabled: false,
        symbolSpecific: true,
      },
    ];

    refetch.mockReset();
    toggleNewsSource.mockReset();
    createNewsSource.mockReset();
    updateNewsSource.mockReset();
    deleteNewsSource.mockReset();

    createNewsSource.mockResolvedValue({});
    updateNewsSource.mockResolvedValue({});
    deleteNewsSource.mockResolvedValue({});
  });

  it("shows loading state", () => {
    state.isLoading = true;
    renderPanel();
    expect(screen.getByText(/Loading sources/i)).toBeInTheDocument();
  });

  it("shows error state and supports retry", () => {
    state.isError = true;
    renderPanel();

    expect(
      screen.getByText(/Could not reach news-aggregator/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders existing sources and toggles one", () => {
    renderPanel();

    expect(screen.getByText("Reuters")).toBeInTheDocument();
    expect(screen.getByText("Symbol Feed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Disable/i }));
    expect(toggleNewsSource).toHaveBeenCalledWith("src-1");
  });

  it("adds a new source via add form", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Add news source/i }));
    fireEvent.change(screen.getByPlaceholderText(/Label/i), {
      target: { value: "Bloomberg" },
    });
    fireEvent.change(screen.getByPlaceholderText(/RSS URL/i), {
      target: { value: "https://example.com/bloomberg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(createNewsSource).toHaveBeenCalledWith({
        label: "Bloomberg",
        rssTemplate: "https://example.com/bloomberg",
        symbolSpecific: false,
        enabled: true,
      });
    });
  });

  it("edits and deletes a source", async () => {
    renderPanel();

    fireEvent.click(screen.getByTitle("Edit Reuters"));
    fireEvent.change(screen.getByDisplayValue("Reuters"), {
      target: { value: "Reuters Pro" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(updateNewsSource).toHaveBeenCalledWith({
        id: "src-1",
        label: "Reuters Pro",
        rssTemplate: "https://example.com/reuters",
        symbolSpecific: false,
      });
    });

    fireEvent.click(screen.getByTitle("Delete Reuters"));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(deleteNewsSource).toHaveBeenCalledWith("src-1");
    });
  });
});
