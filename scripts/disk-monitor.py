#!/usr/bin/env python3
"""
disk-monitor: HTTP health endpoint for host disk usage.

Returns 200 when disk < WARN_PCT, 503 when >= WARN_PCT.
Auto-prunes dangling Docker images when disk >= PRUNE_PCT.

Deploy: mounted into veta-disk-monitor container via compose.yml
Poll:   Uptime Kuma → http://192.168.1.245:8099/health  (keyword: "ok")
"""
import http.server
import json
import os
import shutil
import subprocess
import time

WARN_PCT = int(os.getenv("WARN_PCT", "85"))
PRUNE_PCT = int(os.getenv("PRUNE_PCT", "90"))


def get_disk() -> dict:
    total, used, free = shutil.disk_usage("/host")
    pct = round(used / total * 100, 1)
    return {
        "total_gb": round(total / 1e9, 1),
        "used_gb": round(used / 1e9, 1),
        "free_gb": round(free / 1e9, 1),
        "used_pct": pct,
    }


def maybe_prune(pct: float) -> None:
    if pct >= PRUNE_PCT:
        try:
            subprocess.run(
                ["docker", "image", "prune", "-f"],
                capture_output=True,
                timeout=60,
            )
        except Exception:
            pass


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        disk = get_disk()
        maybe_prune(disk["used_pct"])
        ok = disk["used_pct"] < WARN_PCT
        body = json.dumps(
            {
                "status": "ok" if ok else "critical",
                "disk": disk,
                "warn_pct": WARN_PCT,
                "prune_pct": PRUNE_PCT,
                "ts": int(time.time()),
            }
        ).encode()
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"[disk-monitor] listening on :8099  warn={WARN_PCT}%  prune={PRUNE_PCT}%")
    http.server.HTTPServer(("", 8099), Handler).serve_forever()
