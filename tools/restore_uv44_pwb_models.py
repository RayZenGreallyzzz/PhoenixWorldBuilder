#!/usr/bin/env python3
"""Restore the exact 1832 built-in PWB GLB modules from the owner's UV44 APK.

This tool only copies assets/pwb/*.glb; it NEVER overwrites the engine's JS.
To avoid publishing unverified third-party model rights in a public repository,
keep the imported directory local (add app/src/main/assets/pwb/ to .gitignore).
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from zipfile import ZipFile

EXPECTED_APK = "ae90230b8bf9db3d510efd2c403db768db00fbdbcf91ed538b977aec25645e85"
DEST = Path(__file__).resolve().parents[1] / "app/src/main/assets/pwb"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("apk",type=Path,help="Phoenix_Builder_UV44_Install(3).apk")
    parser.add_argument("--dest",type=Path,default=DEST)
    args=parser.parse_args()
    if not args.apk.is_file():parser.error("The UV44 APK does not exist")
    with args.apk.open("rb") as f:
        sha=hashlib.file_digest(f,"sha256").hexdigest()
    if sha!=EXPECTED_APK:parser.error("Not the verified stable UV44 APK: "+sha)
    with ZipFile(args.apk) as z:
        manifest=z.read("assets/js/bundled-catalog.js").decode("utf-8")
        match=re.search(r"const BundledCatalog\s*=\s*(\[.*\]);?",manifest,re.S)
        if not match:raise ValueError("Missing Builder catalog")
        items=json.loads(match.group(1))
        if len(items)!=1832:raise ValueError("Unexpected catalog size")
        targets=set()
        for item in items:
            id=item["id"]
            if not re.fullmatch(r"glb:pwb:[0-9a-f]{20,40}",id):
                raise ValueError("Invalid built-in model ID: "+id)
            path="assets/pwb/"+id.removeprefix("glb:pwb:")+".glb"
            info=z.getinfo(path)
            if info.file_size!=item["bytes"]:
                raise ValueError("Builder catalog differs from APK: "+path)
            targets.add(path)
        found={i.filename for i in z.infolist() if i.filename.startswith("assets/pwb/") and not i.is_dir()}
        if targets!=found:raise ValueError("Asset catalog / APK resource mismatch")
        args.dest.mkdir(parents=True,exist_ok=True)
        total=0
        for index,path in enumerate(sorted(targets)):
            data=z.read(path)
            if data[:4]!=b"glTF":raise ValueError("Invalid GLB header: "+path)
            target=args.dest / Path(path).name
            target.write_bytes(data)
            total+=len(data)
        print(f"Restored {len(targets)} GLB modules ({total:,} bytes) into {args.dest}")
        print("This directory is intentionally not committed to the public repo.")

if __name__=="__main__":main()
