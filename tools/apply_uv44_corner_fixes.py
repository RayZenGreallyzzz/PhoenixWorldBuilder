#!/usr/bin/env python3
"""Safely apply the UV44-compatible Nov 9 corner/UV backport.

Requires the actual UV44 APK web files to have been imported first with
tools/import_uv44_assets.py, not the older main-branch placeholders.
The patch intentionally does not touch the rest of the builder.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MARK = "PHOENIX_UV44_POSTFIX_20261109"
ORIGINAL = {
    "surface-workshop.js": "06b85ab6f6b5529a5c8e466cd2e3eedad2b0ccd0119ad0145bd500789fc75de2",
    "surface-materials.js": "e8cc21bf437b2e339ce2c83866657c565ff81036e37af0685c8f9fe1faaf7a64",
}
PATCHED = {
    "surface-workshop.js": "75b0e0e6179384dfa834e6a73481486e4249ea1c4cd2143c181bfa794fdf7a9e",
    "surface-materials.js": "c77b97d1075f66b613ccdab7d10a2244aa1aa5982bffc9378150e656587f72b6",
}
PATCH = ROOT / "patches" / "uv44-corner-uv-postfix-20261109.patch"
JS = ROOT / "app" / "src" / "main" / "assets" / "js"

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    arg = argparse.ArgumentParser()
    arg.add_argument("--check", action="store_true", help="Validate patch against original UV44, without applying")
    args = arg.parse_args()
    states = []
    for name in ORIGINAL:
        p = JS / name
        if not p.is_file():
            raise SystemExit(f"Missing UV44 file: {p}; first run tools/import_uv44_assets.py")
        state = "original" if digest(p) == ORIGINAL[name] else "patched" if digest(p) == PATCHED[name] else "unknown"
        states.append(state)
        print(f"{name}: {state}")
    if states == ["patched", "patched"]:
        print("UV44 corner/UV post-fix already applied; no changes made.")
        return
    if states != ["original", "original"]:
        raise SystemExit("Mixed/unknown source files — refusing to change unrelated sources.")
    command = ["git", "apply", "--check", str(PATCH)]
    subprocess.run(command, cwd=ROOT, check=True)
    if args.check:
        print("Patch applies cleanly.")
        return
    subprocess.run(["git", "apply", str(PATCH)], cwd=ROOT, check=True)
    for name in PATCHED:
        result = digest(JS / name)
        if result != PATCHED[name]:
            raise SystemExit(f"Unexpected patched hash for {name}: {result}")
    print("UV44 corner/UV post-fix applied. Run: node tests/test-uv44-postfix.cjs")

if __name__ == "__main__":
    main()
