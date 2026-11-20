# Phoenix Builder UV44 — baseline recovery

This branch was created as a dedicated UV44 restoration target. It is **not yet** a verified 1:1 reconstruction of the supplied APK.

## Reference binary

- Supplied filename: `Phoenix_Builder_UV44_Install(3).apk`
- SHA-256: `ae90230b8bf9db3d510efd2c403db768db00fbdbcf91ed538b977aec25645e85`
- Embedded WebView files: `assets/index.html`, `assets/style.css`, `assets/clean.css`, `assets/js/`, `assets/pwb/`
- 71 JavaScript files in `assets/js/`
- 1,832 bundled GLB models in `assets/pwb/`
- `assets/js/clean-app.js`: 259,644 bytes, SHA-256 `958c50751f4740d1f62bca0345347f49b88f2d465844b4d4337586df9306d10b` *(verify with the APK before copying; metadata is supplied primarily to identify the binary)*

## Status

The branch currently inherits the repository's previous `main` tree. The provided UV44 APK is a substantially different build: for example, its `clean-app.js` is ~260 KB, while the main-branch version was ~38 KB at comparison time.

**Do not describe this branch as the UV44 source tree or build an APK expecting UV44 behavior until the asset files have been imported and verified.**

## How to restore the APK web assets

1. Make a working copy of this branch.
2. Use `python3 tools/import_uv44_assets.py '/path/to/Phoenix_Builder_UV44_Install(3).apk' --clean` to copy HTML/CSS/JavaScript files into `app/src/main/assets/`. Add `--include-models` only when you intend to commit the bundled GLB library and have redistribution rights.
3. Carefully review changes, especially third-party dependencies and `assets/pwb/` GLB redistribution rights, before committing to this public repository.
4. Verify the Android-side bridge matches the APK's expected JavaScript interface. Original Java/Kotlin source is not embedded in an APK.
5. Test loading/saving JSON, GLB export, building and player locomotion on an Android device.

For an Android-compatible Phoenix Engine baseline, preserve the original UV44 project save/load and construction flow. Keep landscape and game runtime modules isolated.

## Phoenix Engine branch

`phoenix-engine-0.1` remains a separate branch created from `main`. It has **not** been rebased onto this UV44 baseline.

## Subsequent UV / corner fixes identified on GitHub (tracked for backport)

The user recalled fixes committed after the stable UV44 APK. The supplied APK's `surface-workshop.js` and `surface-materials.js` do not contain the distinctive code added in these November 9 commits. Before making an Engine baseline, review the **whole dependency chain** in GitHub, not just isolated cherry-picks:

- `7b7e5d7483e5` — physical UV dimensions and imported arc/L-corner wall mapping.
- `6779abe9cbd7` — accurate endpoints and seam-safe UV mapping for quarter/half curved walls.
- `edad120a2c3a` — rotated/mirrored L-corner UV orientation using local triangle normals.
- `c5d26cd442ce` — outside/front finish for both left- and right-hand imported L-corners.
- `b89c4bba8b1a` and `d6cdb4ee9191` — follow-up changes for mirrored L-wall exterior and imported flat-wall faces.

Relevant GitHub branches: `fix/pr44-safe-curved-uv-window-glass`, `fix/pr44-physical-corner-sides-and-cut-safe-uv`, and `fix/phoenix-wall-exterior-uv-wrap-20261110`. These branches contain additional changes including tests and mirror controls; **do not copy the entire branch blindly**.

**Status:** candidate commits identified; a selective patch and tests are now prepared, but no app files have been committed to the branch. The `stable/uv44` branch still needs UV44 WebView asset restoration and device testing before selective porting.

## Compatible backport prepared (2026-11-20)

- Patch: `patches/uv44-corner-uv-postfix-20261109.patch`
- Guarded patch application: `tools/apply_uv44_corner_fixes.py`
- Regression checks: `tests/test-uv44-postfix.cjs`

This is a **selective backport for the supplied APK's WebView code**. The original November 9 files were from a different revision and should not replace the whole current UV44 modules.

Commands from the repository checkout with the original APK accessible locally:

```sh
python3 tools/import_uv44_assets.py '/path/to/Phoenix_Builder_UV44_Install(3).apk' --clean
python3 tools/apply_uv44_corner_fixes.py --check
python3 tools/apply_uv44_corner_fixes.py
node tests/test-uv44-postfix.cjs
```

The import skips the APK's bundled GLB library unless `--include-models` is passed. Review model rights and app behavior before making the WebView source public. **Current branch still does not contain the full restored UV44 asset tree**; the patch and test scripts are committed, but no APK has been built from this restoration.
