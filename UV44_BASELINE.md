# Phoenix Builder UV44 — baseline recovery

This branch was created as a dedicated UV44 restoration target. It is **not yet** a verified 1:1 reconstruction of the supplied APK.

## Reference binary

- Supplied filename: `Phoenix_Builder_UV44_Install(3).apk`
- SHA-256: `ae90230b8bf9db3d510efd2c403db768db00fbdbcf91ed538b977aec25645e85`
- Embedded WebView files: `assets/index.html`, `assets/style.css`, `assets/clean.css`, `assets/js/`, `assets/pwb/`
- 71 JavaScript files in `assets/js/`
- 1,832 bundled GLB models in `assets/pwb/`
- `assets/js/clean-app.js`: 259,644 bytes, SHA-256 `958c50751f4740d1f62b3c3e54b37ebdb25032b7e1cc1ee1bddaa76b472c8a3` *(verify with the APK before copying; metadata is supplied primarily to identify the binary)*

## Status

The branch currently inherits the repository's previous `main` tree. The provided UV44 APK is a substantially different build: for example, its `clean-app.js` is ~260 KB, while the main-branch version was ~38 KB at comparison time.

**Do not describe this branch as the UV44 source tree or build an APK expecting UV44 behavior until the asset files have been imported and verified.**

## How to restore the APK web assets

1. Make a working copy of this branch.
2. Use `python3 tools/import_uv44_assets.py /path/to/Phoenix_Builder_UV44_Install\(3\).apk` to copy bundled `assets/` into `app/src/main/assets/`.
3. Carefully review changes, especially third-party dependencies and `assets/pwb/` GLB redistribution rights, before committing to this public repository.
4. Verify the Android-side bridge matches the APK's expected JavaScript interface. Original Java/Kotlin source is not embedded in an APK.
5. Test loading/saving JSON, GLB export, building and player locomotion on an Android device.

For an Android-compatible Phoenix Engine baseline, preserve the original UV44 project save/load and construction flow. Keep landscape and game runtime modules isolated.

## Phoenix Engine branch

`phoenix-engine-0.1` remains a separate branch created from `main`. It has **not** been rebased onto this UV44 baseline.
