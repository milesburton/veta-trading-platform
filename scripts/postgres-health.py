#!/usr/bin/env python3
"""
postgres-health: HTTP health endpoint sidecar for Postgres.

Postgres has no HTTP surface of its own; this wraps `pg_isready` so the
service registry / frontend GUI can poll it the same way as every other
VETA service, instead of Postgres being invisible to the platform status
view entirely.

Endpoint on :8100
  /health   JSON. 200 when pg_isready succeeds, 503 otherwise.
"""
import http.server
import json
import os
import subprocess
import time

PG_HOST = os.getenv("PG_HOST", "postgres")
PG_PORT = os.getenv("PG_PORT", "5432")
PG_USER = os.getenv("PG_USER", "veta")


def check_postgres() -> bool:
    try:
        result = subprocess.run(
            ["pg_isready", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER],
            capture_output=True,
            timeout=3,
        )
        return result.returncode == 0
    except Exception:
        return False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        ok = check_postgres()
        body = json.dumps(
            {
                "service": "postgres",
                "status": "ok" if ok else "critical",
                "ts": int(time.time()),
            }
        ).encode()
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"[postgres-health] listening on :8100  target={PG_HOST}:{PG_PORT}")
    http.server.HTTPServer(("", 8100), Handler).serve_forever()
