#!/bin/bash
# Regenerates build inputs: babylon.slim.js (tree-shaken bundle) + waternormals.b64
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-audit --no-fund esbuild @babylonjs/core @babylonjs/materials
node build.mjs
cd ..
curl -sL -o waternormals.jpg https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/waternormals.jpg
base64 -i waternormals.jpg -o waternormals.b64
echo "assets ready — run: python3 build.py"
