#!/usr/bin/env python3
"""Merge multiple LCOV files: union of hit lines per source file.

Naive concatenation double-counts every line in files that appear in
more than one input, which deflates the resulting percentage. This
merger combines per-line hit counts with max() and emits a single
LCOV record per source file.

Usage:
  scripts/merge-lcov.py unit.lcov tc.lcov ... > combined.lcov
"""
import sys
from collections import defaultdict


def parse(path):
    files = {}
    current = None
    with open(path) as f:
        for line in f:
            stripped = line.strip()
            if stripped.startswith("SF:"):
                current = stripped[3:]
                if current not in files:
                    files[current] = defaultdict(int)
            elif stripped.startswith("DA:") and current:
                ln, hits = stripped[3:].split(",")[:2]
                ln, hits = int(ln), int(hits)
                files[current][ln] = max(files[current][ln], hits)
            elif stripped == "end_of_record":
                current = None
    return files


def merge(paths):
    merged = {}
    for p in paths:
        for sf, lines in parse(p).items():
            if sf not in merged:
                merged[sf] = defaultdict(int)
            for ln, hits in lines.items():
                merged[sf][ln] = max(merged[sf][ln], hits)
    return merged


def emit(merged, out):
    for sf in sorted(merged):
        out.write(f"SF:{sf}\n")
        lf = len(merged[sf])
        lh = sum(1 for h in merged[sf].values() if h > 0)
        for ln in sorted(merged[sf]):
            out.write(f"DA:{ln},{merged[sf][ln]}\n")
        out.write(f"LF:{lf}\n")
        out.write(f"LH:{lh}\n")
        out.write("end_of_record\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write(f"usage: {sys.argv[0]} file1.lcov [file2.lcov ...]\n")
        sys.exit(2)
    merged = merge(sys.argv[1:])
    emit(merged, sys.stdout)
