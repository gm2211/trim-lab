# Blender boat and hardware

`trim-boat.blend` contains named, editable model parts and their bevel/subdivision
modifiers. It is a real geometry source, not the material-baking plane used in
the first graphics pass. `model-boat.py` rebuilds it deterministically.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python build-tools/model-boat.py
python3 build.py
```

The model contains the hull and cockpit moldings, cabin, separate nonskid panels,
winches and self-tailers, clutches, organizers, rails, foil profiles, spars,
traveler cars and grooved double blocks with shackles. Blender evaluates the
modifiers and exports positions, corner normals, metre-based UVs and indices.
Meshes are grouped by material to keep draw calls low. Articulated parts retain
separate roots. The model also includes a wooden tiller and solid vang as articulated assets.

`build.py` embeds a deterministic gzip of `meshes.json`. The app decompresses it
locally through `DecompressionStream` and creates Babylon meshes. No model loader,
CDN request or Blender install is needed to run the built page. Modern browsers
with WebGL and DecompressionStream are required.

## References and fidelity

The current model uses the user's supplied Colgate 26 photographs. Side view
(image 7) guides hull proportions, mast location and low stern; cockpit close-ups
(images 8–10) guide recessed benches, sloping companionway, aft traveler, tiller
and central mainsheet ratchet. Image 11 guides cabin-top winches and clutches.
The aerial sailing view (image 1) guides the main's long low window and sail
markings. Image 6, a blue boat with a different cabin and extensive wood trim,
is excluded. The photographs are references, not textures, and are not copied
into the repository.

Published dimensions come from [manufacturer specifications](https://www.colgate26.com/specifications/):
25 ft 8 in LOA, 8 ft 6 in beam, 4 ft 6 in standard draft.
[Manufacturer design features](https://www.colgate26.com/why-colgate-26/why-you-should-buy-a-colgate-26/)
confirm aft traveler, low transom, rigid cockpit rails, swept spreaders and solid
vang. Intermediate hull stations and equipment coordinates are estimated from
photographs, not dimensioned construction drawings. Fittings vary between boats.
This is a photo-referenced trainer model, not a surveyed CAD replica.

`RIG` in `src-app.html` is the shared anchor definition. The Blender authoring
script reads that JSON object; the export includes it and tests check equality.
The physics sheet constraint uses the average of three aft tackle spans and
the forward return span to the cockpit ratchet. The rendered rig uses those
same centers. Exact sheave friction, block articulation and contact remain
simplified. Moving the mast also updates the aerodynamic panel geometry.

Deforming sails remain owned by the cloth solver. Their albedo, seams and clear
window layers are generated at runtime; Blender supplies cloth normal/roughness
maps. Stippled deck inserts replace the earlier diamond-pattern pigment.
