---
title: Testcontainers
description: Per-test ephemeral stacks for backend integration tests, including helpers, patterns, and the run-testcontainers wrapper.
sidebar:
  order: 7
---

The integration test suite runs on per-test ephemeral stacks via [Testcontainers](https://testcontainers.com/). Every `.tc.test.ts` file boots its own Postgres, Redpanda, and the subset of services it exercises, then tears them all down at the end.

This is the only integration path CI runs. The older `*.integration.test.ts` files (shared compose stack on `localhost:50xx`) still exist in the repo for local debugging, but no CI step references them.

## Why per-test isolation

The shared-stack approach worked, but coupled tests to each other through Postgres rows, Redpanda offsets, OMS in-memory state, and risk-engine rate limits. We worked around it with `Date.now()`-suffixed scenario names and per-test cascade deletes, but the underlying coupling remained.

Real trading shops use per-test isolation, and the platform's remit is to demonstrate how a real system should be built. The migration also surfaced five real bugs the legacy compose-stack tests had been masking (see [What the migration found](#what-the-migration-found) below).

## Per-test container lifecycle

```mermaid
graph TD
    A["Deno.test starts"] --> B["startStack({ services: [...] })"]
    B --> C["startEphemeralPostgres()<br/>random host port, fresh database"]
    B --> D["startEphemeralRedpanda()<br/>random host port, empty topics"]
    C --> E["applyMigrations(databaseUrl)<br/>schema + seed data"]
    D --> F["Redpanda ready,<br/>topics auto-created on first publish"]
    E --> G["spawn requested services<br/>(journal, oms, market-sim, ...)"]
    F --> G
    G --> H["wait for /health on each<br/>(startupTimeoutMs)"]
    H --> I["return { urls, teardown }"]
    I --> J["test body runs<br/>(steps via t.step)"]
    J --> K["finally: stack.teardown()"]
    K --> L["stop services, drop containers<br/>(Postgres + Redpanda removed)"]

    classDef infra fill:#dcfce7,stroke:#16a34a,color:#000
    classDef test fill:#fef3c7,stroke:#d97706,color:#000
    classDef teardown fill:#fecaca,stroke:#dc2626,color:#000

    class B,C,D,E,F,G,H,I infra
    class A,J test
    class K,L teardown
```

Each test owns its containers end to end. Ryuk (the testcontainers reaper) is disabled, so the test must call `teardown()` itself; the standard pattern wraps the test body in `try { ... } finally { await stack.teardown(); }`. Per-test cost: 5 to 15 seconds of container boot, depending on how many services the test exercises.

## Running

```bash
deno task test:testcontainers
```

The task wraps each `.tc.test.ts` file in `scripts/run-testcontainers.sh`, which sets up the Docker plumbing the helpers need (see [Dev-container quirks](#dev-container-quirks)).

End-to-end runtime is around 80 seconds across the full suite. Each individual file boots its slice of the stack in 5 to 15 seconds depending on how many services it needs.

## Suites

All seven suites run as part of `deno task test:testcontainers`:

| File | Boots | What it covers |
| --- | --- | --- |
| `testcontainers.smoke.test.ts` | postgres + redpanda | Helpers themselves: connection works, migrations apply, broker accepts |
| `testcontainers.stack.test.ts` | postgres + redpanda + 2 services | Helper API: `startStack()` brings up multiple services and tears them down |
| `journal.http.tc.test.ts` | journal | Journal HTTP contracts (8 steps) |
| `market-data.http.tc.test.ts` | market-data | Market-data HTTP contracts (9 steps) |
| `intelligence.integration.tc.test.ts` | feature/signal/scenario engines + gateway | Intelligence pipeline + gateway proxy (10 steps) |
| `integration.tc.test.ts` | full service surface | Service contracts + order flow + shared-workspaces lifecycle (20 steps) |
| `scenarios.integration.tc.test.ts` | scenarios stack | Same-seed determinism (plus or minus 5bps tolerance) and different-seed divergence |
| `algo.integration.tc.test.ts` | gateway + journal + 9 algo services | All 9 algo strategies via WebSocket (10 steps; 4 timing-sensitive steps gated behind `RUN_FLAKY_ALGOS=1`) |

### Known exclusion: Discord delivery

Discord webhook delivery (bug-report notifications, the discord-bot's ticket triage, alert routing) is exercised only by backend unit tests (`discord-notifier.unit.test.ts`, `discord-bot.unit.test.ts`), never by the Testcontainers suite. There's no safe way to provision a real webhook or bot token for CI: a shared test credential posting into the real channel on every run risks abuse and noise, and Discord has no local/sandboxed emulator to boot as a container. Verification of the live path is manual, see [Discord welcome bot: Verifying](../../../platform/observability/discord-welcome-bot/#verifying) and [User tickets](../../../platform/observability/bug-reports/).

A future improvement would be a `DISCORD_TEST_MODE` style flag to temporarily point the bot at a disposable test webhook/channel for manual verification, without wiring it into automated CI.

## Helper API

Helpers live in `backend/src/tests/testcontainers/`.

### `startEphemeralPostgres()`

Boots a `postgres:16-alpine` container, picks a free port, and returns a `ManagedPostgres`:

```typescript
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const pg = await startEphemeralPostgres();
// pg.url is postgres://veta:veta@host:port/veta_test
// pg.host, pg.port, pg.user, pg.password, pg.database
await pg.teardown();
```

`startEphemeralPostgres({ database, user, password, startupTimeoutMs })` defaults to `veta_test` / `veta` / `veta` / 60s.

### `startEphemeralRedpanda()`

Boots a `redpandadata/redpanda:v24.3.4` container in `dev-container` mode with a single broker on a picked free port. Honours `TESTCONTAINERS_HOST_OVERRIDE` so the advertised broker address matches what the host can reach.

```typescript
import { startEphemeralRedpanda } from "./testcontainers/redpanda.ts";

const rp = await startEphemeralRedpanda();
// rp.brokers is the host:port string for KAFKA_BROKERS
await rp.teardown();
```

### `applyMigrations(databaseUrl)`

Runs the production migration runner against an ephemeral Postgres URL. Use this after `startEphemeralPostgres()` to get the same schema CI and prod use.

### `startStack({ services, ... })`

The high-level entry point most tests use. Boots Postgres, applies migrations, boots Redpanda, then spawns each named service as a Deno subprocess with the right environment (DATABASE\_URL, REDPANDA\_BROKERS, OAUTH2\_SHARED\_SECRET, etc). Waits for `/health` and any `readyLog` regex (algos wait for `connected to market-sim`).

```typescript
import { startStack } from "./testcontainers/services.ts";

const stack = await startStack({
  services: ["journal", "market-sim", "oms", "ems", "risk-engine", "gateway"],
  startupTimeoutMs: 30_000,
});

// stack.urls.journal is http://localhost:5009
// stack.urls.gateway is http://localhost:5011
// stack.dumpLogs() returns concatenated logs across all services (for assert failures)
// stack.inspectLogs("oms") returns single-service logs

await stack.teardown();
```

Available service names are listed in `backend/src/tests/testcontainers/services.ts`.

### `login(stack, username)` and `submitOrderViaWs(stack, token, order)`

Auth and order helpers in `auth.ts`. `login()` performs the OAuth2 PKCE flow against the booted `user-service` and returns a session cookie. `submitOrderViaWs()` opens a WebSocket to the gateway, authenticates, sends a `submitOrder`, and resolves with the `orderAck`, `orderRejected`, or `error` event.

## Test pattern

Every TC test file follows the same shape:

```typescript
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { startStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

Deno.test({
  name: "journal HTTP contracts (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: ["journal"], startupTimeoutMs: 30_000 });
    try {
      await t.step("GET /health returns ok", async () => {
        const res = await fetch(`${stack.urls.journal}/health`);
        assertEquals(res.status, 200);
      });
      // … more steps
    } finally {
      await stack.teardown();
    }
  },
});
```

Three things to notice:

1. **`RUN_TESTCONTAINERS=1` gate.** The wrapper sets it; running `deno test` directly skips every TC file. This keeps the regular `deno task test` fast and side-effect-free.
2. **`Deno.test({ ignore })`** rather than `if (!SHOULD_RUN) return`, so the runner reports the test as ignored rather than silently passed.
3. **`try { … } finally { teardown() }`**: every test owns its lifecycle. Ryuk is disabled, so containers will not get reaped if the test forgets to clean up.

## Adding a new test

1. Create `backend/src/tests/<name>.tc.test.ts` following the pattern above.
2. List the minimum services your test needs in `startStack({ services: [...] })`. Adding a service costs around 2 to 5 seconds of boot time.
3. Append the file to the `test:testcontainers` task in `deno.json`:

   ```jsonc
   "test:testcontainers": "./scripts/run-testcontainers.sh deno test --allow-all backend/src/tests/<name>.tc.test.ts && …"
   ```

4. Run `deno task test:testcontainers` locally before pushing. CI runs the same task, so anything that passes locally inside the dev container will very likely pass on the GitHub-hosted CI jobs. The `integration` job's self-hosted homelab runner is the one exception: that box also runs the full production VETA stack around the clock, so it isn't idle the way a hosted runner or your dev container is. If a test times out only there, check the runner's load before assuming a code regression; see `TC_TIMEOUT_SCALE` below.

## The wrapper script

`scripts/run-testcontainers.sh` handles three Docker plumbing problems that affect dev containers, GitHub Codespaces, and GitHub Actions runners alike:

1. **Unix-socket to TCP shim.** Deno's `node:http` polyfill cannot write to Docker's unix socket (a `Symbol(Deno.internal.rid)` polyfill gap), so the wrapper runs an `alpine/socat` sidecar that proxies `tcp://<bridge>:2375` to `/var/run/docker.sock`. `DOCKER_HOST` is pointed at the sidecar's bridge IP.
2. **`TESTCONTAINERS_HOST_OVERRIDE`.** `container.getHost()` returns `localhost`, but the published port lives on the Docker host's loopback rather than the test process's. The override is set to the bridge gateway IP, which is reachable from both dev containers and CI runners.
3. **Clean `DOCKER_CONFIG`.** When `~/.docker/config.json` declares a `credsStore` helper that exits 1 for unauthenticated public-registry pulls (Codespaces installs one), Testcontainers treats the failure as fatal. The wrapper points `DOCKER_CONFIG` at an empty config dir to bypass it.

It also sets `TESTCONTAINERS_RYUK_DISABLED=true`. The helpers stop containers in `finally` blocks already, and Ryuk's published port is its own loopback puzzle inside dev containers.

The wrapper finishes by setting `RUN_TESTCONTAINERS=1` and `exec`-ing the rest of the command line.

**Self-hosted runner gotcha**: point 2 assumes the process running the tests shares a network namespace with (or has a route to) the Docker host's default bridge network, where the `socat` sidecar lands. That's true for a GitHub-hosted runner and a normal dev container, but not automatically true for a container-based self-hosted runner: if that runner container has its own separate bridge network (the default for a `docker compose` service that doesn't set `network_mode`), it has no route to the Docker host's default bridge subnet and every Testcontainers call fails with `"Could not find a working container runtime strategy"`. The homelab `integration` runner works around this with `network_mode: host` on the runner container itself, putting it in the host's network namespace directly.

### `TC_TIMEOUT_SCALE`

`backend/src/tests/smoke.full.tc.test.ts` reads a `TC_TIMEOUT_SCALE` env var (default `1`) and multiplies every `startupTimeoutMs` and the file's overall test timeout by it. This exists because the `integration` job's self-hosted homelab runner also runs the full production VETA stack around the clock, unlike a GitHub-hosted runner which is otherwise idle: cold-starting the 15 to 30 Deno subprocesses one of this file's test groups boots can genuinely take longer under that background load without any code defect. CI sets `TC_TIMEOUT_SCALE=3` for that job only; everywhere else (local dev, other CI jobs) it defaults to `1` and behaves exactly as before.

### Dev-container quirks

The wrapper is required when running locally inside the project's dev container or in Codespaces. On a bare workstation with `/var/run/docker.sock` writable directly by Deno, you can technically run the test files without it, but using the wrapper everywhere keeps environments consistent and matches what CI does.

## What the migration found

The Testcontainers harness caught five real bugs on its first pilot run that the legacy compose-stack tests had been masking:

- **journal `expiresAt` unit mismatch**: the wire format is "seconds-to-live" but the journal stored the raw value as if it were absolute milliseconds. The OMS orphan-expirer killed every order immediately because `60 < Date.now()`.
- **scenarios orchestrator parsed the wrong response shape**: journal `/orders` returns a bare array, but the orchestrator did `body.orders ?? []`, always seeing zero orders.
- **scenarios orchestrator matched on the wrong field**: it looked for `o.clientOrderId`, but the journal returns it as `id`.
- **journal never populated child fill state**: `orders.filled` events only updated the parent's filled total, leaving child `status="pending"` and `avgFillPrice=0` forever.
- **market-sim `/seed` reset only the RNG**: `marketMinute`, `tickCount`, regime state, and price levels persisted between runs, so "same seed" runs were not repeatable from a clean state.

The legacy `scenarios.integration.test.ts` was wired into `deno.json`'s `test:integration` task but never invoked by any CI step. It claimed bit-identical replay across three runs but in fact never ran.

### A note on replay tolerance

Bit-identical fill prices across same-seed runs would require pausing the live tick clock during a scenario; the architecture today generates ticks continuously while orders flow through Kafka. The harness asserts plus or minus 5bps tolerance, which captures the messaging-bus jitter while still proving determinism.
