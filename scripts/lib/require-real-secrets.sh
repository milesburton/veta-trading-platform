#!/usr/bin/env bash

REQUIRED_SECRETS=(POSTGRES_PASSWORD AUDIT_DB_PASSWORD MINIO_ROOT_PASSWORD INTERNAL_SERVICE_TOKEN)
OPTIONAL_SECRETS=(APP_DB_PASSWORD)
KNOWN_DEFAULT_SECRETS=(veta veta_audit veta_app change-me-in-production veta-dev-service-token)

require_real_secrets() {
    local name value default bad=0
    for name in "${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}"; do
        value="${!name:-}"
        if [[ -z "$value" ]]; then
            if [[ " ${OPTIONAL_SECRETS[*]} " == *" $name "* ]]; then
                continue
            fi
            echo "[secrets] $name is not set; add it to the OpenBao platform path" >&2
            bad=1
            continue
        fi
        for default in "${KNOWN_DEFAULT_SECRETS[@]}"; do
            if [[ "$value" == "$default" ]]; then
                echo "[secrets] $name is a known compose default; set a real value in the OpenBao platform path" >&2
                bad=1
            fi
        done
    done
    return "$bad"
}
