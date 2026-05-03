#!/usr/bin/env python3
"""
disk-monitor: HTTP health endpoint for host disk usage.

Returns 200 when disk < WARN_PCT, 503 when >= WARN_PCT.
Read-only by design: the container has no Docker socket access and no
host filesystem write access. Image pruning is a separate concern,
handled by an out-of-band host cron (see scripts/host-prune.sh).

Poll on port 8099, path /health (keyword: "ok").
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
    }


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        disk = get_disk()
        ok = disk["used_pct"] < WARN_PCT
        body = json.dumps(
            {
                "status": "ok" if ok else "critical",
                "disk": disk,
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
