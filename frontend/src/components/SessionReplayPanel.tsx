import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import {
  type ReplaySession,
  useDeleteSessionMutation,
  useGetReplayConfigQuery,
  useGetSessionEventsQuery,
  useListSessionsQuery,
  useUpdateReplayConfigMutation,
} from "../store/replayApi.ts";
import { formatTime } from "../utils/format.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function formatDuration(ms: number | null): string {
  if (!ms) return "--";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function SessionList({ onSelect }: { onSelect: (id: string) => void }) {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "admin" || user?.role === "compliance";
  const { data: config } = useGetReplayConfigQuery();
  const [updateConfig] = useUpdateReplayConfigMutation();
  const { data, isLoading, refetch } = useListSessionsQuery({ limit: 50 });
  const [deleteSession] = useDeleteSessionMutation();

  const handleToggle = useCallback(() => {
    if (!config || !user) return;
    updateConfig({ enabled: !config.recordingEnabled, userId: user.id });
  }, [config, user, updateConfig]);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 font-medium uppercase tracking-wider">Session Replay</span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleToggle}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                config?.recordingEnabled ? "bg-red-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  config?.recordingEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          )}
          {config?.recordingEnabled && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            Refresh
          </button>
          <PopOutButton panelId="session-replay" />
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>
      )}

      {!isLoading && !data?.sessions.length && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          {config?.recordingEnabled
            ? "Recording is active. Sessions will appear here once completed."
            : "No recorded sessions. Enable recording to start capturing sessions."}
        </div>
      )}

      {data && data.sessions.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur">
              <tr className="text-gray-500 text-left">
                <th className="px-3 py-1.5 font-medium">User</th>
                <th className="px-3 py-1.5 font-medium">Role</th>
                <th className="px-3 py-1.5 font-medium">Started</th>
                <th className="px-3 py-1.5 font-medium">Duration</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s: ReplaySession) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onSelect={onSelect}
                  onDelete={(id) => deleteSession(id)}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-gray-600 border-t border-gray-800">
            {data.total} session{data.total !== 1 ? "s" : ""} total
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onSelect,
  onDelete,
  isAdmin,
}: {
  session: ReplaySession;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}) {
  return (
    <tr className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors">
      <td className="px-3 py-1.5 text-gray-300">{session.userName ?? session.userId}</td>
      <td className="px-3 py-1.5 text-gray-500">{session.userRole ?? "--"}</td>
      <td className="px-3 py-1.5 text-gray-400 tabular-nums">
        {formatTime(new Date(session.startedAt).getTime())}
      </td>
      <td className="px-3 py-1.5 text-gray-400 tabular-nums">
        {session.endedAt ? (
          formatDuration(session.durationMs)
        ) : (
          <span className="text-amber-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            live
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={() => onSelect(session.id)}
          disabled={!session.endedAt}
          className="text-sky-400 hover:text-sky-300 disabled:text-gray-600 disabled:cursor-not-allowed mr-2"
        >
          Play
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            className="text-red-400/60 hover:text-red-400"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

function SessionPlayer({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<unknown>(null);
  const { data, isLoading } = useGetSessionEventsQuery(sessionId);

  useEffect(() => {
    if (!data?.events?.length || !containerRef.current) return;

    let player: { $destroy?: () => void } | null = null;

    (async () => {
      interface RRWebPlayerClass {
        new (opts: {
          target: HTMLElement;
          props: Record<string, unknown>;
        }): { $destroy?: () => void; destroy?: () => void };
      }
      const mod = (await import("rrweb-player")) as unknown as {
        default?: RRWebPlayerClass;
      } & RRWebPlayerClass;
      const RRWebPlayer: RRWebPlayerClass = mod.default ?? mod;

      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";

      player = new RRWebPlayer({
        target: containerRef.current,
        props: {
          events: data.events,
          showController: true,
          autoPlay: false,
          speed: 1,
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight - 80,
        },
      });
      playerRef.current = player;
    })();

    return () => {
      if (player?.$destroy) player.$destroy();
      playerRef.current = null;
    };
  }, [data]);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <button
          type="button"
          onClick={onBack}
          className="text-sky-400 hover:text-sky-300 transition-colors"
        >
          Back to sessions
        </button>
        <span className="text-gray-500 font-mono">{sessionId.slice(0, 20)}...</span>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Loading session events...
        </div>
      )}

      {!isLoading && !data?.events?.length && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No events found for this session.
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-950" />
    </div>
  );
}

export function SessionReplayPanel() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  if (selectedSession) {
    return <SessionPlayer sessionId={selectedSession} onBack={() => setSelectedSession(null)} />;
  }

  return <SessionList onSelect={setSelectedSession} />;
}
