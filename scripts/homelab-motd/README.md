# Homelab MOTD

`99-veta` prints the VETA service summary on SSH login. Counts come from the gateway's `GET /services/status`, the same source the web GUI uses, so the shell and the GUI agree on what is up. Standby services count as up. Figures come from the `counts` object. Services in `error` or `degraded` are listed by name when the payload includes the per-service list.

The script runs `curl` inside the gateway container, because the gateway port is not published on the host. It needs `docker` and `jq`. If the endpoint is unreachable, it prints the number of running `veta-` containers.

## Install

`scripts/homelab-deploy.sh` syncs this directory into the stack and installs `99-veta` to `/etc/update-motd.d/` whenever the copy there differs, so every deploy keeps the MOTD current. The install uses `sudo -n` and is skipped with a warning when the deploying user lacks passwordless sudo. The host needs `jq`:

```bash
sudo apt-get install -y jq
```

| Variable | Default | Purpose |
|---|---|---|
| `VETA_GATEWAY_CONTAINER` | `veta-gateway-1` | Container to query |
| `VETA_PLATFORM_URL` | `http://veta.home` | URL shown in the banner |
