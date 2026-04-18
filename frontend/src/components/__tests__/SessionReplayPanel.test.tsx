import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionReplayPanel } from "../SessionReplayPanel";
import { type AuthUser, authSlice } from "../../store/authSlice";
import type { ReplayConfig, ReplaySession } from "../../store/replayApi";
import { windowSlice } from "../../store/windowSlice";

const ADMIN_USER: AuthUser = {
  id: "u-admin",
  name: "Admin User",
  role: "admin",
  avatar_emoji: "A",
};

const TRADER_USER: AuthUser = {
  id: "u-trader",
  name: "Trader User",
  role: "trader",
  avatar_emoji: "T",
};

function makeSession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  return {
    id: "sess-001",
    userId: "u-1",
    userName: "Alice Chen",
    userRole: "trader",
    startedAt: "2026-04-01T10:00:00Z",
    endedAt: "2026-04-01T10:05:00Z",
    durationMs: 300000,
    metadata: {},
    ...overrides,
  };
}

let mockConfig: ReplayConfig = {
  recordingEnabled: false,
  updatedBy: null,
  updatedAt: "2026-04-01T00:00:00Z",
};
let mockSessions: { sessions: ReplaySession[]; total: number } = {
  sessions: [],
  total: 0,
};
let mockEvents: { events: unknown[] } = { events: [] };
const mockUpdateConfig = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock("../../store/replayApi.ts", () => ({
  useGetReplayConfigQuery: () => ({ data: mockConfig, isLoading: false }),
  useUpdateReplayConfigMutation: () => [mockUpdateConfig, { isLoading: false }],
  useListSessionsQuery: () => ({
    data: mockSessions,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useDeleteSessionMutation: () => [mockDeleteSession, { isLoading: false }],
  useGetSessionEventsQuery: () => ({ data: mockEvents, isLoading: false }),
}));

vi.mock("rrweb-player", () => ({
  default: class {
    $destroy() {}
  },
}));

function makeStore(user: AuthUser | null = ADMIN_USER) {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      auth: {
        user,
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: user
          ? ("authenticated" as const)
          : ("unauthenticated" as const),
      },
    },
  });
}

function renderPanel(user: AuthUser | null = ADMIN_USER) {
  const store = makeStore(user);
  return render(
    <Provider store={store}>
      <SessionReplayPanel />
    </Provider>,
  );
}

afterEach(() => {
  cleanup();
  mockConfig = {
    recordingEnabled: false,
    updatedBy: null,
    updatedAt: "2026-04-01T00:00:00Z",
  };
  mockSessions = { sessions: [], total: 0 };
  mockEvents = { events: [] };
});

describe("SessionReplayPanel — empty state, recording disabled", () => {
  it("shows message to enable recording when no sessions exist", () => {
    renderPanel();
    expect(
      screen.getByText(/No recorded sessions\. Enable recording/i),
    ).toBeInTheDocument();
  });

  it("renders the Session Replay header", () => {
    renderPanel();
    expect(screen.getByText(/Session Replay/i)).toBeInTheDocument();
  });
});

describe("SessionReplayPanel — recording enabled, no sessions", () => {
  beforeEach(() => {
    mockConfig = {
      recordingEnabled: true,
      updatedBy: null,
      updatedAt: "2026-04-01T00:00:00Z",
    };
  });

  it("shows recording active message", () => {
    renderPanel();
    expect(
      screen.getByText(
        /Recording is active\. Sessions will appear here once completed\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe("SessionReplayPanel — session list rendering", () => {
  beforeEach(() => {
    mockSessions = {
      sessions: [
        makeSession({
          id: "s1",
          userName: "Alice Chen",
          userRole: "trader",
          durationMs: 300000,
        }),
        makeSession({
          id: "s2",
          userName: "Bob Martinez",
          userRole: "admin",
          durationMs: 75000,
          startedAt: "2026-04-01T11:00:00Z",
          endedAt: "2026-04-01T11:01:15Z",
        }),
      ],
      total: 2,
    };
  });

  it("renders session user names", () => {
    renderPanel();
    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
    expect(screen.getByText("Bob Martinez")).toBeInTheDocument();
  });

  it("renders session roles", () => {
    renderPanel();
    expect(screen.getAllByText("trader").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("admin").length).toBeGreaterThanOrEqual(1);
  });

  it("renders duration for ended sessions", () => {
    renderPanel();
    expect(screen.getByText("5m 0s")).toBeInTheDocument();
    expect(screen.getByText("1m 15s")).toBeInTheDocument();
  });

  it("renders total session count", () => {
    renderPanel();
    expect(screen.getByText(/2 sessions total/i)).toBeInTheDocument();
  });
});

describe("SessionReplayPanel — admin toggle", () => {
  it("admin user sees the toggle switch", () => {
    renderPanel(ADMIN_USER);
    const toggles = screen
      .getAllByRole("button")
      .filter((b) => b.classList.contains("rounded-full"));
    expect(toggles.length).toBeGreaterThan(0);
  });

  it("non-admin user does not see toggle switch", () => {
    renderPanel(TRADER_USER);
    const toggles = screen
      .getAllByRole("button")
      .filter((b) => b.classList.contains("rounded-full"));
    expect(toggles.length).toBe(0);
  });
});

describe("SessionReplayPanel — REC indicator", () => {
  it("shows REC when recording enabled", () => {
    mockConfig = {
      recordingEnabled: true,
      updatedBy: null,
      updatedAt: "2026-04-01T00:00:00Z",
    };
    renderPanel();
    expect(screen.getByText("REC")).toBeInTheDocument();
  });

  it("does not show REC when recording disabled", () => {
    renderPanel();
    expect(screen.queryByText("REC")).not.toBeInTheDocument();
  });
});

describe("SessionReplayPanel — play button", () => {
  it("play button is disabled for live sessions (no endedAt)", () => {
    mockSessions = {
      sessions: [
        makeSession({ id: "live-1", endedAt: null, durationMs: null }),
      ],
      total: 1,
    };
    renderPanel();
    const playBtn = screen.getByRole("button", { name: /Play/i });
    expect(playBtn).toBeDisabled();
  });

  it("play button is enabled for ended sessions", () => {
    mockSessions = {
      sessions: [makeSession({ id: "ended-1" })],
      total: 1,
    };
    renderPanel();
    const playBtn = screen.getByRole("button", { name: /Play/i });
    expect(playBtn).not.toBeDisabled();
  });

  it("clicking play navigates to player view", () => {
    mockSessions = {
      sessions: [makeSession({ id: "ended-session-id-abcdef" })],
      total: 1,
    };
    renderPanel();
    const playBtn = screen.getByRole("button", { name: /Play/i });
    fireEvent.click(playBtn);
    expect(screen.getByText(/Back to sessions/i)).toBeInTheDocument();
  });
});

describe("SessionReplayPanel — player back button", () => {
  it("back button returns to session list", () => {
    mockSessions = {
      sessions: [makeSession({ id: "ended-session-back-test" })],
      total: 1,
    };
    renderPanel();
    const playBtn = screen.getByRole("button", { name: /Play/i });
    fireEvent.click(playBtn);
    const backBtn = screen.getByRole("button", { name: /Back to sessions/i });
    fireEvent.click(backBtn);
    expect(screen.getByText(/Session Replay/i)).toBeInTheDocument();
  });
});
