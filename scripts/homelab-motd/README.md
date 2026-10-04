# Homelab MOTD

`99-veta` prints the VETA service summary on SSH login. Counts come from the gateway's `GET /services/status`, the same source the web GUI uses, so the shell and the GUI agree on what is up. Standby services count as up. Services in `error` or `degraded` are listed by name.

The script runs `curl` inside the gateway container, because the gateway port is not published on the host. It needs `docker` and `jq`. If the endpoint is unreachable, it prints the number of running `veta-` containers.

## Install

```bash
sudo apt-get install -y jq
sudo install -m 0755 /path/to/repo/scripts/homelab-motd/99-veta /etc/update-motd.d/99-veta
```

| Variable | Default | Purpose |
|---|---|---|
| `VETA_GATEWAY_CONTAINER` | `veta-gateway-1` | Container to query |
| `VETA_PLATFORM_URL` | `http://veta.home` | URL shown in the banner |
