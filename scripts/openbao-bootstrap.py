#!/usr/bin/env python3
import getpass
import http.client
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

STACK_DIR = Path(os.environ.get("STACK_DIR", "/opt/stacks/veta"))
OPENBAO_DIR = Path(os.environ.get("OPENBAO_DIR", STACK_DIR / "deploy" / "openbao"))
UNSEAL_VOLUME = os.environ.get("OPENBAO_UNSEAL_VOLUME", "veta-openbao-unseal")
OPENBAO_IMAGE = os.environ.get("OPENBAO_IMAGE", "openbao/openbao:2.7.1")
ADDR = os.environ.get("OPENBAO_ADDR", "http://127.0.0.1:8200")
APPROLE_FILE = Path(
    os.environ.get(
        "OPENBAO_APPROLE_FILE", Path.home() / ".config" / "veta" / "openbao-approle.json"
    )
)
ENV_FILE = Path(os.environ.get("ENV_FILE", STACK_DIR / ".env"))
LOADGEN_ENV_FILE = Path(os.environ.get("LOADGEN_ENV_FILE", STACK_DIR / ".env.loadgen"))
TICKETING_TOKEN_FILE = Path(os.environ.get("TICKETING_TOKEN_FILE", STACK_DIR / "secrets" / "github_ticketing_token"))
LOADER = Path(__file__).resolve().parent / "lib" / "openbao-env.sh"

SECRET_NAME = re.compile(r"(PASSWORD|PASSWD|SECRET|TOKEN|WEBHOOK|_KEY$|_KEYS$|^KEY_)")
VARIABLE_NAME = re.compile(r"[A-Z_][A-Z0-9_]*")
CREDENTIAL_URL = re.compile(r"://[^/@\s]*:[^/@\s]+@")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")

DEPLOY_POLICY = """
path "secret/data/veta/*" {
  capabilities = ["read"]
}
path "secret/metadata/veta/*" {
  capabilities = ["read"]
}
path "auth/token/revoke-self" {
  capabilities = ["update"]
}
"""

ADMIN_POLICY = """
path "secret/data/veta/*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list"]
}
path "secret/metadata/veta/*" {
  capabilities = ["read", "list", "delete"]
}
path "secret/metadata/" {
  capabilities = ["list"]
}
path "auth/approle/role/veta-deploy/secret-id" {
  capabilities = ["update", "list"]
}
path "auth/approle/role/veta-deploy/secret-id-accessor/*" {
  capabilities = ["update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
"""


def log(message):
    print(f"[openbao-bootstrap] {message}", file=sys.stderr)


def fail(message):
    log(f"ERROR: {message}")
    sys.exit(1)


def api(method, path, token=None, body=None, allow=(), probe=False):
    request = urllib.request.Request(
        f"{ADDR}/v1/{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **({"X-Vault-Token": token} if token else {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if error.code in allow:
            return error.code, {}
        detail = error.read().decode(errors="replace")
        fail(f"{method} {path} returned {error.code}: {detail}")
    except (OSError, http.client.HTTPException) as error:
        if probe:
            return None, {}
        fail(f"{method} {path} could not reach {ADDR}: {error}")


def health():
    status, _ = api("GET", "sys/health", allow=(429, 472, 473, 501, 503), probe=True)
    return status


def run(command, **kwargs):
    log("$ " + " ".join(str(part) for part in command))
    subprocess.run(command, check=True, **kwargs)


def as_root(mounts, script, capture=False):
    volumes = [arg for source, target in mounts for arg in ("-v", f"{source}:{target}")]
    command = ["docker", "run", "--rm", "-u", "0", "--entrypoint", "sh", *volumes, OPENBAO_IMAGE, "-c", script]
    return subprocess.run(command, check=True, capture_output=capture)


def ensure_unseal_key():
    subprocess.run(["docker", "volume", "create", UNSEAL_VOLUME], check=True, capture_output=True)
    result = as_root(
        [(UNSEAL_VOLUME, "/k")],
        "if test -s /k/current.key; then echo existing; else umask 077 && head -c 32 /dev/urandom > /k/current.key"
        " && chown openbao:openbao /k/current.key && chmod 0400 /k/current.key && echo generated; fi",
        capture=True,
    )
    log(f"{'Generated' if b'generated' in result.stdout else 'Using existing'} unseal key in volume {UNSEAL_VOLUME}")


def ensure_server():
    if health() is not None:
        log(f"OpenBao already reachable at {ADDR}; leaving the server and its key alone")
        return
    compose = OPENBAO_DIR / "compose.yml"
    if not compose.is_file():
        fail(f"{compose} missing; run a deploy first so the stack directory has deploy/openbao/")
    ensure_unseal_key()
    run(["docker", "compose", "-f", str(compose), "up", "-d"])
    for _ in range(60):
        if health() is not None:
            return
        time.sleep(1)
    fail(f"OpenBao did not answer at {ADDR} within 60s; check `docker logs veta-openbao`")


def wait_ready(token):
    for _ in range(60):
        if health() == 200:
            status, _ = api("GET", "sys/mounts", token=token, allow=(500, 503))
            if status == 200:
                return
        time.sleep(1)
    fail("OpenBao is not serving requests; check the unseal key mount and `docker logs veta-openbao`")


def initialise():
    if health() != 501:
        token = getpass.getpass(
            "OpenBao is already initialised. Root token (bao operator generate-root with the recovery key): "
        ).strip()
        if not token:
            fail("a token is needed to configure an initialised OpenBao")
        return token, False
    _, result = api("PUT", "sys/init", body={"recovery_shares": 1, "recovery_threshold": 1})
    record = {"recovery_keys_base64": result["recovery_keys_base64"], "root_token": result["root_token"]}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = Path.home() / f"openbao-init-{stamp}.json"
    descriptor = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(record, handle, indent=2)
    log(f"Initialised. Recovery key and root token written to {out} (mode 600)")
    return result["root_token"], True


def ensure_mount(token):
    status, _ = api("GET", "sys/mounts/secret", token=token, allow=(400, 404))
    if status == 200:
        return
    api("POST", "sys/mounts/secret", token=token, body={"type": "kv", "options": {"version": "2"}})
    log("Enabled KV v2 at secret/")


def ensure_auth(token, kind):
    _, mounts = api("GET", "sys/auth", token=token)
    if f"{kind}/" in mounts.get("data", mounts):
        return
    api("POST", f"sys/auth/{kind}", token=token, body={"type": kind})
    log(f"Enabled {kind} auth")


def configure(token):
    ensure_mount(token)
    api("PUT", "sys/policies/acl/veta-deploy", token=token, body={"policy": DEPLOY_POLICY})
    api("PUT", "sys/policies/acl/veta-admin", token=token, body={"policy": ADMIN_POLICY})
    ensure_auth(token, "approle")
    api(
        "POST",
        "auth/approle/role/veta-deploy",
        token=token,
        body={
            "token_policies": ["veta-deploy"],
            "token_ttl": "5m",
            "token_max_ttl": "15m",
            "token_no_default_policy": True,
            "secret_id_ttl": "0",
            "secret_id_num_uses": 0,
        },
    )
    ensure_auth(token, "userpass")
    log("Policies veta-deploy (read) and veta-admin (edit) in place; AppRole veta-deploy configured")


def ensure_admin_user(token):
    status, _ = api("GET", "auth/userpass/users/admin", token=token, allow=(404,))
    if status == 200:
        log("userpass user 'admin' already exists")
        return
    password = getpass.getpass("Choose a password for the OpenBao 'admin' user: ")
    if len(password) < 16 or password != getpass.getpass("Repeat it: "):
        fail("passwords must match and be at least 16 characters")
    api(
        "POST",
        "auth/userpass/users/admin",
        token=token,
        body={"password": password, "token_policies": ["veta-admin"], "token_ttl": "1h"},
    )
    log("Created userpass user 'admin' with the veta-admin policy")


def ensure_approle_credentials(token):
    if APPROLE_FILE.is_file():
        log(f"AppRole credentials already at {APPROLE_FILE}")
        return
    _, role = api("GET", "auth/approle/role/veta-deploy/role-id", token=token)
    _, secret = api("POST", "auth/approle/role/veta-deploy/secret-id", token=token, body={})
    APPROLE_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(APPROLE_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump({"role_id": role["data"]["role_id"], "secret_id": secret["data"]["secret_id"]}, handle)
    log(f"Wrote AppRole credentials to {APPROLE_FILE} (mode 600)")


def env_names(path):
    if not path.is_file():
        return []
    matches = (ASSIGNMENT.match(line) for line in path.read_text().splitlines())
    return list(dict.fromkeys(match.group(1) for match in matches if match))


def compose_resolve(path, names):
    if not names:
        return {}
    with tempfile.TemporaryDirectory() as directory:
        probe = Path(directory) / "compose.yml"
        probe.write_text(
            json.dumps({"services": {"probe": {"image": "scratch", "environment": {n: f"${{{n}}}" for n in names}}}})
        )
        environment = {key: os.environ[key] for key in ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG") if key in os.environ}
        result = subprocess.run(
            ["docker", "compose", "--project-directory", directory, "--env-file", str(path), "-f", str(probe), "config", "--format", "json"],
            env=environment,
            capture_output=True,
        )
    if result.returncode != 0:
        fail(f"docker compose could not resolve {path}: {result.stderr.decode(errors='replace').strip()}")
    resolved = json.loads(result.stdout)["services"]["probe"]["environment"]
    return {name: (resolved.get(name) or "").replace("$$", "$") for name in names}


def secrets_in(path, everything=False):
    names = env_names(path)
    unusable = [name for name in names if not VARIABLE_NAME.fullmatch(name)]
    if unusable:
        log(f"Skipping names the deploy loader cannot export from {path}: {', '.join(unusable)}")
    values = compose_resolve(path, [name for name in names if VARIABLE_NAME.fullmatch(name)])
    return {
        name: value
        for name, value in values.items()
        if value and (everything or SECRET_NAME.search(name) or CREDENTIAL_URL.search(value))
    }


def ticketing_token():
    if not TICKETING_TOKEN_FILE.parent.is_dir():
        return {}
    result = as_root(
        [(str(TICKETING_TOKEN_FILE.parent), "/s:ro")],
        f"test -s /s/{TICKETING_TOKEN_FILE.name} && cat /s/{TICKETING_TOKEN_FILE.name} || true",
        capture=True,
    )
    token = result.stdout.decode().strip()
    return {"GITHUB_TICKETING_TOKEN_SECRET": token} if token else {}


def kv_exists(token, path):
    status, _ = api("GET", f"secret/metadata/veta/{path}", token=token, allow=(404,))
    return status == 200


def import_secrets(token, path, values):
    if not values:
        log(f"Nothing to import for veta/{path}")
        return False
    if kv_exists(token, path):
        log(f"veta/{path} already exists in OpenBao; not overwriting it")
        return False
    api("POST", f"secret/data/veta/{path}", token=token, body={"data": values})
    log(f"Imported {len(values)} values to veta/{path}: {', '.join(sorted(values))}")
    return True


def loader_view(paths):
    script = (
        f'set -euo pipefail; source "{LOADER}"; openbao_export "$@" >/dev/null 2>&1 || exit 3; env -0'
    )
    environment = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(Path.home()),
        "OPENBAO_ADDR": ADDR,
        "OPENBAO_APPROLE_FILE": str(APPROLE_FILE),
    }
    result = subprocess.run(
        ["bash", "-c", script, "openbao-verify", *paths], env=environment, capture_output=True
    )
    if result.returncode != 0:
        fail("the deploy loader could not read the imported secrets with the AppRole credentials")
    pairs = [item.split("=", 1) for item in result.stdout.decode().split("\0") if "=" in item]
    shell_noise = {*environment, "PWD", "OLDPWD", "SHLVL", "_"}
    return {name: value for name, value in pairs if name not in shell_noise}


def matching(expected, seen):
    return {name for name, value in expected.items() if seen.get(name) == value}


def strip_env_file(path, names):
    if not path.is_file() or not names:
        return
    kept = [
        line
        for line in path.read_text().splitlines()
        if not ((match := ASSIGNMENT.match(line)) and match.group(1) in names)
    ]
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".env.strip.")
    with os.fdopen(descriptor, "w") as handle:
        handle.write("\n".join(kept) + ("\n" if kept else ""))
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    log(f"Removed {len(names)} secret values from {path}")


def main():
    if os.geteuid() == 0:
        fail("run as the deploy user, not root")
    ensure_server()
    token, generated = initialise()
    wait_ready(token)
    configure(token)
    ensure_admin_user(token)
    ensure_approle_credentials(token)

    platform = {**secrets_in(ENV_FILE), **ticketing_token()}
    loadgen = secrets_in(LOADGEN_ENV_FILE, everything=True)
    imported = {
        "platform": import_secrets(token, "platform", platform),
        "loadgen": import_secrets(token, "loadgen", loadgen),
    }
    present = [path for path in ("platform", "loadgen") if kv_exists(token, path)]
    seen = loader_view(present)
    platform_ok = matching(platform, seen)
    loadgen_ok = matching(loadgen, seen)
    if (imported["platform"] and platform_ok != set(platform)) or (
        imported["loadgen"] and loadgen_ok != set(loadgen)
    ):
        fail("round trip mismatch after import; .env files left untouched")
    log(f"Round trip verified: the deploy loader reads {len(seen)} variables with the AppRole credentials")

    strip_env_file(ENV_FILE, platform_ok)
    differing = sorted(set(platform) - platform_ok)
    if differing:
        log(f"Left in {ENV_FILE} because OpenBao holds a different value: {', '.join(differing)}")
    if loadgen and loadgen_ok == set(loadgen):
        LOADGEN_ENV_FILE.unlink()
        log(f"Deleted {LOADGEN_ENV_FILE}; loadgen credentials now live in veta/loadgen")

    if generated:
        api("POST", "auth/token/revoke-self", token=token)
        log("Revoked the root token. Regenerate one with the recovery key if ever needed.")

    leftovers = [
        *sorted(str(p) for p in STACK_DIR.glob(".env.bak*")),
        *sorted(str(p) for p in STACK_DIR.glob(".env.render.*")),
        *([str(TICKETING_TOKEN_FILE)] if "GITHUB_TICKETING_TOKEN_SECRET" in platform_ok else []),
    ]
    log("")
    log("Done. Next:")
    log("  1. Store the recovery key from ~/openbao-init-*.json in your password manager, then shred the file")
    log(f"  2. Back up the unseal key too: docker run --rm -u 0 -v {UNSEAL_VOLUME}:/k:ro --entrypoint base64 {OPENBAO_IMAGE} /k/current.key")
    log("  3. Run a deploy and check its log says it exported secrets from OpenBao")
    if leftovers:
        log("  4. These files still hold plaintext secrets; shred them once the deploy is healthy:")
        for item in leftovers:
            log(f"       {item}")
        if "GITHUB_TICKETING_TOKEN_SECRET" in platform_ok:
            log(
                f"     The token file is root-owned: docker run --rm -u 0 -v {TICKETING_TOKEN_FILE.parent}:/s"
                f" --entrypoint shred {OPENBAO_IMAGE} -u /s/{TICKETING_TOKEN_FILE.name}"
            )


if __name__ == "__main__":
    main()
