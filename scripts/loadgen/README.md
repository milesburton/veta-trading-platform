# Continuous load generator

Always-on synthetic trade flow on the homelab. Three containers: a soak
runner, a matrix runner, and a token-refresh sidecar.

**Full documentation**:
[Continuous load generator](https://milesburton.github.io/veta-trading-platform/platform/supporting/loadgen/).

The token-refresh sidecar signs in as the `loadgen` machine account. Override
it with `LOADGEN_OAUTH_USERNAME` only for another account the gateway accepts
on `/load-test`.

## Quick start

```bash
# On the server, as the OpenBao admin: see the loadgen page for the commands
# that create the loadgen password in OAUTH2_USER_SECRETS and veta/loadgen.

# Turn on / off / status / logs
/opt/stacks/veta/scripts/load.sh on
/opt/stacks/veta/scripts/load.sh status
/opt/stacks/veta/scripts/load.sh logs
/opt/stacks/veta/scripts/load.sh off
```
