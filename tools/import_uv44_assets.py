#!/usr/bin/env python3
"""Restore UV44 WebView assets from the original user-provided APK.

Run this from a checkout of the stable/uv44 branch.
The original Java/Kotlin source and Gradle project are NOT recoverable from this script.
"""
import argparse
import hashlib
from pathlib import Path, PurePosixPath
import shutil
import sys
from zipfile import ZipFile

EXPECTED_SHA256 = "ae90230b8bf9db3d510efd2c403db768db00fbdbcf91ed538b977aec25645e85"
REPO_ROOT = Path(__file__).resolve().parent.parent
DESTINATION = REPO_ROOT / "app" / "src" / "main" / "assets"

def main():
    parser = argparse.ArgumentParser(description="Extract UV44 assets/ into the Android project.")
    parser.add_argument("apk", type=Path, help="Path to Phoenix_Builder_UV44_Install(3).apk")
    parser.add_argument("--include-models", action="store_true",
                        help="Also import assets/pwb/*.glb (review redistribution rights before committing).")
    parser.add_argument("--clean", action="store_true",
                        help="Remove the old app/src/main/assets tree first, preventing stale files.")
    args = parser.parse_args()
    if not args.apk.is_file():
        parser.error("APK file does not exist.")
    digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        parser.error(f"APK SHA-256 does not match supplied UV44 APK: {digest}")
    if args.clean and DESTINATION.exists():
        shutil.rmtree(DESTINATION)
    DESTINATION.mkdir(parents=True, exist_ok=True)
    files = 0
    with ZipFile(args.apk) as archive:
        for info in archive.infolist():
            name = info.filename
            if info.is_dir() or not name.startswith("assets/"):
                continue
            if name.startswith("assets/pwb/") and not args.include_models:
                continue
            rel = PurePosixPath(name).relative_to("assets")
            if not rel.parts or any(part in ("..", ".") for part in rel.parts):
                raise ValueError(f"Unsafe archive entry: {name}")
            target = DESTINATION.joinpath(*rel.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
            files += 1
    print(f"Imported {files} APK WebView asset files into {DESTINATION}")
    if not args.include_models:
        print("Skipped assets/pwb/ GLB files. Use --include-models only if redistribution is authorized.")
    if not args.clean:
        print("Warning: older files not present in the APK may remain. Use --clean to remove them.")

if __name__ == "__main__":
    main()
