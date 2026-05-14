#!/usr/bin/env python3
"""
disk-monitor: HTTP health + metrics endpoint for host disk usage.

Endpoints on :8099
  /health   JSON. 200 when disk < WARN_PCT, 503 when >= WARN_PCT. Used by
            the docker healthcheck and by humans.
  /metrics  Prometheus text format. Scraped by lgtm-prometheus so we get
            history and an alert rule can fire before disk fills.

Read-only by design: the container has no Docker socket access and no
host filesystem write access.
"""
import http.server
import json
import os
import shutil
import time

WARN_PCT = int(os.getenv("WARN_PCT", "85"))


def get_disk() -> dict:
    total, used, free = shutil.disk_usage("/host")
    pct = round(used / total * 100, 1)
    return {
        "total_gb": round(total / 1e9, 1),
        "used_gb": round(used / 1e9, 1),
        "free_gb": round(free / 1e9, 1),
        "used_pct": pct,
        "total_bytes": total,
        "used_bytes": used,
        "free_bytes": free,
    }


def render_metrics(disk: dict) -> bytes:
    lines = [
        "# HELP disk_used_percent Host root filesystem used percentage.",
        "# TYPE disk_used_percent gauge",
        f"disk_used_percent {disk['used_pct']}",
        "# HELP disk_used_bytes Host root filesystem used bytes.",
        "# TYPE disk_used_bytes gauge",
        f"disk_used_bytes {disk['used_bytes']}",
        "# HELP disk_free_bytes Host root filesystem free bytes.",
        "# TYPE disk_free_bytes gauge",
        f"disk_free_bytes {disk['free_bytes']}",
        "# HELP disk_total_bytes Host root filesystem total bytes.",
        "# TYPE disk_total_bytes gauge",
        f"disk_total_bytes {disk['total_bytes']}",
        "",
    ]
    return "\n".join(lines).encode()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        disk = get_disk()
        if self.path == "/metrics":
            body = render_metrics(disk)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        ok = disk["used_pct"] < WARN_PCT
        body = json.dumps(
            {
                "status": "ok" if ok else "critical",
                "disk": {k: v for k, v in disk.items() if not k.endswith("_bytes")},
                "warn_pct": WARN_PCT,
                "ts": int(time.time()),
            }
        ).encode()
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"[disk-monitor] listening on :8099  warn={WARN_PCT}%")
    http.server.HTTPServer(("", 8099), Handler).serve_forever()
