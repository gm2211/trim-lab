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
ratchet, two vang falls, at least three clockwise turns around each winch, separate deck lead lanes,
hanging halyard coils and separate jib sheet coils on the seats. Halyards and outhaul runs inside the
extrusions are not drawn as loose external diagonals. Rope color has braid and
tracer detail, with metre-based UV repeats. Wind dye starts on to show airflow; its toggle clears the view for inspection.

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

- Thirty-six physics and free-sheet tests pass, covering equilibrium extremes,
  boom/jib excitation, damping, zero wind, lowered sails, timestep consistency,
  sheet constraints, rope settling and incompatible contact geometry.
- 64 browser WebGL checks cover imported Blender geometry, material readiness,
  map color spaces, manufactured hardware, shared layout anchors, matching tackle spans, hanging tails,
  finite rope paths, winch entry/exit tangencies, cylinder clearance, swiveling
  jib fairlead grooves, tack mirroring, pause, physical rope UVs, camera distances,
  luffing boom/cloth and jib-sheet attachment, free-span length bounds, and
  reused rope geometry.
- Exported position/normal/UV counts and triangle indices are valid.
- Actual deck/rigging close-ups and full-boat views reviewed in the browser.
- Editable Blender scene rendered separately to verify its geometry.
- Both standalone pages rebuilt identically; JavaScript syntax and whitespace
  checks pass. Final pages are approximately 4.2 MB each.

## Limits

### Jib sheet dynamics

The jib clew now responds to wind moments, inertia and damping rather than
easing toward a fixed angle. Static trim and transient motion share the active
sheet's two-sided geometric length bounds. The existing backing/wing-on-wing
control selects the windward sheet; its prescribed trim angle determines the
windward line length. The working slider continues to measure paid-out length.

Both sheets follow the moving cloth clew every frame. Their free spans use
17 point masses under gravity and wind drag, with damping, fixed endpoints,
distance constraints and approximate coachroof/deck contact. Endpoints and
paid length take priority when contact geometry is incompatible. The released
sheet keeps its route around the mast; sheave grooves and winch wraps retain
their geometric routing. Pause freezes the clew and rope state. Changing trim
while paused updates the anchors for inspection.

These are reduced-order dynamics. The active sheet restrains clew yaw; the
released line is modeled as having available slack. Rope reactions are not
fed back into the cloth or boat force solver. Clew height, sail stretch,
knots, and full collision/contact dynamics remain unmodeled. The displayed
speed, heel and sheet-load readouts remain steady-state estimates.

### Luffing boom correction

Previously, only the cloth flapped: the boom eased toward a fixed trim angle,
and pinned foot particles could not move it. The main now has a reduced-order
yaw integrator with estimated rotational inertia, aerodynamic restoring torque,
alternating luff pressure, damping, and two-sided mainsheet length stops. Boom
and cloth use the same prescribed gust and pressure-wave functions; cloth
incidence uses the moving boom angle. The foot, blocks, rigid vang and rope
anchors follow that angle on each frame. Rope meshes are reused when their
topology stays unchanged. Pause preserves the current angle and momentum;
changing trim while paused still allows inspection of the new equilibrium.

These are approximate one-axis dynamics. The rigid vang supports boom height;
vertical bounce, flexible spar motion, and two-way cloth reaction forces are
not solved. Boom motion does not feed back into the steady-state speed/heel
estimate. The pressure waveform and inertia are estimates, not measured rig
calibration. Browser regression checks cover visible luffing swing, foot and
tackle attachment, line limits, finite cloth, rope reuse and motion pause.

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
