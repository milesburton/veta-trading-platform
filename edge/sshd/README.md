# OVH edge sshd hardening for veta-tunnel

This snippet enables active liveness probing on the `veta-tunnel` user
so a dead reverse-tunnel client is detected within ~90 seconds instead
of waiting for the kernel TCP timeout (~2 hours).

**Full explanation, install procedure, and recovery timing**:
[veta-tunnel → stale port-binding recovery](https://milesburton.github.io/veta-trading-platform/platform/supporting/veta-tunnel/#stale-port-binding-recovery-ovh-sshd-hardening).

Short install reminder:

```bash
sudo install -m 0644 ./veta-tunnel.conf /etc/ssh/sshd_config.d/veta-tunnel.conf
sudo sshd -t && sudo systemctl reload ssh
```
