#!/usr/bin/env python3
import importlib.util
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

STACK_DIR = Path(os.environ.get("STACK_DIR", "/opt/stacks/veta"))
spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).resolve().parent / "openbao-bootstrap.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

DATA_VOLUME = os.environ.get("OPENBAO_DATA_VOLUME", "veta-openbao_openbao-data")
COMPOSE = str(bs.OPENBAO_DIR / "compose.yml")
SKIP_DOCKER = os.environ.get("REBUILD_SKIP_DOCKER") == "1"
PATHS = tuple(p for p in os.environ.get("REBUILD_PATHS", "platform,loadgen,authentik,authentik-bootstrap").split(",") if p)
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
BACKUP = Path.home() / f"openbao-data-before-rebuild-{STAMP}.tgz"
APPROLE_BACKUP = bs.APPROLE_FILE.with_name(f"{bs.APPROLE_FILE.name}.before-rebuild-{STAMP}")


def say(message):
    print(f"[rebuild] {message}", flush=True)


def dump_existing():
    _, login = bs.api("POST", "auth/approle/login", body=json.loads(bs.APPROLE_FILE.read_text()))
    token = login["auth"]["client_token"]
    dumped = {}
    for path in PATHS:
        status, body = bs.api("GET", f"secret/data/veta/{path}", token=token, allow=(403, 404))
        if status == 200 and body["data"]["data"]:
            dumped[path] = body["data"]["data"]
            say(f"read veta/{path}: {len(dumped[path])} keys")
        else:
            say(f"veta/{path}: not readable or empty (HTTP {status}), skipped")
    bs.api("POST", "auth/token/revoke-self", token=token)
    if not dumped.get("platform"):
        bs.fail("could not read veta/platform with the deploy credential; nothing changed")
    return dumped


def reset_storage():
    bs.run(["docker", "compose", "-f", COMPOSE, "stop"])
    descriptor = os.open(BACKUP, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        subprocess.run(
            ["docker", "run", "--rm", "-u", "0", "-v", f"{DATA_VOLUME}:/d:ro", "--entrypoint", "tar",
             bs.OPENBAO_IMAGE, "czf", "-", "-C", "/d", "."],
            check=True, stdout=handle,
        )
    listing = subprocess.run(["tar", "tzf", str(BACKUP)], check=True, capture_output=True).stdout.decode().splitlines()
    if BACKUP.stat().st_size < 1024 or not any("raft" in name or "vault.db" in name for name in listing):
        bs.run(["docker", "compose", "-f", COMPOSE, "start"])
        bs.fail(f"backup {BACKUP} looks empty ({len(listing)} entries); old vault restarted, nothing changed")
    say(f"old vault data archived to {BACKUP} ({BACKUP.stat().st_size} bytes, {len(listing)} entries)")
    bs.APPROLE_FILE.rename(APPROLE_BACKUP)
    say(f"old deploy credential kept at {APPROLE_BACKUP}")
    bs.run(["docker", "compose", "-f", COMPOSE, "down"])
    bs.run(["docker", "volume", "rm", DATA_VOLUME])
    bs.run(["docker", "compose", "-f", COMPOSE, "up", "-d"])
    wait_for_uninitialised()


def wait_for_uninitialised():
    for _ in range(60):
        if bs.health() is not None:
            return
        time.sleep(1)
    bs.fail("the new vault did not answer within 60s")


def main():
    admin_password = sys.stdin.read().strip()
    if len(admin_password) < 16:
        bs.fail("admin password on stdin must be at least 16 characters; nothing changed")
    dumped = dump_existing()

    if SKIP_DOCKER:
        say("test mode: waiting for the harness to reset storage")
        Path("/tmp/rebuild-ready-for-reset").write_text("go")
        while not Path("/tmp/rebuild-reset-done").exists():
            time.sleep(0.5)
        bs.APPROLE_FILE.rename(APPROLE_BACKUP)
        wait_for_uninitialised()
    else:
        reset_storage()

    if bs.health() != 501:
        bs.fail("the vault is not in an uninitialised state after the reset; stopping")
    root, generated = bs.initialise()
    assert generated
    bs.wait_ready(root)
    bs.configure(root)
    bs.api(
        "POST", "auth/userpass/users/admin", token=root,
        body={"password": admin_password, "token_policies": ["veta-admin"], "token_ttl": "1h"},
    )
    say("created the admin user with the supplied password")
    bs.ensure_approle_credentials(root)

    for path, values in dumped.items():
        bs.api("POST", f"secret/data/veta/{path}", token=root, body={"options": {"cas": 0}, "data": values})
        say(f"restored veta/{path}: {len(values)} keys")

    _, login = bs.api("POST", "auth/userpass/login/admin", body={"password": admin_password})
    say(f"admin login works; policies {login['auth']['policies']}")
    bs.api("POST", "auth/token/revoke-self", token=login["auth"]["client_token"])

    deploy_paths = [path for path in dumped if path in ("platform", "loadgen")]
    seen = bs.loader_view(deploy_paths)
    expected = {name: value for path in deploy_paths for name, value in dumped[path].items()}
    mismatched = sorted(name for name, value in expected.items() if seen.get(name) != value)
    if mismatched:
        bs.fail(f"round trip mismatch for: {', '.join(mismatched)}; root token NOT revoked, see the init file")
    say(f"round trip verified: the deploy loader reads all {len(expected)} restored values unchanged")

    bs.api("POST", "auth/token/revoke-self", token=root)
    status, _ = bs.api("GET", "auth/token/lookup-self", token=root, allow=(403,))
    say(f"root token revoked (lookup now returns {status})")
    say("DONE. Move the new recovery key from ~/openbao-init-*.json into the password manager, then shred it.")
    say(f"Once the deploy is healthy, shred {BACKUP} and {APPROLE_BACKUP}.")


main()
