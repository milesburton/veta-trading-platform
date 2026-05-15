# k6 Load Tests

[![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)

Load-testing scenarios for the VETA pipeline. Tests run in Docker, send
traffic through the gateway, and export percentile metrics to Prometheus.

**Full documentation**:
[k6 load testing](https://milesburton.github.io/veta-trading-platform/platform/supporting/k6-load-testing/).

## Quick start

```bash
# 1. Trading stack + LGTM observability up
docker compose up -d
docker compose -f observability/docker-compose.lgtm.yml up -d

# 2. Get an admin token
export K6_TOKEN=$(curl -s -X POST http://localhost:5008/oauth/authorize \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"veta-automation","username":"admin","password":"...","redirect_uri":"postmessage","response_type":"code","scope":"openid profile","code_challenge":"...","code_challenge_method":"S256"}' \
  | jq -r .code)
# (Followed by /oauth/token exchange — see Astro page for the full PKCE flow.)

# 3. Run the baseline scenario
docker compose --profile loadtest run --rm k6
```

Output writes to `docs/site/src/data/loadtest/` and is rendered by the
[Performance](https://milesburton.github.io/veta-trading-platform/reference/performance/)
page on next site build.

## Targeting other environments

```bash
BASE_URL=https://veta.mnetcs.com/api/gateway \
  docker compose --profile loadtest run --rm k6
```

Use a token issued by the target environment's user-service.
