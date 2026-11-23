#!/usr/bin/env bash
set -euo pipefail
base=$1
apk=$2
pkg=com.phoenix.worldbuilder.engine.stable
adb install --no-streaming "$base"
adb shell run-as "$pkg" mkdir -p files
adb shell run-as "$pkg" touch files/upgrade-test-marker
adb install --no-streaming -r "$apk"
adb shell run-as "$pkg" test -f files/upgrade-test-marker
adb shell am start -W -n "$pkg/com.phoenix.worldbuilder.MainActivity"
for attempt in {1..45}; do
  pid=$(adb shell pidof -s "$pkg" | tr -d '\r')
  if [[ -n "$pid" ]] && adb shell cat /proc/net/unix | grep -F "webview_devtools_remote_$pid" >/dev/null; then
    adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
    break
  fi
  sleep 2
done
node updates/2.1.26/smoke-webview.cjs
