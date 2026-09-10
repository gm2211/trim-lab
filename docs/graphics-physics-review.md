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
cove stripe. Nonskid inserts have their own diamond texture. Winches have grip
rings, self-tailers and sockets; blocks have grooved sheaves, cheeks and shackles.
Metal uses a generated sky/sea reflection texture. Gelcoat, rubber, metal, deck
inserts and cloth now have different finishes.

Sails still deform through the existing cloth solver. They have fine weave,
paired seams, corner reinforcements, batten pockets and transparent window areas.
The Blender normal/roughness bakes remain, with runtime albedo detail appropriate
to each sail. They are not frozen Blender sail meshes.

Running rigging uses four mainsheet falls, arcs around the sheaves, two vang
falls, three turns around each winch, separate deck lead lanes, storage pockets,
and separate sheet coils on the seats. Halyards and outhaul runs inside the
extrusions are not drawn as loose external diagonals. Rope color has braid and
tracer detail, with metre-based UV repeats. Wind dye starts off for inspection.

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

- Nine physics tests pass, including 120 extreme-state cases. Five earlier
  regressions reproduce against the original source.
- 24 browser WebGL checks cover imported Blender geometry, material readiness,
  map color spaces, manufactured hardware, four mainsheet falls, stored tails,
  finite rope paths, tack mirroring, pause, physical rope UVs and camera distances.
- Exported position/normal/UV counts and triangle indices are valid.
- Actual deck/rigging close-ups and full-boat views reviewed in the browser.
- Editable Blender scene rendered separately to verify its geometry.
- Both standalone pages rebuilt identically; JavaScript syntax and whitespace
  checks pass. Final pages are approximately 4.0 MB each.

## Limits

This is an illustrative Colgate-style trainer, not a dimension-verified CAD
replica. Existing simulation attachment locations, including the mid-boom
mainsheet/traveler anchors, remain. The manufacturer's equipment list guided
nonskid and 4:1 tackle; it does not validate every layout dimension.

The force model remains approximate and steady-state, without measured polar
calibration, transient boat inertia, dynamic buoyancy or sheet elasticity.
Cloth and rope collision handling is approximate; extreme sail/rig intersections
are not a fully solved contact system. Water motion and sail breathing are visual
approximations. Lighting has environment reflections but no new real-time shadow
pipeline. Browser geometry decompression requires DecompressionStream.
