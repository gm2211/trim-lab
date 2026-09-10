# Graphics, physics and UI review

## Changes

Blender now authors repeatable normal and roughness maps for gelcoat, sailcloth,
nonskid and braided rope. This improves the existing Babylon materials while
retaining live sail geometry, telltales, and color-coded lines. The runtime stays
self-contained. A full baked boat GLB would freeze the trim-dependent parts and
require additional loading and mesh-binding infrastructure; it is unnecessary
for this material pass. The source generator can also save an editable .blend.

The hull has a clear coat and sheer stripe. Opening the cockpit removes the old
full-width deck over the seats and sole. Sail albedo adds corner reinforcement
and stitching without painted lighting. Blocks now have separate cheeks, sheaves
and axles; traveler and both jib cars carry their hardware. Rope UV repeat length
is based on metres, so short tackle falls no longer get the same 40 repeats as
long halyards. Sun intensity is reduced to retain material detail.

The physics review found and fixed:

- Lowered sails retained a hard 0.05 m/s speed floor.
- Zero-degree wind headings fell back to the close-hauled preset; apparent wind
  also had a false lower-angle clamp.
- Returned apparent wind and sheet loads came from the previous solver iteration.
- Main-halyard tension above full hoist did not change draft despite the UI guide.
- Downwind jib trim score used the mainsail's angle and twist.
- 3D forced the boom to the leeward side even when traveler trim crossed centerline.
- The last frame of a tack could skip the final rigging/cloth target update.
- Long render gaps reached dye/telltales and angular motion without a time cap.

The existing cloth solver already used fixed 60 Hz substeps. That architecture
is retained. Visual motion now caps elapsed time, uses exponential angular
smoothing, and skips hidden 3D views. Pause motion supports inspection and starts
paused for reduced-motion users; changing trim while paused updates the boat.

The UI now provides full-rig, deck, sail and rigging camera presets. Toolbars and
telemetry use separate rows. The narrow layout puts the boat before the trim
panel. The wind dial has keyboard navigation and current ARIA values; selection
buttons expose their states. Flat heel no longer implies no power, theoretical
hull speed is marked approximate, and the heuristic trim score is not labelled
as a measured percentage of optimal speed.

## Verification

- `node --test tests/physics.test.cjs`: 9 passing tests, including a 120-case
  sweep over wind, heading, hoist and trim extremes.
- The same suite against the original source: 5 failures reproduced.
- `tests/scene.html`: 18 real WebGL checks for loaded material maps, color-space
  settings, pulley geometry, tack sign, paused motion, line UVs and cameras.
- Browser review of desktop and narrow layouts, camera presets, visual-aid
  toggles, keyboard wind changes and trim while paused.
- Both standalone HTML outputs rebuilt and compared byte-for-byte.

## Limits

This remains an approximate steady-state training model, not a validated Colgate
26 velocity prediction program. The lift/stall curves, hull resistance, crew
righting moment and halyard response need measured polar/load data for calibration.
There is no transient boat inertia, dynamic buoyancy, sheet elasticity, or full
cloth collision model. Wave and sail breathing are visual approximations. The
current normal maps add surface detail, not fiber-scale geometry or fabric
transmission; the sail window remains painted. More realistic foil/hull shapes,
true sail windows and an environment-lighting pass are possible follow-ups.

Bakes add about 0.45 MB to each standalone page (roughly 2.53 MB to 2.98 MB).
Blender is only needed to regenerate assets, never to run or build from committed
assets. The canonical Babylon bundle is unchanged.
