# BF3 <-> USD: what a lossless round trip needs

Feasibility study. The read side is largely solved; the write side is where the work is. Findings
below were verified against the code and the cached data (860 GLBs, 1402 DDS, the MVDB dumps), not
assumed.

## Verdict

The round trip is **asymmetric**:

| direction | status |
|---|---|
| BF3 -> USD, placement + materials + textures | tractable now |
| BF3 -> USD, faithful geometry | needs exporter work in Rime, no unknowns |
| BF3 -> USD, skeletons/vehicles | needs a skeleton exporter that does not exist |
| USD -> BF3, placement / EBX / textures | works today through the existing bake path |
| USD -> BF3, new geometry | blocked: no MeshSet writer, no MVDB synthesis, no Havok MOPP |

A "universal" round trip is not reachable today. A *placement + material + texture* round trip is,
and it is genuinely useful.

## The exporter is lossier than its .glb suggests

`MeshConverter.ConvertToMeshBuilders` builds `MeshBuilder<VertexPosition, VertexTexture1>` and hard
skips the rest: LOD0 only (`if (s_LodIndex != 0) continue;`), `MeshSubsetCategory.Opaque` only,
16-bit `TriangleList` only. Confirmed empirically: every cached GLB carries attributes
`['POSITION','TEXCOORD_0']`, `skins: 0`, `images: 0`, and a RANDOM `baseColorFactor` per subset.
`vehicles_lav25_lav25_mesh.glb` — a skinned vehicle — has no skin.

Present in the source data and discarded at the vertex loop: **normals, tangents/binormal sign, UV1+
(BF3 materials literally bind `TileNormalTexCoord1`), vertex colours, BoneIndices/BoneWeights, LOD1-4,
transparent/decal/ZOnly subsets**. Level hierarchy is lost too: `ExportLevelPlacements` returns a flat
`mesh -> transforms` map and `HandleSubWorld` is a stub.

For LOSSLESS, widen it to `VertexPositionNormalTangent` + `VertexTexture2` + `VertexJoints4`, iterate
every LOD and all four subset categories, and emit one glTF primitive per subset (today each subset
becomes a separate mesh sharing a name).

## Mapping

| BF3 | USD |
|---|---|
| MeshSet LOD | `UsdGeomMesh`; LODs as a variantSet or purposes |
| MeshSubset | `UsdGeomSubset`, `familyName="materialBind"` |
| MVDB material | `UsdShadeMaterial` + `UsdPreviewSurface` (Diffuse/Normal/Specular) |
| variation hash | material variantSet; hash 0 = base |
| texture | `UsdUVTexture` — DDS is not portable, needs PNG/EXR |
| placements | `UsdGeomPointInstancer` — exact fit |
| worldpart / subworld | `UsdGeomXform` scopes (needs the hierarchy exporter) |
| skinned mesh | `UsdSkel` (needs the skeleton exporter) |

Placement data is the strong point: MP_001 has 562 distinct meshes and 6185 instances, all bases
orthogonal with no shear, so quaternion+scale decomposition is lossless.

## Import: what already works

EBX partition authoring is real and proven (`EbxWriter`, `dump_partition_json` -> edit ->
`add_json_partition`; the bake pipeline reads back correct in game). Superbundle/bundle/cas emission
works. `add_dds_texture` writes a `DxTexture` resource plus its streaming chunk — but no
`TextureAsset` EBX, which you author yourself.

## Import: what blocks geometry

- `RelocPtr.Serialize` throws `NotImplementedException`; `RelocArray.Serialize` writes only
  count+address. `MeshSetLayout.Serialize` writes stale addresses and has no callers.
- `RimeLib.Mesh/Generation/` does not exist (the texture equivalent does).
- `mesh_variation_db_add_entry` can only SLICE an existing MVDB; it cannot synthesize an entry for a
  new mesh, so new geometry has no material binding and renders invisible.
- Havok collision needs MOPP compilation, a Havok SDK feature.

Importing new geometry therefore means writing a Frostbite-2 MeshSet/MeshLayout serializer with real
reloc and string tables, a vertex/index chunk packer, an `add_gltf_mesh` command, and an MVDB entry
synthesizer — and collision still would not be solved. Do not plan around it.

## Vehicles

A vehicle is a graph, not an asset: a `VehicleBlueprint` partition whose primary instance is
`VehicleEntityData` with components (chassis, wheels, config, health zones, entry points, sounds,
HUD), and several separate MeshSets assembled at runtime (body, `_track_mesh`, `_wreck_mesh`,
`kits/..._antennas_mesh`). USD can carry the meshes, materials, part hierarchy and (once exported)
the skeleton. It cannot carry the component/entity/physics data — that must travel as EBX JSON
ALONGSIDE the USD, never inside it. See docs/vehicle-edit-crash.md: a blueprint's identity is its
partition, so a runtime clone is the primary instance of nothing.

## Tooling, verified on this machine

`usd-core` 26.8 installs from pip (cp314 wheel, ~220 MB) and `UsdGeom.PointInstancer`,
`UsdGeom.Subset`, `UsdShade.Material` and `UsdSkel.Skeleton` all define cleanly. `pxr` is not
otherwise present and no rpm-ostree layering is needed. Blender is not installed; `org.blender.Blender`
5.2 is on the flathub user remote and has full USD IO — use it as a viewer, author with usd-core.

## Phases

1. **One static mesh + textures -> USD -> Blender.** No blockers; all inputs are on disk. Extend
   `dds_convert.py` beyond BC5 normals so colour maps convert too. Accept flat shading and one UV.
2. **Full level stage** — placements to a `PointInstancer` per prototype. Blocked on a
   `dump_level_hierarchy` command, since the current export is flat.
3. **Faithful geometry** — widen `MeshConverter` as above. C# work, no unknowns.
4. **Skeletons / UsdSkel** — needs a `SkeletonAsset` exporter plus subset bone-index mapping.
5. **USD -> BF3, placement only** — edit transforms in a DCC, write back through the proven
   `add_json_partition` bake path. The only import direction that works today.
6. **USD -> BF3, new geometry** — blocked, see above.
