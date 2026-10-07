# Continuous load generator

Always-on synthetic trade flow on the homelab. Three containers: a soak
runner, a matrix runner, and a token-refresh sidecar.

**Full documentation**:
[Continuous load generator](https://milesburton.github.io/veta-trading-platform/platform/supporting/loadgen/).

## Quick start

```bash
# On the server, store the credential in OpenBao (extracts admin's pw):
ssh <user>@<server-host>
docker exec -it veta-openbao sh
bao login -method=userpass username=admin
admin_pw=$(bao kv get -field=OAUTH2_USER_SECRETS secret/veta/platform \
  | tr ';' '\n' | grep ^admin: | cut -d: -f2-)
printf %s "$admin_pw" | bao kv put secret/veta/loadgen LOADGEN_OAUTH_PASSWORD=-
exit

# Turn on / off / status / logs
/opt/stacks/veta/scripts/load.sh on
/opt/stacks/veta/scripts/load.sh status
/opt/stacks/veta/scripts/load.sh logs
/opt/stacks/veta/scripts/load.sh off
```

Note: `verifyOAuthCredentials` in user-service prefers per-user secrets
(`OAUTH2_USER_SECRETS`) over the shared secret. The command above
extracts the correct per-user password — don't reuse `OAUTH2_SHARED_SECRET`.
