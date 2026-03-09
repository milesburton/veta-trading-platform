#!/bin/sh
# Launch Redpanda using its own bundled dynamic linker to avoid glibc conflicts.
# denoland/deno:2.x ships Debian 13 (glibc 2.41) but redpanda:v24.3.6 bundles
# an older libc. The bundled ld.so resolves its own symbols, bypassing the host.

set -e
mkdir -p /var/lib/redpanda/data /etc/redpanda

# Write the minimal config Redpanda needs to listen on the Kafka port.
cat > /etc/redpanda/redpanda.yaml << 'EOF'
redpanda:
  data_directory: /var/lib/redpanda/data
  seed_servers: []
  kafka_api:
    - address: 0.0.0.0
      port: 9092
  advertised_kafka_api:
    - address: localhost
      port: 9092
  developer_mode: true
EOF

exec /usr/local/lib/redpanda/ld.so \
  --library-path /usr/local/lib/redpanda \
  /usr/local/bin/redpanda \
  --redpanda-cfg /etc/redpanda/redpanda.yaml \
  --overprovisioned \
  --unsafe-bypass-fsync=true \
  --reserve-memory=0M \
  --lock-memory=false \
  --default-log-level=warn \
  --smp=1 \
  --memory=200M
