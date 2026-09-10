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
separate roots. Current export: 62,513 triangles across six asset groups.

`build.py` embeds a deterministic gzip of `meshes.json`. The app decompresses it
locally through `DecompressionStream` and creates Babylon meshes. No model loader,
CDN request or Blender install is needed to run the built page. Modern browsers
with WebGL and DecompressionStream are required.

The boat preserves the existing trainer's attachment locations and sail geometry.
It is an illustrative Colgate-style training model, not a dimension-verified CAD
replica. In particular, this pass does not relocate the existing mid-boom
mainsheet/traveler equilibrium anchors. Deforming sail meshes remain owned by the
cloth solver; their stitched albedo and transparent window layers are generated
at runtime. Blender supplies the underlying cloth normal/roughness maps.

Reference: the manufacturer's [sail-away equipment list](https://www.colgate26.com/price-packages/sail-away-package/)
identifies molded nonskid and 4:1 mainsheet tackle. Asset shapes are original;
no third-party models or texture images were downloaded for this pass.
