# Runbook: service and browser memory alerts

Covers `ServiceMemoryGrowthSustained`, `ServiceMemoryHigh`, `ServiceMemoryCritical`,
`FrontendHeapHigh` and `FrontendHeapCritical`.

## Services

1. The alert names the `job`. Check its heap trend in Grafana over the last day to tell a
   leak (steady climb) from a spike (workload).
2. `ServiceMemoryCritical` (3 GiB) is close to an out-of-memory kill. Restart the service
   container to recover, then investigate.
3. Capture a heap snapshot before restarting if the leak is not yet understood.
4. Check whether a load generator or synthetic trader was left running, as extra order flow
   is a common cause.

## Browser

`FrontendHeapHigh` and `FrontendHeapCritical` come from client telemetry. Find which panel
the affected session had open, and ask the user to reload. A critical value usually means a
frozen tab. Report the panel and session length when raising the bug.
