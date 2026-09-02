#!/usr/bin/env bash
# Builds dist/chrome and dist/firefox (plus zips) from src/.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist
for target in chrome firefox; do
  mkdir -p "dist/$target"
  cp -R src/. "dist/$target/"
  cp "manifest.$target.json" "dist/$target/manifest.json"
  (cd "dist/$target" && zip -qr "../ai-writing-signs-$target.zip" .)
done
echo "Built dist/chrome, dist/firefox, and zips in dist/"
