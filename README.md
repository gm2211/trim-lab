# Trim Lab — Colgate 26 sail-trim trainer

Interactive trainer: VPP-grade physics (segment aero, two-element vortex panel method,
heel/leeway force balance), Babylon.js 3D with PBD sail cloth (folding, flogging),
wind-dye streamlines from solved circulation, per-slider trim-optimality indicators,
and a coordinate-descent "perfect trim" solver. 2D views: sail sections, deck plan,
twist-from-astern, heel gauge, drills and concept guides.

## Layout
- `src-app.html` — the entire app (HTML/CSS/JS) with a `<script id="lib-slot">` placeholder.
- `build-tools/` — esbuild bundling of a tree-shaken Babylon.js (WGSL/WebGPU stubbed:
  the artifact publisher misclassifies pages containing WGSL source, and we're WebGL-only).
- `build.py` — splices `babylon.slim.js` + base64 water normals into `trim-lab.html`.

## Build
```bash
./build-tools/fetch-assets.sh   # once, or after Babylon version bumps
python3 build.py                # emits trim-lab.html (~2.3 MB, self-contained)
```

## Deploy
Published as a Claude artifact (single self-contained page):
https://claude.ai/code/artifact/0f10d493-cfc5-4752-bfd5-d856ba4f6ea7
Republish by passing that URL as `url` when publishing `trim-lab.html`.

## Environment gotchas (hard-won)
- Artifact iframes deny the `gamepad` Permissions-Policy feature; Babylon's camera
  input probes `navigator.getGamepads()` and dies — shimmed in `ensure3D`.
- The artifact pipeline re-bundles inline scripts; debug the *served* page, not the upload.
- Hidden browser tabs get zero rAF frames — a "frozen" 3D view unfreezes on focus.
