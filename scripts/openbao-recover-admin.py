#!/usr/bin/env python3
import base64
import importlib.util
import json
import os
import secrets
import string
import sys
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).resolve().parent / "openbao-bootstrap.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

COMPOSE = str(bs.OPENBAO_DIR / "compose.yml")
COMPOSE_RECOVERY = str(bs.OPENBAO_DIR / "compose.recovery.yml")
SKIP_DOCKER = os.environ.get("RECOVER_SKIP_DOCKER") == "1"
ROOT_TOKEN_LENGTH = 26


def say(message):
    print(f"[recover-admin] {message}", flush=True)


def wait_until_serving():
    for _ in range(60):
        if bs.health() == 200:
            return
        time.sleep(1)
    bs.fail("the vault did not come back unsealed within 60s; check `docker logs veta-openbao`")


def compose_up(*files):
    if SKIP_DOCKER:
        return
    arguments = [argument for file in files for argument in ("-f", file)]
    bs.run(["docker", "compose", *arguments, "up", "-d", "--force-recreate"])
    wait_until_serving()


def decode_token(encoded, one_time_pad):
    raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4))
    return "".join(chr(a ^ b) for a, b in zip(raw, one_time_pad.encode()))


def generate_root(recovery_key):
    alphabet = string.ascii_letters + string.digits
    one_time_pad = "".join(secrets.choice(alphabet) for _ in range(ROOT_TOKEN_LENGTH))
    _, attempt = bs.api("PUT", "sys/generate-root/attempt", body={"otp": one_time_pad})
    try:
        _, result = bs.api(
            "PUT", "sys/generate-root/update", body={"key": recovery_key, "nonce": attempt["nonce"]}
        )
    except SystemExit:
        bs.api("DELETE", "sys/generate-root/attempt", allow=(400, 404))
        raise
    if not result.get("complete"):
        bs.api("DELETE", "sys/generate-root/attempt", allow=(400, 404))
        bs.fail("the recovery key was accepted but did not complete the operation; attempt cancelled")
    return decode_token(result["encoded_token"], one_time_pad)


def main():
    lines = sys.stdin.read().splitlines()
    if len(lines) < 2 or not lines[0].strip() or len(lines[1].strip()) < 16:
        bs.fail("stdin must hold the recovery key on line 1 and a new admin password of 16+ characters on line 2")
    recovery_key, admin_password = lines[0].strip(), lines[1].strip()

    if bs.health() != 200:
        bs.fail("the vault must be initialised and unsealed; check `docker exec veta-openbao bao status`")

    root = None
    try:
        say("restarting the vault with the unauthenticated generate-root endpoints enabled")
        compose_up(COMPOSE, COMPOSE_RECOVERY)
        root = generate_root(recovery_key)
        say("recovery key accepted, root token issued")
        bs.api(
            "POST", "auth/userpass/users/admin", token=root,
            body={"password": admin_password, "token_policies": ["veta-admin"], "token_ttl": "1h"},
        )
        _, login = bs.api("POST", "auth/userpass/login/admin", body={"password": admin_password})
        say(f"admin password set and login verified; policies {login['auth']['policies']}")
        bs.api("POST", "auth/token/revoke-self", token=login["auth"]["client_token"])
    finally:
        if root:
            bs.api("POST", "auth/token/revoke-self", token=root, allow=(403,))
            say("root token revoked")
        say("restoring the normal configuration")
        compose_up(COMPOSE)

    status, _ = bs.api("PUT", "sys/generate-root/attempt", body={"otp": "x" * ROOT_TOKEN_LENGTH}, allow=(405, 403))
    if status not in (405, 403):
        bs.fail("the unauthenticated generate-root endpoint is still open after restoring the configuration")
    say("DONE. The unauthenticated endpoint is closed again. Store the admin password in the password manager.")


main()
