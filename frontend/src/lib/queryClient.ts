import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient shared across the application.
 * Exported so gatewayMiddleware can call invalidateQueries on WS order events.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on error — grid queries fail fast so the user sees errors quickly
      retry: false,
      // Keep previous data visible while refetching (no flash to empty)
      placeholderData: (prev: unknown) => prev,
    },
  },
});
