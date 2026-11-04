# Runbook: WebSocket abuse and rate-limit alerts

Covers the Grafana alerts "WebSocket rate-limit hit repeatedly", "WebSocket force-closed for
abuse" and "User blocked from new WebSocket connections".

## Identify the source

1. Read the alert detail for the user or source address.
2. Search the gateway logs for that identifier and the rate-limit or backoff events.
3. A single browser tab in a reconnect loop is the most common benign cause. A script
   sending many frames is abuse.

## Act

For a misbehaving client, the gateway backoff already blocks new connections. If the source
is hostile, engage the kill switch for that user and disable the account. Record the
identifier and the time in an incident entry.
