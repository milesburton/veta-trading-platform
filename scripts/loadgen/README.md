# Continuous load generator

Always-on synthetic trade flow on the homelab. Three containers: a soak
runner, a matrix runner, and a token-refresh sidecar.

**Full documentation**:
[Continuous load generator](https://milesburton.github.io/veta-trading-platform/platform/supporting/loadgen/).

## Quick start

```bash
# On the homelab, set the credential (one-liner extracts admin's pw):
ssh miles@192.168.1.245
ADMIN_PW=$(sudo grep ^OAUTH2_USER_SECRETS /opt/stacks/veta/.env \
  | head -1 | cut -d= -f2- | tr ';' '\n' | grep ^admin: | cut -d: -f2-)
echo "LOADGEN_OAUTH_PASSWORD=$ADMIN_PW" | sudo tee /opt/stacks/veta/.env.loadgen
sudo chmod 600 /opt/stacks/veta/.env.loadgen
sudo chown miles:miles /opt/stacks/veta/.env.loadgen

# Turn on / off / status / logs
/opt/stacks/veta/scripts/load.sh on
/opt/stacks/veta/scripts/load.sh status
/opt/stacks/veta/scripts/load.sh logs
/opt/stacks/veta/scripts/load.sh off
```

Note: `verifyOAuthCredentials` in user-service prefers per-user secrets
(`OAUTH2_USER_SECRETS`) over the shared secret. The command above
extracts the correct per-user password — don't reuse `OAUTH2_SHARED_SECRET`.
