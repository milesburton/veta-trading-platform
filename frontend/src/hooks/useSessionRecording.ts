import { useCallback, useEffect, useRef } from "react";
import { startRecording, stopRecording } from "../lib/sessionRecorder.ts";
import { useAppSelector } from "../store/hooks.ts";
import {
  useCreateSessionMutation,
  useEndSessionMutation,
  useGetReplayConfigQuery,
  useUploadChunkMutation,
} from "../store/replayApi.ts";

export function useSessionRecording() {
  const user = useAppSelector((s) => s.auth.user);
  const { data: config } = useGetReplayConfigQuery(undefined, { pollingInterval: 60_000 });
  const [createSession] = useCreateSessionMutation();
  const [endSession] = useEndSessionMutation();
  const [uploadChunk] = useUploadChunkMutation();
  const sessionIdRef = useRef<string | null>(null);
  const recordingRef = useRef(false);

  const stop = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    await stopRecording();
    if (sessionIdRef.current) {
      await endSession(sessionIdRef.current).catch(() => {});
      sessionIdRef.current = null;
    }
  }, [endSession]);

  useEffect(() => {
    if (!config?.recordingEnabled || !user || recordingRef.current) return;

    const sessionId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionIdRef.current = sessionId;
    recordingRef.current = true;

    createSession({
      id: sessionId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      metadata: {
        userAgent: navigator.userAgent,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        url: window.location.href,
      },
    }).catch(() => {});

    startRecording(
      async (seq, events) => {
        await uploadChunk({ sessionId, seq, events }).unwrap();
      },
      () => {
        endSession(sessionId).catch(() => {});
        sessionIdRef.current = null;
        recordingRef.current = false;
      }
    );

    return () => {
      stop();
    };
  }, [config?.recordingEnabled, user, createSession, uploadChunk, endSession, stop]);

  return { isRecording: recordingRef.current, stop };
}
