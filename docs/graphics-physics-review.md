# Graphics, physics and UI review

## Delivered graphics

The visible boat now imports geometry authored and evaluated in Blender. The
committed `assets/boat/trim-boat.blend` has an assembled preview, named parts,
linked hardware instances, and editable bevel/subdivision modifiers. Its mesh
export supplies the hull, cockpit, coachroof, foils, rails, spars, tracks,
winches, clutches, cars and double blocks. Separate asset roots retain working
trim and rudder movement. The custom export groups surfaces by material and is
compressed into both standalone pages; the canonical Babylon bundle is unchanged.

The hull has faired surfaces, rounded moldings, a rubber hull/deck joint and a
cove stripe. Nonskid inserts have their own fine stippled texture. Winches have grip
rings, self-tailers and sockets; blocks have grooved sheaves, cheeks and shackles.
Metal uses a generated sky/sea reflection texture. Gelcoat, rubber, metal, deck
inserts and cloth now have different finishes.

Sails still deform through the existing cloth solver. They have fine weave,
paired seams, corner reinforcements, batten pockets and transparent window areas.
The Blender normal/roughness bakes remain, with runtime albedo detail appropriate
to each sail. They are not frozen Blender sail meshes.

Running rigging uses three aft mainsheet falls plus a forward return to the central cockpit
ratchet, two vang falls, three turns around each winch, separate deck lead lanes,
hanging halyard coils and separate jib sheet coils on the seats. Halyards and outhaul runs inside the
extrusions are not drawn as loose external diagonals. Rope color has braid and
tracer detail, with metre-based UV repeats. Wind dye starts off for inspection.

## Reference correction

The supplied photos exposed substantial layout errors in the first model.
The current Blender model has a forward mast, low wedge coachroof, sloping
companionway, deep cockpit with long recessed benches, aft traveler behind the
rudder head, low boarding transom, cabin-top winches, wooden tiller, rigid vang
and swept spreaders. Hull stations use the supplied side/aerial views and
published overall dimensions. See `assets/boat/README.md` for exact reference
roles and the distinction between published and photo-estimated measurements.

Shared `RIG` coordinates now feed the Blender export, 3D attachment points and
sheet-length constraint. The aerodynamic panel layout follows the moved mast
and longer main foot. At unchanged default controls, the approximate equilibrium
changes from about 5.2 kt / 10.2 degrees heel to 5.0 kt / 7.2 degrees. This is a
consequence of changed geometry, not validation against a measured Colgate polar.
The two-dimensional deck diagram also shows the traveler aft.

## Physics and UI

The earlier pass corrected the bare-poles speed floor, zero-heading fallback,
stale final apparent-wind output, main-halyard draft response, and downwind jib
scoring that used the mainsail geometry. It also corrected the windward boom's
3D sign and the final tack target update. Those corrections remain.

The fixed 60 Hz cloth steps remain. Visual elapsed time is capped, angular
smoothing is exponential, and hidden 3D views stop rendering. Motion pause
supports inspection and reduced-motion users while still allowing trim changes.
The UI provides four camera presets, separate control/telemetry rows, mobile
stacking, keyboard wind control and accessible selection states.

## Verification

- Eleven physics tests pass, including 120 extreme-state cases. Five earlier
  regressions reproduce against the original source.
- 28 browser WebGL checks cover imported Blender geometry, material readiness,
  map color spaces, manufactured hardware, shared layout anchors, matching tackle spans, hanging tails,
  finite rope paths, tack mirroring, pause, physical rope UVs and camera distances.
- Exported position/normal/UV counts and triangle indices are valid.
- Actual deck/rigging close-ups and full-boat views reviewed in the browser.
- Editable Blender scene rendered separately to verify its geometry.
- Both standalone pages rebuilt identically; JavaScript syntax and whitespace
  checks pass. Final pages are approximately 4.2 MB each.

## Limits

The model is photo-referenced, not a dimension-verified CAD replica. Published
LOA, beam and draft guided overall proportions; intermediate hull stations and
fitting coordinates are estimates from photographs. The photos show different
sail and hardware configurations. No spinnaker, outboard or mooring covers were
added to the active sailing simulation.

The force model remains approximate and steady-state, without measured polar
calibration, transient boat inertia, dynamic buoyancy or sheet elasticity.
Cloth and rope collision handling is approximate; extreme sail/rig intersections
are not a fully solved contact system. Water motion and sail breathing are visual
approximations. Lighting has environment reflections but no new real-time shadow
pipeline. Browser geometry decompression requires DecompressionStream.
