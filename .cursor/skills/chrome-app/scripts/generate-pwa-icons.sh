#!/bin/bash
# Generate PWA PNG icons from an SVG source.
# Usage: bash generate-pwa-icons.sh [svg_path] [output_dir]
# Example: bash generate-pwa-icons.sh public/favicon.svg public/icons

set -euo pipefail

SVG="${1:-public/favicon.svg}"
OUT="${2:-public/icons}"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "Error: rsvg-convert not found. Install librsvg (e.g. brew install librsvg)." >&2
  exit 1
fi

if [ ! -f "$SVG" ]; then
  echo "Error: SVG not found: $SVG" >&2
  exit 1
fi

mkdir -p "$OUT"

rsvg-convert -w 180 -h 180 "$SVG" -o "$OUT/apple-icon-180.png"
rsvg-convert -w 192 -h 192 "$SVG" -o "$OUT/manifest-icon-192.png"
rsvg-convert -w 512 -h 512 "$SVG" -o "$OUT/manifest-icon-512.png"
rsvg-convert -w 196 -h 196 "$SVG" -o "$OUT/favicon-196.png"

echo "Generated PWA icons in $OUT:"
ls -1 "$OUT"/*.png
