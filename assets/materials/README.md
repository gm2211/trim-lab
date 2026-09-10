# Marine material bakes

Original procedural materials, authored for Trim Lab with Blender 5.2.1 LTS.
No downloaded texture inputs are used by this generator.

Run from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python build-tools/bake-materials.py
python3 build.py
```

For an editable Blender project, append
`-- --save-blend /tmp/trim-materials.blend` to the Blender command. The script
retains four node materials in that project. Adjust frequency, bump distance,
and roughness ranges in the generator, then rebake. Blender is an authoring
dependency only; ordinary builds consume the committed PNGs.

Each material has a 256 × 256 tangent-space normal map and a linear grayscale
roughness map. Tile coordinates use integer periodic functions to avoid seams.
Normal maps are OpenGL +Y; Babylon applies `invertNormalMapY`. Roughness reads
from green, with alpha and metallic blue disabled. Both maps bypass sRGB.

- `gelcoat`: shallow surface texture with a smooth clear coat added at runtime.
- `sailcloth`: crossed woven fibers; seams and reinforced corners remain a separate
  full-sail albedo layer so the cloth can deform without baked lighting.
- `nonskid`: a raised diamond pattern, separate from the smooth deck moulding.
- `braid`: crossed diagonal strands; tube UVs repeat by physical line length.

The existing rope color image remains as the line's color modulation. Material
bakes are embedded as data URLs in both built HTML files. Runtime materials need
no asset server, Blender install, model loader, or external network access.

References: [Blender baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html),
[Babylon PBR materials](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/).
