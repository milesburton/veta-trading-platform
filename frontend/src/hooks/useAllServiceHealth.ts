import { skipToken } from "@reduxjs/toolkit/query/react";
import {
  GATEWAY_SERVICE,
  SERVICES,
  TRAEFIK_SERVICE,
  toServiceHealth,
  useGetServiceHealthQuery,
  useGetServicesStatusQuery,
} from "@veta/frontend/store/servicesApi.ts";
import type { ServiceHealth } from "@veta/frontend/types.ts";
import { useMemo } from "react";

const POLL = { pollingInterval: 10_000 };

export function useAllServiceHealth(): ServiceHealth[] {
  const status = useGetServicesStatusQuery(undefined, POLL);
  const traefik = useGetServiceHealthQuery(TRAEFIK_SERVICE ?? skipToken, POLL);

  return useMemo(() => {
    const byName = new Map((status.data?.services ?? []).map((e) => [e.name, e]));
    return SERVICES.map((spec) => {
      if (spec === TRAEFIK_SERVICE) {
        if (traefik.data) return traefik.data;
        return toServiceHealth(spec, undefined, traefik.isError ? "error" : "unknown");
      }
      const unreachable = status.isError && !status.data;
      const fallback = unreachable && spec === GATEWAY_SERVICE ? "error" : "unknown";
      return toServiceHealth(spec, byName.get(spec.name), fallback);
    });
  }, [status.data, status.isError, traefik.data, traefik.isError]);
}
