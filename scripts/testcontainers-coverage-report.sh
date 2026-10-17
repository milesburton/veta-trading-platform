#!/usr/bin/env bash
set -euo pipefail

raw_dir="${1:-coverage-tc}"
out_file="${2:-coverage-tc.lcov}"
report_dir="$(mktemp -d)"
trap 'rm -rf "$report_dir"' EXIT

npx c8 report \
  --temp-directory="$raw_dir" \
  --reporter=lcovonly \
  --reports-dir="$report_dir" \
  --all \
  --src=backend/src \
  --src=shared \
  --include='backend/src/**' \
  --include='shared/**' \
  --exclude='backend/src/tests/**' \
  --exclude='backend/src/test-support/**' \
  --exclude='**/*.test.ts'

cp "$report_dir/lcov.info" "$out_file"
