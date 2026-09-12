# Trim Lab — Colgate 26 sail-trim trainer

Interactive trainer: approximate steady-state physics (segment aero, two-element vortex panel method,
heel/leeway force balance), Babylon.js 3D with PBD sail cloth (folding, flogging),
wind-driven boom yaw with inertia, damping and mainsheet length limits,
wind-driven jib clew motion and constrained free-sheet spans,
wind-dye streamlines from solved circulation, depth-tested 3D yarn telltales,
per-slider trim-optimality indicators,
and a coordinate-descent "perfect trim" solver. 2D views: sail sections, deck plan,
twist-from-astern, heel gauge, a hand-written, reviewed static drill list (in `src-app.html`),
and concept guides.

## Layout
- `src-app.html` — the entire app (HTML/CSS/JS) with a `<script id="lib-slot">` placeholder.
- `babylon.lib.js` — committed canonical WebGL-only Babylon bundle and water normals.
- `assets/boat/trim-boat.blend` — editable Blender boat and hardware geometry.
- `build-tools/model-boat.py` — evaluated mesh export with original modifier stacks.
- `build-tools/bake-materials.py` — reproducible Blender marine material bakes.
- `assets/materials/` — committed normal/roughness maps and authoring instructions.
- `build.py` — embeds the library, rope textures and marine maps into both built pages.

## Build
```bash
python3 build.py                # all build inputs are committed; Blender is optional
```
`build.py` writes two identical self-contained pages (~4.2 MB each): `app.html` at the
repo root and `docs/index.html`. Both are committed; rebuild and commit them whenever
`src-app.html` or the bundled library changes.

Run `node --test tests/*.test.cjs` for physics, free-sheet and sail-contact regressions. Serve locally
with `python3 -m http.server 8765 --bind 127.0.0.1` and open
`http://127.0.0.1:8765/tests/scene.html` for WebGL integration checks.
Use **Inspect red port yarn** and **Inspect green starboard yarn** for close-ups
of the jib faces. Pixel checks verify the cloth hides the far-side yarn on both tacks.
Use **Inspect luffing boom** on that page to see the head-to-wind motion.
Use **Inspect luffing jib sheets** to inspect both sheets following the clew.
Use the two **Inspect … tack slot** buttons to inspect sail contact with an
eased main and tightly sheeted jib on either tack.
See [Blender model authoring](assets/boat/README.md), [material authoring](assets/materials/README.md) and the
[graphics, physics and UI review](docs/graphics-physics-review.md) for details and
the model's calibration limits.

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
