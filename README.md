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
python3 build.py                # splices src-app.html + babylon.lib.js + rope textures
```
`build.py` writes two identical self-contained pages (~2.5 MB each): `app.html` at the
repo root and `docs/index.html`. Both are committed; rebuild and commit them whenever
`src-app.html` or the bundled library changes.

## Deploy
GitHub Pages serves `docs/` from `main` at https://gm2211.github.io/trim-lab/,
so merging to `main` is the deploy:

1. `python3 build.py`
2. Commit the rebuilt `app.html` and `docs/index.html` alongside the source change.
3. Open a PR and merge to `main`. Pages picks up the new `docs/index.html` within a minute or two.

## Environment gotchas (hard-won)
- Artifact iframes deny the `gamepad` Permissions-Policy feature; Babylon's camera
  input probes `navigator.getGamepads()` and dies — shimmed in `ensure3D`.
- The artifact pipeline re-bundles inline scripts; debug the *served* page, not the upload.
- Hidden browser tabs get zero rAF frames — a "frozen" 3D view unfreezes on focus.

## One-click Claude subscription sign-in (auth relay)

The coach's "Connect Claude" button runs the whole OAuth flow in the browser except
the code→token exchange, which Anthropic's endpoint refuses from any browser origin.
`relay/worker.js` is that one step as a stateless serverless function (nothing stored,
nothing logged). Deploy it once, free, either way:

```bash
npx wrangler deploy relay/worker.js --name trim-lab-relay --compatibility-date 2026-01-01
```

or point a [Deno Deploy](https://dash.deno.com) project at `relay/worker.js`.

Paste the deployed URL into the coach ⚙ panel once. Grok device-code support and the
Codex enterprise-token path (motive's own one-click Codex is disabled upstream too)
can ride the same relay later.
