# Runbook: disaster recovery

Covers losing the production host or its storage. It lists what holds state,
where each part is recovered from, and the order to bring things back.

The recovery objectives below are proposed targets for a single-operator
platform. They have not been measured against a full rebuild.

| Objective | Target |
| --- | --- |
| Recovery point (data loss) | 24 hours for Postgres |
| Recovery time (service back) | 4 hours from a decision to rebuild |

## What holds state

| Component | State | Recovered from |
| --- | --- | --- |
| Postgres | Orders journal, users, risk configuration, replay data | Daily verified dump. See the [restore runbook](./postgres-restore.md). |
| OpenBao | Every platform credential | Data volume archive plus the separately held unseal key. See the [OpenBao page](https://milesburton.github.io/veta-trading-platform/platform/supporting/openbao/). |
| Redpanda | In-flight events and retained topic history | Not restored. Topics are recreated empty by the init job. Order history of record is in Postgres. |
| Container images | Service code | Published images in the container registry, rebuilt from source if needed. |
| Configuration | Compose files, scripts, observability config | The git repository. |
| Object storage | Ticket attachments | Not backed up. Loss only affects attachments on filed tickets. |
| Grafana, Prometheus, Loki, Tempo | Dashboards and history | Dashboards are provisioned from the repository. Metric and log history is not restored. |

## Order of recovery

1. Provision a host and install the container runtime.
2. Restore OpenBao first: the unseal key volume, then the data archive.
   Without it nothing can read its credentials.
3. Check out the repository at the commit that was deployed, and run the
   stack bootstrap so the deploy tooling can read from OpenBao.
4. Start Postgres alone and restore the newest dump with the
   [restore runbook](./postgres-restore.md).
5. Start Redpanda and let the init job create the topics.
6. Start the remaining services, then run the smoke check.
7. Re-establish the public path: the edge proxy and the tunnel to the new
   host.
8. Confirm alerts reach the operator channel and the backup job has taken a
   new dump.

## Known gaps

- The restore order has been rehearsed only for Postgres. A full rebuild on
  a new host has not been performed.
- The backup volume lives on the same host unless the backup path was
  pointed elsewhere. A host loss with a local backup path loses the backups
  too. Confirm where the path is mounted.
- Object storage has no backup.

## Afterwards

Write an incident entry and a postmortem. See the [incident log](../README.md).
