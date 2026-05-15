# VETA edge ingress (OVH dedicated server)

Public Traefik that terminates Let's Encrypt TLS for `veta.mnetcs.com`
and forwards into a reverse SSH tunnel back to the homelab.

**Full documentation**:
[Edge architecture](https://milesburton.github.io/veta-trading-platform/platform/edge-architecture/).

## One-time install

```bash
git clone https://github.com/milesburton/veta-trading-platform.git /opt/veta-edge
cd /opt/veta-edge/edge
echo "ACME_EMAIL=your-email@example.com" | sudo tee .env
sudo docker compose up -d
```

The first request to `https://veta.mnetcs.com/` triggers an HTTP-01
challenge — port 80 must be reachable from the internet (which it is
on this box's public IP). The cert is cached in the `letsencrypt`
Docker volume and renews automatically.

## Day-to-day

```bash
sudo docker compose ps
sudo docker compose logs --tail 50 traefik
sudo docker compose restart traefik    # static config change
sudo docker compose pull && sudo docker compose up -d   # image bump
```

## Verifying the chain end-to-end

```bash
# 1. SSH tunnel up — port 18443 listening on loopback
sudo ss -tlnp | grep :18443

# 2. Edge Traefik reaches the tunnel
curl -ks https://127.0.0.1:18443/api/gateway/ready

# 3. Public hostname serves a real LE cert
curl -v https://veta.mnetcs.com/ 2>&1 | grep -E "issuer|HTTP"
```

If `:18443` is missing on the OVH side, check the homelab:

```bash
ssh miles@192.168.1.245 'systemctl status veta-tunnel.service'
```

See [veta-tunnel](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-tunnel/)
for the homelab side.
