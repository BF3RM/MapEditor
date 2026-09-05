# Porting de_dust2 into BF3

Feasibility study, follow-on to `docs/usd-roundtrip.md`. That document named three blockers on the
import side (no MeshSet writer, no MVDB synthesis, no Havok MOPP). This one tests each against the
actual data and tooling, and finds **one of them is materially smaller than stated**.

Everything below is either **VERIFIED** (a command run on this machine, a file read, bytes parsed)
or explicitly labelled inferred/unverified. The bar is the usual one: no guesses presented as fact.

---

## Status, 2026-09-03

Superseded in two places by work that has since been done, and both matter:

- **The MeshSet writer exists and the engine loads its output.** See `docs/usd-roundtrip.md` §0.
  The "needs a MeshSet writer" blocker below is resolved.
- **CS:S, not CS2.** The recommendation below was CS2 on extraction quality. That was the wrong
  call in practice: CS2 is not installed and needs ~30 GB, while a stock CS:S `de_dust2.bsp` is a
  direct download. Obtainability beat fidelity. What was extracted, and what it cost, is in
  §S below.

## Status, 2026-09-03 (second pass): dust2 is its own object now

The build described in §R below -- writing dust2's geometry over `objects/loadingpallet_01`'s mesh
resource -- is **withdrawn**. It was wrong for a reason worth stating plainly: MP_001 places that
pallet ten times, at whatever angle each one leans, and a MeshVariationDatabase entry binds
materials BY NAME, so the result was dust2 drawn ten times, tipped on its side, every surface
wearing one BF3 wood-pallet material. Nothing about that was a port.

What exists now is a **separate object**: `dust2/dust2`, its own MeshSet with 91 subsets, its own 91
MeshMaterials, its own MeshVariationDatabase, 86 of its own textures ported out of Counter-Strike:
Source, and a sub-level that places it **once, at the identity, at 0,0,0**. No shipped resource,
partition or blueprint is overwritten. Section §T records what was built and, honestly, what is and
is not demonstrated to work.

## S. de_dust2, actually extracted

**VERIFIED.** Stock CS:S `de_dust2.bsp`, VBSP **version 19**, map revision 4044, 11.5 MB, pulled as
a single member out of an archive.org zip so no 2.4 GB download was needed. Parsed with a
from-scratch Python reader (`/tmp/dust2/bsp2mesh.py`), no Blender and no Java.

| | |
|---|---|
| drawn triangles | **20,785** (12,091 verts, 20,121 UVs) |
| of which displacement surfaces | 7,712 tris from 67 patches — a third of the map, and non-optional: they *are* dust2's sloped sand |
| distinct materials | 91 |
| extent | **135.74 x 132.40 x 20.52 m**, matching `worldspawn`'s `world_mins/maxs` to the unit |
| static props | **321 instances / 53 `.mdl` files — NOT included**; a BSP-only port is bare walls and floors |

Two traps worth recording. The first file that came back claiming to be dust2 was a community
CS:GO -> CS:S port, caught by a plane-equation check: 523 faces had vertices blown out to +/-65000
units. And a 3D skybox sits 5,000 units from the origin, so the bounding box reads 339 m until it is
split out.

Scale needs no correction anywhere: Source is 0.0254 m/unit, BF3 is metric, and the converter
applies it. Axes do: Source is Z-up, BF3 is Y-up, so `(x, y, z) -> (x, z, -y)`.

## R. Getting dust2 geometry into BF3 — the actual chain

The route taken deliberately avoids the two things that are still unbuilt (MeshVariationDatabase
synthesis, and a MeshAsset EBX authored from nothing): **keep a stock prop's EBX, its MVDB entry and
its blueprint, and swap only the geometry underneath.** `objects/loadingpallet_01/loadingpallet_01`
is the donor.

That choice sets three constraints, and they are the reason the result looks how it looks:

- the vertex declaration must stay byte-identical to the donor's, because the donor's **compiled
  shader** reads it. Position is `Half3`, so at dust2's 68 m extent coordinates quantise to about
  **6 cm**.
- subset material names must match the donor's (`lambert2`, `""`), or the MVDB entry binds nothing
  and the mesh renders invisible. So the whole map wears **one BF3 wood-pallet material**.
- 16-bit indices cap a subset at 65535 vertices. dust2 unwelded is **62,355** — it fits in one
  subset with 3,181 to spare. Adding props will not fit; that needs one subset per material, which
  is also what per-material textures would need.

```bash
# 1. BSP -> OBJ (metres, Source axes)
python3 /tmp/dust2/bsp2mesh.py /tmp/dust2/de_dust2.bsp /tmp/dust2/de_dust2.obj

# 2. OBJ -> BF3 MeshSet + geometry chunk, translated so bombsite B's floor is at the local origin
tools/usd/obj_to_meshset.py /tmp/dust2/de_dust2.obj \
    /tmp/meshprobe/pallet.meshset /tmp/dust2/dust2.meshset /tmp/dust2/dust2.chunk 40,0,67
#    -> prints META_HEX, needed by add_resource below

# 3. superbundle: donor closure, then our geometry over the top
#    (needs tools/usd/rime-add-resource-meta.patch applied to Rime)
mount_game "…/Battlefield 3" Frostbite2_0 true
build_sb Win32/UsdRoundTrip/Scaled Frostbite2_0 "…/Admin/Mods/UsdRoundTrip/sb"
build_bundle Win32/UsdRoundTrip/ScaledB
reference_existing_partition objects/loadingpallet_01/loadingpallet_01 1
add_resource objects/loadingpallet_01/loadingpallet_01_mesh MeshSet "/tmp/dust2/dust2.meshset" <META_HEX>
add_chunk b0830bff-151b-a71f-5913-53b8e81ed51f objects/loadingpallet_01/loadingpallet_01_mesh "/tmp/dust2/dust2.chunk"
build
build

# 4. enable Admin/Mods/UsdRoundTrip in Admin/ModList.txt, then
./.powos-e2e-run.sh usd_mesh_e2e.py
```

`Admin/Mods/UsdRoundTrip/ext/Shared/__init__.lua` mounts the superbundle, prepends its bundle so our
copy of the resource wins, and spawns the donor blueprint at the local player's feet — which, because
of the translate in step 2, puts bombsite B where the player is standing.

## R2. Where the dust2 port actually stands — NOT rendering yet

**Honest status: dust2 is built into a valid BF3 MeshSet, the bundle builds, and the client does not
finish loading the level with it. There is no in-game screenshot of dust2, and none should be
implied.**

What is confirmed working:

- the geometry converts, at 1:1 scale (`135.74 x 132.40 x 20.52 m`), into a MeshSet + chunk that
  `tools/usd/meshset.py` re-parses cleanly, with correct 16-byte meta;
- `add_resource … <META_HEX>` writes that meta into the bundle (verified byte-for-byte, §6 of
  `docs/usd-roundtrip.md`);
- the superbundle builds and mounts, and the bundle prepend is confirmed in the server log;
- the same machinery, with a *round-tripped pallet* instead of dust2, renders in game and returns
  the predicted AABB. So the pipeline is sound; something about this specific mesh is not.

The failure, precisely: the server reaches `Level:Loaded` and spawns, the player connects, and the
**client never reaches `Level:Loaded`** — the process stays alive but the level never finishes. No
crash, no log line. Tested with the donor's LOD count both reduced to 1 and restored to 2; the
restore did not fix it, so the LOD-count mismatch hypothesis is **disproved**.

**RESOLVED 2026-09-03: it was the subset indexing.** Prediction registered before the run: drop the
ZOnly subset so one subset owns the index block, and the client will reach `Level:Loaded`. It did —
`USDRT CLIENT level loaded` appears for the first time with a 20,785-triangle dust2 mesh bound to
`objects/loadingpallet_01/loadingpallet_01_mesh`. So **two subsets sharing one index block is
invalid**: `StartIndex` is not a free offset into a shared block the way the donor's layout suggests.
Emit one subset per index block.

**Still failing after that:** the client reaches `Level:Loaded` but the deliberate *spawn* 14 s later
never reports. The level itself loads, which is the meaningful half — the engine accepted the mesh —
but building an entity from that blueprint does not complete. Next candidates: the donor's Havok hull
(a 0.8 m pallet) against a 135 m render mesh, and the LOD cull distances in the donor's MeshAsset.

Superseded hypotheses, kept because they were disproved rather than abandoned:

1. **Subset vertex indexing.** CONFIRMED as the level-load hang, see above. Both subsets share one index block with `StartIndex` 0 and 62355.
   If Frostbite treats indices as absolute into the LOD's whole vertex block rather than relative to
   `VertexOffset`, subset 1 addresses vertices that do not exist. The donor mesh cannot distinguish
   these two readings — its `VertexOffset`/`StartIndex` are consistent with both. **This is the most
   likely bug and the cheapest to test**: emit a single-subset mesh and drop the ZOnly subset.
2. **Size.** A 3.2 MB chunk on a prop the level streams as ordinary static geometry, against 18 KB
   stock. Test with a decimated dust2 (~2000 triangles).
3. **Half3 position range.** Coordinates to +/-98 m in a format the donor only ever saw at +/-0.8 m.
4. **The donor is the wrong host.** A prop instanced 10x across the level, now 20785 triangles each.

## C. The client crash was the TEXTURES, not the mesh

**Root-caused 2026-09-03.** Every "client alive but never reaches `Level:Loaded`" was a **modal
DirectX dialog** blocking the client, only visible once the desktop was unlocked:

```
DirectX function "device->CreateTexture2D( &texDesc,
  desc.subResourceCount != 0 ? reinterpret_cast<const D3D11_SUBRESOURCE_DATA*>(desc.subResourceData)
  : 0, &texture->m_texture2d)" failed with E_INVALIDARG
GPU: "NVIDIA GeForce RTX 5090", Driver: 61043
```

**VRAM was ruled out**, not assumed: `nvidia-smi` reported 4608 MiB used of 32607, **27521 MiB free**,
with the client itself at 862 MiB. `E_INVALIDARG` rather than `E_OUTOFMEMORY` fits that — a malformed
texture *descriptor*, not a failed allocation.

The cause is `reference_existing_partition`: pulling the donor's closure also pulls its `DxTexture`
resources (`loadingpallet_01_d`, `_n`) and rewrites them into the new bundle, and the rebuilt DDS is
rejected by D3D. **Nothing about the mesh was involved.**

The fix is to stop pulling the closure. A bundle containing **only** the MeshSet resource and its two
chunks (953 KB, no partitions at all) boots the client with no dialog — everything else resolves from
MP_001's own bundle, which already contains this blueprint, its EBX and its textures.

> This also puts a caveat on `docs/usd-roundtrip.md` §7: `reference_existing_partition` builds a
> superbundle successfully, but its rewritten DxTextures are not necessarily loadable. That was never
> checked in game before now. Prefer the minimal bundle when shadowing a single resource.

### C1b. Excluding the DDS is NOT a fix — the texture path is the real blocker

Correcting my own framing. Dropping the donor's textures unblocks *this* demo only because we are
borrowing a BF3 prop's material. **dust2 has 91 of its own textures, and none can reach BF3 until
writing a DxTexture into a bundle produces something D3D accepts.** Excluding is a diagnostic, not a
solution.

The error names the mechanism:

```
device->CreateTexture2D( &texDesc,
    desc.subResourceCount != 0 ? ...(desc.subResourceData) : 0, ...) failed with E_INVALIDARG
```

`subResourceCount` / `subResourceData` **is the mip chain**. A DxTexture's mips live in a chunk, and
the chunk's `ChunkMetaEntry` (`h32`, `firstMip`) is what tells the engine how to slice them into
subresources. Get that wrong and you build a malformed subresource array — exactly this error, and
not an allocation failure, which is why `E_INVALIDARG` and not `E_OUTOFMEMORY`.

Rime's own builder flags this as unfinished, in
`RimeLib.Content.Frostbite2_0/Building/CasBundleManifestBuilder.cs:355-366`:

> *"1. Investigate why ChunkMeta != ChunkEntries for our built bundles, for whatever reason the above
> code in TryGetMeta returns null for certain chunks, that when loading should exist from retail bf3
> bundles"*

and at `:342` it already knows the stakes — *"A texture chunk left with h32=0 loses its association
with the …"*. So the texture failure is a **known-incomplete chunk-meta path**, not a mystery.

**This is the next real blocker for a textured port**, and it is bounded in the same way the MeshSet
relocation table was: preserve `ChunkMetaEntry` (`h32`, `firstMip`) when copying or generating a
texture chunk. Until then, ported geometry can only wear materials that already ship with BF3.

### C2. The minimal bundle trades one failure for another

Removing the closure **did** kill the DirectX dialog — the client boots to the VU main menu with the
dust2 MeshSet bundled, which the full-closure build never managed. But it does not get further: the
harness clicks the soldier, joins, and then gives up after 180 s with `mapeditor target=False,
at login=False`. No `USDRT CLIENT` line ever appears, and the client window disappears while its
processes stay resident.

Set against the earlier run where the **full closure + single-subset mesh** did reach
`USDRT CLIENT level loaded`, the evidence points away from the mesh and at the bundle shape: a bundle
carrying **zero EBX partitions** is the new variable, and prepending it to the level's load list is
the likely breakage.

**Next step, and it is a small one:** keep `reference_existing_partition` — so the bundle has real
partitions — but exclude the textures with its `SkipPrefixes` argument, so no `DxTexture` is rewritten.
That is the one configuration not yet tried, and it is the intersection of the two runs that each got
further than the other.

No in-game screenshot of dust2 exists, and none should be implied.

The capture method is settled and works: `spectacle -b -n -f -o out.png` returns a real 12544x4096
composited Wayland capture. `ffmpeg -f x11grab` is a trap here — it writes a valid, entirely black
PNG, because XWayland's root window holds no composited content.

What blocks the photo is not the capture tool: **the VU client presents no window this session can
see.** `xdotool search --name "."` lists only XWayland plumbing (video bridge, Qt selection owners,
xsettingsd) — no Battlefield window. The session is not locked (`LockedHint=no`), yet every capture
returns the desktop. So the client renders somewhere this session cannot address, and framing a shot
on the 3D view is unsolved. That is the open item, ahead of any collision work.

## Verdict

| goal | status |
|---|---|
| dust2 out of CS2 as glTF + textures + collision | **solved** — one Linux binary, verified running here |
| dust2 in the MapEditor's **browser** renderer | **hours of work**, no blockers |
| dust2 in-engine as **kit-bashed BF3 props** | tractable; the Rime command for it already exists, untested |
| dust2 in-engine as its **own geometry**, rendering | needs a MeshSet writer — now bounded, see §3.1 |
| dust2 in-engine **walkable** with correct collision | blocked on Havok MOPP; workaround in §3.3 |

The honest one-line answer to *"we cracked the BC2 formats, how hard can it be"*: the **read** side of
every format involved is genuinely cracked, on both ends. The **write** side of Frostbite geometry is
not, and it is the whole job. But it is now a ~2000-line engineering task with one small RE question
left, not the open-ended reverse-engineering project the previous doc implied.

---

## 1. Source side: CS2, not CS:GO

**VERIFIED on this machine.** ValveResourceFormat's `Source2Viewer-CLI` 20.0 is a self-contained
native ELF, no .NET runtime needed:

```
$ /tmp/s2vcli/Source2Viewer-CLI --version
Version: 20.0.6980+a06886f7d06049052d32a7381ec05523064a2ca0
OS: Bazzite (X64)
```

MIT licensed, https://github.com/ValveResourceFormat/ValveResourceFormat, last push 2026-09-01.
Release 20.0 ships `cli-linux-x64.zip`. The GUI is WinForms/Windows-only; the CLI is not.

**Why CS2 and not CS:GO.** Read out of the exporter source, not the docs:

- `IO/Gltf/GltfModelExporter.cs` `ExportToFile(..., VWorld)` walks **every world node**
  (`worldNode.SceneObjects` *and* `AggregateSceneObjects`, i.e. the instanced clutter) **and every
  entity lump**, so brushwork, static props and entity-placed models all land in one correctly
  transformed scene.
- It then calls `ExportPhysicsIfAny()`, which writes a companion `<name>_physics.gltf` from the
  Rubikon shapes — hulls triangulated via `TriangulateHull`, mesh shapes straight out, **grouped
  into separate glTF meshes by (CollisionAttributeIndex, SurfacePropertyIndex)** and named after the
  resolved surface property. Collision arrives pre-sorted into concrete/metal/sand/player-clip
  groups, in the same coordinate space as the render mesh.
- `GltfModelExporter.Conversion.cs`: `private const float SourceToGltfScale = 0.0254f`. **Output is
  already in metres.** Since 20.0 it is baked into vertices, not a root node.
- Lightmap UVs *are* exported — `GltfModelExporter.Mesh.cs` resolves the lightmap UV channel via the
  material's D3D input signature and pre-multiplies `m_vLightmapUvScale`. 20.0's changelog includes
  "Fixed misaligned lightmaps in glTF map exports", so **do not use < 20.0**.

The Source 1 route (steamcmd app 740 → `de_dust2.bsp` → bspsrc → `.vmf` → Blender + Plumber) works on
Linux and both tools are maintained, but it is a lossy CSG reconstruction, has no physics export, and
needs Blender in the loop. Use it only if the CS:GO-era layout is specifically wanted.

### The pipeline

```bash
# 1. map files — CS2 is NOT installed here (VERIFIED: no Counter-Strike in
#    ~/.local/share/Steam/steamapps, checked appmanifest names). ~30-60 GB.
steamcmd +force_install_dir ~/cs2 +login anonymous +app_update 730 validate +quit
#    -> ~/cs2/game/csgo/maps/de_dust2.vpk        (anonymous login for 730: UNVERIFIED)

# 2. export
S2V=/tmp/s2vcli/Source2Viewer-CLI
$S2V -i ~/cs2/game/csgo/maps/de_dust2.vpk -o ./dust2 -d \
     --gltf_export_format gltf --gltf_export_materials --gltf_textures_adapt --threads 8
#    -> de_dust2.gltf + .bin + hundreds of PNGs
#    -> de_dust2_physics.gltf                    (collision, written automatically)
```

`gltf`, not `glb` — GLB has a hard 2 GB cap and dust2 will exceed it. Skip anything named `_vanity`
(main-menu backdrop builds). Run the result through `gltfpack` before doing anything heavy with it.

**Expected size is an estimate, not a measurement** (no CS2 install here to measure): ~2-5M triangles
for the render mesh once `AggregateSceneObjects` instancing is expanded to real geometry, 150-400
materials, 400-900 PNGs, several GB on disk; physics mesh ~20-100k triangles in 10-30 groups.

### Scale — it fits, with room to spare

**VERIFIED** from the CS:GO radar overview (`pos_x -2400`, `pos_y 3383`, `scale 4.4`, 1024 px):
the radar footprint is 1024 × 4.4 = 4505.6 units = **114 m square**. Playable area ~95-105 m
(derived, approximate). CS2's values are within a few units of these.

**VERIFIED** that BF3 world units are metres, from this repo: `WebUI/.../Terrain.ts:19` measures a
terrain as 66,584,576 of 67,108,864 m² (= 8192 m square); `TerrainMaterial.ts` uses
`TextureSamplesPerMeterMax`; `GameObjectManager.lua:1477` says "in metres… ~10m" for a vehicle.

**VERIFIED** MP_001's own extent, from `.mesh-cache/MP_001.placements.json` (562 meshes, 6185
instances): X −313…285, Y −1.8…174, Z −330…492 — roughly 600 × 820 m including backdrops.

So Source → BF3 is a straight ×0.0254 that VRF has already applied. dust2 is ~1/6 of MP_001's
footprint. The risk is the opposite of the usual one: it will look lost, and BF3 soldier movement is
tuned for larger spaces, so a geometrically faithful dust2 may play smaller than it feels in CS.

---

## 2. What the browser renderer can do today

The standalone editor (`docs/standalone-editor.md`) is a full three.js scene with **`GLTFLoader`
already bundled** and a public loader method on a `window`-exposed object.

**VERIFIED** in `WebUI/src/script/modules/MeshManager.ts`: `public async source(file)` (L742) wraps
`private original(file)` (L784), which does `this.loader.load(this.base + '/' + file, …)` with
`base = '/meshes'`. `WebUI/vue.config.js` proxies `/meshes` → `127.0.0.1:8091`, and `mesh_server.py`
**static-serves any file that already exists in `.mesh-cache/`** before it considers invoking Rime.

So dropping `dust2.glb` into `.mesh-cache/` makes it fetchable with no code change at all:

```js
const o = await window.meshes.source('dust2.glb');
o.updateMatrixWorld(true);                    // scene.matrixAutoUpdate is false (THREEManager.ts:258)
window.editor.threeManager.scene.add(o);
window.editor.threeManager.setPendingRender();
```

Two things must be handled for it to look right, both small:

- **`original()` unconditionally overwrites every material** with the neutral grey
  `this.material` (L795-814) — because Rime's exporter assigns each subset a *random* colour and a
  raw BF3 GLB renders as neon confetti. An external GLB with real materials needs that stomp gated,
  e.g. `if (this.meshKeys.has(file)) child.material = this.material;`.
- **`MeshManager.VOLUME`** (L75) hides submeshes matching `/…_collision|invisiblecollision|occluder…/i`
  in `instance()` (L769). A CS export with `_collision` in node names would silently vanish.

Capacity is not a concern: **VERIFIED** by parsing every cached GLB, all 860 unique BF3 meshes
together are 1.29M triangles, and MP_001 renders 4414 placements as 638 InstancedMeshes.

USD in the browser is not worth it — convert USD→GLB offline (Blender) and use the GLB path.

---

## 3. The three blockers, re-examined

### 3.1 MeshSet writer — the relocation format is NOT unknown

`docs/usd-roundtrip.md` treated the relocation table as the schedule risk ("format unknown, needs RE",
"the one piece with zero prior art"). **It is now decoded and verified.**

Method: dumped four real MeshSet resources straight out of the game with Rime's `dump_resource`
(`RimeREPL` under a PTY, `mount_game` + `select_game 1` in the commands file — this works, contrary to
the caveat in `mesh_server.py`), then parsed the bytes.

```
lav25.meshset    len=40544  type=2 flags=0x21 lods=5 subsets=51  reloc entries=164
pallet.meshset   len= 1344  type=0 flags=0x01 lods=2 subsets=4   reloc entries=24
res05.meshset    len= 5008  type=2 flags=0x01 lods=1 subsets=5   reloc entries=24
roof.meshset     len= 4680  type=2 flags=0x01 lods=2 subsets=6   reloc entries=38
```

**The tail of every MeshSet payload is a flat `uint32[]` of the byte offsets of its 64-bit pointer
slots.** Nothing else. For `pallet.meshset` all 24 entries account for exactly:

```
   48,  56   MeshSetLayout.Lods[0..1]
   88,  96   MeshSetLayout.Name, ShortName
  120 …168   MeshLayout[0].Subsets.ptr + CategorySubsetIndices[0..3].ptr
  224 …240   MeshLayout[0].EmbeddedEdgeData, ShaderDebugName, Name
  280 …400   the same eight slots for MeshLayout[1]
  440, 588, 744, 892   the four MeshSubset.MaterialName pointers
```

2 + 2 + 8×2 + 4 = 24. Exact. Corroborating detail that rules out coincidence: `res05.meshset` has
`LodCount = 1`, and slot 48 (`Lods[0]`) **is** in its table while slot 56 (`Lods[1]`, null) **is
not** — null pointers are not relocated. Independently confirmed: `MeshSetLayout` is 112 bytes
(LOD 0 begins at 0x70) and `MeshLayout` is 160 bytes (0x70 → 0x110), matching Rime's field lists.

What this changes: writing a MeshSet is **layout + bookkeeping**, not reverse engineering. Emit the
structs, emit strings/arrays, record each pointer slot's offset as you write it, append the table.

**The one remaining unknown** is how the loader learns the table's length. It is not a word before
the table (that is 0x00000000 in all four samples). The prime candidate is the **16-byte per-resource
meta** in the bundle manifest, which Rime already parses
(`RimeLib.Content.Frostbite2_0/Frostbite/Bundles/BundleManifest.cs:453` reads 16 bytes;
`BundleManifestBuilder` writes it back). Answering this needs a read-only dump of that meta for a
MeshSet — a small addition to Rime, not an investigation. Note `cap_texture` passes `new byte[16]`
of zeros for a DxTexture and that works, so meta is not universally load-bearing.

Everything else the previous doc said about the write side still holds and was re-verified:
`RelocPtr.Serialize` and `RelocArray.Serialize(out byte[])` throw `NotImplementedException`;
`RelocArray.Serialize(RimeWriter)` writes only count + an address it never computed;
`MeshSetLayout.Serialize` writes `s_Lod.BaseAddress` values that nothing ever sets; **nothing in the
repo calls any of the three**; `RelocPtr<T>.Object` is get-only so you cannot even point one at a new
object; there is no allocator or two-pass layout anywhere; and the vertex-format switches are
unpack-only (`MeshConverter.cs:250-305` throws on unknown formats and never encodes). Rime's index
reader is hardcoded to 16-bit `TriangleList`, so subsets must stay under 64k vertices.

Revised scope, ~2000-2500 lines over ~12 files: allocator + fixup pass (~350), emit the table (~150,
now bounded), drive layout from the four existing `Serialize(RimeWriter)` bodies (~250), a vertex
packer including the packed 10/10/10 formats (~600), glTF → subsets/LODs/categories/AABB (~500),
`IMeshGenerator` + `add_gltf_mesh` mirroring the 305-line texture path (~150), MeshAsset/MeshMaterial
EBX synthesis (~200, machinery exists), MVDB synthesis (~150, machinery exists).

**Cheapest de-risking step, before writing any of it:** read an existing MeshSet, re-serialize it,
byte-compare against the original. That exercises the allocator and the table against ground truth
with none of the glTF work.

### 3.2 MVDB synthesis — smaller than it sounds

**The MVDB is an EBX partition, not a binary resource**, so the existing `EbxWriter` already covers
it. `RimeLib.Serialization.Frostbite2_0/fb/MeshVariationDatabaseEntry.cs` has exactly three fields:
`CtrRef<MeshAsset> Mesh`, `uint VariationAssetNameHash`, `List<MeshVariationDatabaseMaterial>
Materials`; each material is `CtrRef<MeshMaterial>` + `CtrRef<MeshMaterialVariation>` +
`List<TextureShaderParameter>`. The cached dumps show the same shape —
`.mesh-cache/MP_001.mp_001.mvdb.json` is `mesh → variationHash → [{$material, Diffuse, Normal,
Specular}]`, and hash `0` is the base appearance.

A minimum entry for a new mesh is therefore: a ref to your `MeshAsset`, `VariationAssetNameHash = 0`,
and one material per subset. This is **plumbing** — "build an entry" instead of today's "copy an
entry" (`MeshVariationDbAddEntryCommand.cs`) — not reverse engineering. It is genuinely mandatory:
that file's own comment states an entry missing for a hash "leaves the mesh invisible", and in
shipped BF3 data the MVDB is the *only* place a mesh→texture binding exists.

### 3.3 Collision — not required to render, required to walk

**Rendering does not need Havok.** Three independent confirmations:

1. `RigidMeshEntityData` and `MeshProxyEntityData` inherit `SpatialEntityData` and have no physics in
   their chain. On MP_001 all 381 `MeshEntityType` refs resolve to 298 `RigidMeshEntityData` +
   83 `CompositeMeshEntityData` (`docs/nohavok-subworlds.md` §5, VERIFIED there).
2. `docs/nohavok-subworlds.md` §8, observed at runtime: editing `InstanceTransforms` moves the
   **visual** instance and **leaves its collision behind** — rendering and collision are separately
   sourced.
3. `ext/Shared/Patches/DynamicModelPatcher.lua` converts `DynamicModelEntityData` →
   `StaticModelEntityData` and deliberately does not copy `physicsData`; the result renders.

Note the mod name is misleading in the other direction: NoHavok does **not** demonstrate a
collisionless level. `docs/nohavok-subworlds.md` §5 is explicit that its 3646 RODs each instantiate a
full blueprint *including its own physics*, and `GetValidScales` **drops instances whose scale has no
shipped collision hull** rather than generating one. That is the sharpest evidence that BF3 cannot
make collision it was not shipped: an upstream commit exists titled "fix the addition of assets that
don't have any valid scale, resulting in crashes on some maps."

So for new geometry: **a look-at-it port is unblocked; a walk-on-it port is not.** MOPP compilation is
a Havok SDK feature. Rime reads Havok partially — `RimeLib.Havok.Frostbite2_0/HavokPhysicsData.cs`
parses the wrapper and both fixup tables, but `RimeLib.Havok/` decodes only transforms
(`hkpExtendedMeshShape.Deserialize` reads `byte[200]` as an opaque blob;
`hkExtendedMeshHeader` is 30 fields named `U1`..`U21`) and `IHavokConverter` exposes exactly one
method, `GetTransforms`. The only Havok write in the repo is `raise_water_physics`, a surgical
in-place float patch whose own comment explains why it is the only feasible move: *"The MOPP tree is
relative, so it needs no recompile."*

Workarounds that give a walkable floor without a MOPP compiler, in increasing fidelity:
place invisible BF3 collision volumes (the game ships `invis*` collision blueprints — the official
`no-invisible-collision` sample filters blueprints by name containing `"invis"`) along the physics
groups VRF exported; or kit-bash the floor/wall planes out of BF3 props that already carry hulls
(§4.2). Both are placement problems, which is the part of the pipeline that already works.

---

## 4. The cheap paths

### 4.1 Browser viewer — cheapest thing that shows dust2

Covered in §2. Nothing new is needed except an entry point: `VEXTemulator.UIReloaded()`
(`WebUI/src/script/modules/VEXTemulator.ts:428`) unconditionally starts `LoadWebXLevel()`, which
fetches a 7.2 MB guid dictionary from `webx.powback.com` and throws without it. A `?glb=dust2.glb`
branch that skips WebX, `LevelLoader`, `StaticModels`, `Terrain`, `RoadRibbons` and `Lighting`, and
just adds the scene, is the whole feature. `StandaloneUI.frameLevel()` averages `editor.gameObjects`,
so a viewer wants a `Box3.setFromObject` variant instead.

### 4.2 Kit-bashing — and a Rime command nobody here has used yet

The idea: rebuild dust2's massing out of BF3's own walls, crates, doorways and ramps, placed through
the bake path that already works. Everything about it is proven except one link, and that link
already has a purpose-built command.

**What already works.** The bake pipeline (`docs/bake-pipeline.md`, verified end-to-end 2026-08-19)
turns a MapEditor save into `ReferenceObjectData`s in a custom superbundle via
`build_sb` / `build_bundle` / `add_json_partition`. MapEditor already ships its own superbundle
(`mod.json`: `Win32/mapeditor/shells`), and `ext/Shared/Modules/ShellPool.lua:80-130` is a working
mount pattern: `ResourceManager:MountSuperBundle(...)` on `Level:LoadResources`, then a
`ResourceManager:LoadBundles` hook at priority 100 that **prepends** the mod's bundle to the level's
list. Kit-bashed props keep their shipped collision for free, because a ROD instantiates the full
`ObjectBlueprint` (`docs/nohavok-subworlds.md` §5) — **at a shipped scale only.**

**What is missing.** The editor's spawn catalogue is built from partitions that happen to be loaded:
`InstanceParser` (`ext/Shared/Modules/InstanceParser.lua:156-168`) records every `Blueprint` it sees
on `Partition:Loaded`. Cross-level mounting is stubbed out —
`ext/Shared/EditorCommon.lua:16-24` is entirely commented out, with a `-- Bundles doesnt exit yet`
TODO. So today you can only place assets the current level already loads.

**The missing link exists in Rime and is unused here.**
`RimeLib.Cmd/Commands/BundleBuilding/ReferenceExistingPartitionCommand.cs` (642 lines,
`reference_existing_partition`) — *"Adds one existing partition and everything the game reaches for
once it loads"* — walks a three-layer closure: EBX instance fields, **chunk guids read out of a
resource payload (MeshSet LODs, DxTexture mips)**, and resource names read out of payloads. Its
MeshSet branch (L502-533) parses `MeshSetLayout`, checks the streaming flag, and enqueues
`DataChunkId` for **every** LOD, with a comment explaining that a missing non-base chunk fails at
stream-in rather than at level load. Paired with `mesh_variation_db_add_entry` (which copies an
existing entry, and whose comment notes the mesh/material/texture partitions must land in the same
bundle — exactly what the closure walker provides), **this is a supported path to pull any BF3 asset
from any level into a custom superbundle.**

Verified caveats: **it is exercised by nothing** — grep finds it referenced only by itself and its
context registration, no tests, no docs, no use in `LevelLoaderGen` or `NoHavokGen`. Its commit,
`b3145da` "Start improving creation of existing asset reference bundles" (2026-08-02), is on this
tree's `development` branch. Whether the closure picks up `HavokPhysicsData` resources is
**unverified** — the payload-chunk sweep handles only DxTexture and MeshSet, so a blueprint's
collision would have to arrive via the layer-1 name sweep.

Since `InstanceParser` catalogues anything that loads, assets pulled this way should appear in the
editor's spawn list on any map. That is the highest-leverage single experiment in this document.

### 4.3 Runtime triangles — DebugRenderer, for shape only

There is **no** VEXT API to create a mesh at runtime. `MeshAsset`'s entire property list is metadata
(`lodGroup`, `materials`, `nameHash`, …); `MeshSetLayout`/`MeshSubset`/`VertexBuffer` do not exist in
the VEXT type set, because VEXT exposes EBX *partitions* and geometry lives in resources and chunks.
`ResourceManager` has `MountSuperBundle` / `BeginLoadData` / instance-load handlers and **no**
`AddResource` or chunk registration — every binary payload must be baked offline.

What does exist is immediate-mode debug drawing, and it is more capable than this repo uses:
`DebugRenderer:DrawVertices(DebugGeometryType.Triangle3d, DebugVertex[])` submits a batched triangle
soup with per-vertex colour. `DebugVertex` is constructible and carries **position and colour only —
no normal, no UV**. Draws must be issued from `UI:DrawHud` and re-submitted every frame; client-only,
unlit, untextured, no collision.

**VERIFIED locally:** `ext/Client/NativeViewport.lua` (701 lines) draws the entire in-game editor
overlay this way, but uses only `DrawLine`, `DrawOBB` and `DrawSphere` — MapEditor has never drawn a
filled surface. The only local precedent for filled geometry is
`Admin/Mods/Wave_System/ext/Client/ShoreBrush.lua:231-232`, two `DrawTriangle` calls per cell with
`RENDER_CAP = 3000` cells — ~6000 triangles/frame as a shipped, tuned figure. That is the realistic
budget: **enough to show dust2's massing in-engine, nowhere near enough to render it.**

Also worth knowing (newer than the existing docs): `TerrainEditing:ApplyHeightEdit(x, z, radius,
delta)` arrived in VEXT 1.16.0 (2026-08-07), marked experimental, **not synced between realms** — you
must apply the same edits on both sides. Heightfield only. Whether collision follows is undocumented.

---

## 5. Staged plan

Ordered so each stage produces something visible and de-risks the next.

**Stage 0 — get the asset. Half a day, no BF3 involvement.**
Install CS2, run the VRF export from §1. Deliverable: `de_dust2.gltf` + `de_dust2_physics.gltf` +
textures, in metres. Measure the real triangle/material counts; every estimate downstream depends on
them. *Nothing here can fail in an interesting way.*

**Stage 1 — dust2 in the browser. A day.**
`gltfpack` the export, drop the GLB into `.mesh-cache/`, add a `?glb=` branch to
`VEXTemulator.UIReloaded()` and gate the material stomp in `MeshManager.original()`. Deliverable: the
existing editor, orbiting a textured dust2, with `tools/e2e/standalone_level.py` asserting non-zero
`renderer.info.render.triangles`. **This is the first milestone and it makes the "universal
interchange" claim real on the read side of both engines.** It is a *viewer*, not a port — say so.

**Stage 2 — prove the cross-level asset path. A day or two, highest information per hour.**
Take one BF3 prop that MP_001 does not load, run `reference_existing_partition` +
`mesh_variation_db_add_entry` into a custom superbundle, mount it with the ShellPool pattern, and
place it. Deliverable: a yes/no on §4.2, which decides whether kit-bashing is a real option or a dead
end. If it works, everything in Stage 3 is placement work the pipeline already does.

**Stage 3 — kit-bashed dust2, in-engine and walkable.**
Use the Stage 1 viewer as a reference underlay; block out mid, long, the pits and the bombsites from
BF3 walls and crates at shipped scales. Deliverable: a playable level whose *layout* is dust2 and
whose *material* is Battlefield. This is the most playable thing reachable without a MeshSet writer,
and it is reachable with today's tools.

**Stage 4 — MeshSet round-trip.**
Read a MeshSet, re-serialize, byte-compare. Answer the resource-meta question from §3.1 with a
read-only meta dump. Deliverable: a yes/no on the allocator and the relocation table against ground
truth, before a line of glTF code is written.

**Stage 5 — `add_gltf_mesh` + MVDB synthesis.**
Only if Stage 4 is clean. Deliverable: dust2's real geometry rendering in BF3, with no collision —
players fall through it. Still worth doing: §3.3 establishes that rendering does not need Havok.

**Stage 6 — collision.** Invisible BF3 collision volumes placed along VRF's physics groups. A
walkable, approximate floor. Not a faithful collision port.

## Not reachable

- **Faithful collision for new geometry.** MOPP compilation needs the Havok SDK. No workaround
  produces correct per-triangle collision for an imported mesh.
- **dust2's baked lighting.** CS2 decodes an SH2 directional-irradiance basis from four textures
  under its own tonemapper. Extract `irradiance.png` as a *reference* and re-bake; do not port it.
- **Anything distributable.** dust2's geometry, textures and models are Valve's. VRF is MIT and using
  it is fine; what comes out of it is not yours to ship. This is a private-machine exercise.

---

## T. The build that makes dust2 its own object

Everything in this section was run on this machine. Where something is not demonstrated, it says so
in those words.

### T1. What ships

| partition / resource | what it is |
|---|---|
| `dust2/dust2_mesh` (MeshSet + chunk) | 91 subsets, one per dust2 material; 20,785 triangles, 62,355 vertices; 16,284-byte resource, 2,120,080-byte chunk |
| `dust2/dust2_mesh` (EBX) | `RigidMeshAsset` + 91 `MeshMaterial` + an inline `MeshLodGroup` |
| `dust2/dust2` (EBX) | `ObjectBlueprint` -> `StaticModelEntityData`, no physics |
| `dust2/meshvariationdb_win32` (EBX) | one `MeshVariationDatabaseEntry`, hash 0, 91 materials, each binding Diffuse/Normal/Specular |
| `dust2/textures/...` | 86 `DxTexture` resources + 86 `TextureAsset` partitions, plus one flat normal map |
| `dust2/world` (EBX) | `SubWorldData` -> `WorldPartData` -> **one** `ReferenceObjectData`, identity rotation, 1:1 scale, trans 0,0,0 |

Superbundle `Win32/Dust2/Dust2`, bundle `Win32/Dust2/World`, 12 MB. Built by
`tools/usd/build_dust2.py`, which emits the MeshSet, the DDS files, every JSON partition and the
RimeREPL command file in one pass, from fixed guids so a rebuild is byte-stable.

Two things are read out of shipped BF3 data, and neither is an object:

- **the vertex declaration** -- `Pos` Half3 at 0, `BinormalSign` Half at 6, `Normal` Half4 at 8,
  `Tangent` Half4 at 16, `TexCoord0` Half2 at 24, stride 32. There is no way to author a mesh
  without a declaration the engine recognises.
- **the shader** -- `7d695128-2252-11e0-af13-c7d193512d44 / 2acf6ff2-42a7-c791-0e2b-3acd6a796754`.
  Both `objects/loadingpallet_01` and `objects/tires_stack` use it, tires_stack binds
  Diffuse/Normal/Specular through its MVDB entry, and its mesh carries exactly the declaration
  above. Declaration and shader are therefore a matched pair taken from one shipped example, which
  is the only way to be sure they agree. DXBC cannot be compiled here.

### T2. Two real bugs found in the geometry writer

**Positions were being written as float32 into a Half3 slot.** The first 91-subset builder wrote
`vb[:, 0:12] = P.astype(float32)`, but the declaration says Position is `Half3` -- six bytes -- so
bytes 6..11 (the binormal sign and the first half of the normal) were being overwritten with the low
half of a float. The declaration is authoritative; the builder now walks its elements and writes
each in the format and at the offset it names.

**`VertexOffset` is a BYTE offset, not a vertex index.** Measured, not inferred, off two shipped
multi-subset meshes:

```
res05.meshset  sub0 verts=2420 stride=48 -> 116160 bytes;  sub1 vertex_offset = 116160
               sub0 prims=1524 -> 4572 indices;            sub1 start_index   = 4572
```

So a LOD has one vertex block and one index block; `VertexOffset` walks the first in bytes,
`StartIndex` walks the second in indices, and each subset's indices are **relative to its own vertex
block** -- `res05`'s second subset has `vertex_count` 72 with `start_index` 4572, which is only
consistent under the relative reading. This also **retires the note in §R2** that "two subsets
sharing one index block is invalid": shipped data does exactly that, five subsets at a time.

### T3. The textures, and where they actually live

dust2's colour maps are **not in the BSP**. Its pakfile holds 50 entries: 38 cubemap `.vtf`s the
compiler baked and 12 patched `.vmt` stubs. Every `DE_DUST/*` texture lives in the game's own
material tree.

CS:S is not installed here, and the 2.4 GB archive.org zip that supplied `de_dust2.bsp` is a full
loose-file install of build 4044 -- no VPKs. Archive.org serves HTTP range requests, so the zip's
central directory (5.4 MB at offset 2,472,214,988) was read, and then each needed member fetched by
its local-header offset and inflated individually. **91 materials resolved from ~18 MB of transfer
instead of 2.4 GB.**

- 85 `.vmt` came from the game tree; the other 6 are the compiler's `patch { include ... }` stubs in
  the BSP pakfile, which carry `$envmap` and no `$basetexture` -- read literally, dust2's tile floor
  comes back with no texture at all, so the reader follows the include.
- 86 distinct base textures, **every one of them DXT1**. VTF -> DDS is then a container rewrite
  (`tools/usd/vtf_to_dds.py`), not a recompression. The one real difference is mip ORDER: a VTF
  stores smallest-first, a DDS largest-first, and copying the payload straight across gives a
  texture whose top surface is a 1x1 block -- which reads in game as a flat colour, not as an error.

`add_dds_texture` needs an explicit **`TextureGroup`**. Rime defaults to `"Default"`, which is not a
group the engine pools, and its own comment says such a texture is never uploaded. The right value
was read out of a shipped DxTexture header (char[16] at offset 112 of
`objects/tires_stack/tires_stacks_d`): **`World_SkipNoStr`**.

### T4. What is verified in game

Server, verbatim from `logs/server.log`:

```
[dust2] DUST2 SERVER mounted Dust2/Dust2
[dust2] DUST2 SERVER prepending dust2/world to 2 bundles
[dust2] DUST2 SERVER patched level with sub-level dust2/world
[dust2] DUST2 SERVER level loaded
```

Client, from the editor over CDP:

```
blueprints: {"n": 1610, "hits": ["dust2/world", "dust2/world/part", "dust2/dust2"]}
t+5s        {"total": 2956, "hits": [{"name": "dust2/dust2", "trans": [0, 0, 0]}, ...]}
```

- the client **loads the bundle and reaches the game with it**, with 86 new DxTextures and a 2 MB
  mesh chunk resident. This is new: every earlier attempt died on a modal
  `CreateTexture2D ... E_INVALIDARG` dialog (§C). Going through `add_dds_texture` with an explicit
  texture group, rather than letting `reference_existing_partition` rewrite shipped textures,
  is what changed;
- all three new partitions load and the editor catalogues them;
- **exactly one** `dust2/dust2` object exists, at `trans [0,0,0]`. The scene-instance count goes from
  45 root entries without the mod to 46 with it.

### T5. What is NOT verified: nothing has been seen to draw

**There is no screenshot showing dust2's geometry rendered, and none should be inferred.** Captures
were taken from four camera positions with the mod on and the same four with it off; the viewport
regions differ by PSNR 31-35 dB, which is within what the scene's own motion produces, and no dust2
silhouette is identifiable in any frame.

The AABB measurement that would have settled it came back empty -- but it is **inconclusive, not
negative**: `gameEntitiesData` is empty for **all 2,994** objects in the level, vanilla ones
included, so the editor's box-request path was not answering at all in this session. It says nothing
about dust2 specifically.

Leading hypothesis, **unverified**: the MeshVariationDatabase entry is not being consulted. Rime's
own `MeshVariationDbAddEntryCommand` states that an entry missing for a variation hash "leaves the
mesh invisible", and asserts that a separate minimal MVDB partition is consulted alongside the
level's own -- an assertion nothing in this repo has ever tested. A mesh that loads, places, and
draws nothing is exactly that failure's shape. The cheap test is to bind one dust2 material into a
*shipped* mesh's MVDB entry and see whether the texture appears, which separates "our MVDB is
ignored" from "our mesh is wrong".

Second candidate, cheaper to eliminate: `MeshLodGroup.CullScreenArea` is authored as `0.0` where
retail's shared `lodgroups/world_streamablelods2` uses `0.02`. Zero was chosen to mean "never cull";
if the engine reads it as "cull below this and 0 means always", the mesh is culled every frame.

### T6. The harness blocker that had to be solved first, and is now solved

No previous session in this repo ever produced an in-game photograph, and the reason turns out to be
mechanical rather than graphical: **MapEditor's editor refuses to open without a live soldier.**
`UIManager:EnableFreeCam` returns false when `PlayerManager:GetLocalPlayer().soldier` is nil, and at
BF3's deploy screen no soldier exists -- so the client sat on the deploy UI and every capture was a
picture of that UI.

`Admin/Mods/Dust2Probe` (a test aid, not part of the port) fixes it in two steps:

- **server**: force-spawn a joining player, using BotDirector's sequence -- an `EntryInput` kept
  referenced, a kit from `selectedKit`, an appearance unlock, then `SpawnSoldierAt` **before**
  `AttachSoldier`. Confirmed: `soldier=true alive=true`.
- **client**: drop BF3's spawn screens on `UI:PushScreen` (`SpawnScreenPC`, `SpawnButtonScreen`,
  `SpawnScreenTicketCounterConquestScreen`), reporting every screen name to the server log rather
  than guessing at them.

With a soldier alive the editor opens, and the object's own Inspector confirms the placement from
inside the running game: **`dust2` / `ObjectBlueprint`, POSITION 0/0/0, ROTATION 0/0/0, SCALE
1/1/1** -- the hard rule, read back off the client.

Two things are still NOT solved, and they are why there is no photograph:

- **Camera control is unconfirmed.** `tools/e2e/dust2_shot.py` drives the camera the way the
  editor's own F-focus does (move the headless three.js camera, read its world matrix,
  `SendEvent('FocusCamera', {transform, duration})`). Reading the camera back before any send gave
  `(1.1, 0.5, 0.9)` -- the ext's mirror of the real freecam -- but after a send the three.js camera
  simply holds the value I wrote and is never overwritten again. So the readback proves nothing
  about where the GAME camera is, and I cannot claim the captures were taken from the positions
  they were requested from. Any conclusion drawn from "I looked and dust2 was not there" inherits
  that doubt.
- **The deploy-camera depth-of-field and blue grade** stay on the frame even with the spawn screens
  blocked and the soldier alive. It is a post-process, not a missing render, but it makes the
  frames hazy.

### T7. Reproducing

```bash
# 1. materials out of the CS:S zip (HTTP range requests, ~18 MB)
python3 /tmp/dust2/fetch_mats.py

# 2. mesh + textures + partitions + Rime commands
tools/usd/build_dust2.py /tmp/dust2/de_dust2.obj /tmp/dust2/refs/tires.meshset \
    /tmp/dust2/mat  Admin/Mods/Dust2/build

# 3. build the superbundle
script -qfec "RimeREPL Admin/Mods/Dust2/build/build.cmds" /tmp/dust2/rime_build.log

# 4. enable Dust2 (+ Dust2Probe for a camera) in Admin/ModList.txt, then
./.powos-e2e-run.sh dust2_e2e.py
tools/e2e/dust2_shot.py
```

### T8. The right host is a blank level, not MP_001

Handed over mid-session: `Blank_Level_Test` (keku), a **from-scratch custom level**
`Win32/Levels/REALITYMOD/REALITYMOD` with `MapList.txt: REALITYMOD TeamDeathMatch0 1`, built the
same way as everything above -- `build_sb` / `build_bundle` / `add_json_partition` out of
`RimeCommands.txt`, no shipped level involved.

This is a better home for dust2 than MP_001, for three reasons that bear directly on §T5:

1. **Nothing else is in the frame.** Every capture in this document is of Grand Bazaar with dust2
   supposedly inside it. On a blank level, "did anything draw" stops being a judgement call.
2. **Its LevelData already wires SubWorldReferenceObjectData gated on gamemode**, the same
   mechanism the Dust2 mod patches in at runtime. Placing dust2 there is authoring, not patching --
   which is what "native level content" should mean, and it removes the Lua level-patch that is
   currently the one part of the mod doing more than mount-and-prepend.
3. **Its mp_subway-derived content is deliberately stripped of the StaticModelGroup, the physics
   and the mvdb.** So there is no competing MeshVariationDatabase in that level -- which is exactly
   the variable §T5 names as the leading suspect. If our MVDB is the only one present and dust2
   still does not draw, the MVDB hypothesis is dead; if it draws, it was right.

It also carries findings this document should not lose:

- a level's sublevel `DataContainer` is looked up **by name** (`ResourceManager::lookupDataContainer`);
  a name mismatch returns NULL and crashes load at `sub_11A1170`. A new Rime command
  `rename_partitions_by_prefix` exists to fix that.
- `ResourceManager:MountSuperBundle` **prepends `Win32/`** itself, so the name passed must omit it
  (`globals`, not `win32/globals`).
- a level's streaming chunks (voiceover/sound/video) live only at superbundle level and are fetched
  BY GUID from any mounted superbundle, so `strip_sb_level_chunks` requires the mod to mount
  `win32/mpchunks` / `win32/spchunks` back.

**Next step, and it is the one worth taking:** rebuild the dust2 bundle against REALITYMOD --
partition names under `levels/realitymod/dust2*`, the ROD added to that level's own subworld rather
than patched in from Lua -- and re-run the capture there.

### T9. Prediction, registered BEFORE the REALITYMOD run

Written and committed to the document before the blank-level build was run, so the result cannot be
read backwards into whatever it turns out to be. `Blank_Level_Test`'s level carries **no
MeshVariationDatabase of its own** (its mp_subway-derived art, physics and mvdb are stripped), so
moving dust2 there changes exactly the variable §T5 named.

The measurement is no longer the editor probe -- that returned empty for **all 2,994** objects
including vanilla ones, so it was not answering and a negative from it meant nothing. It is replaced
by `Admin/Mods/Dust2Probe/ext/Server/Measure.lua`, which walks the server's own
`EntityManager:GetIterator('SpatialEntity')` and reports every entity larger than 50 m in X and Z,
plus any whose AABB matches dust2's declared box to within a metre:

```
min (-67.87, 0.00, -66.20)   max (67.87, 20.52, 66.20)
```

Camera position is likewise no longer inferred: `Dust2Probe/ext/Client` reports
`ClientUtils:GetCameraTransform()` to the server log every four seconds, so a capture can be tied to
a position that was actually rendered from rather than to the value this harness wrote into a
headless three.js camera and never got mirrored back.

Three outcomes, and what each one settles:

| outcome | what it means |
|---|---|
| **A.** `DUST2MEASURE *** DUST2 AABB MATCH`, and dust2 is visible in a capture | the MVDB hypothesis was right: MP_001's own MeshVariationDatabase was shadowing ours. The port works. |
| **B.** AABB match, but still nothing drawn | the ROD instantiates and the engine reads the bounding box out of our MeshSet -- so the geometry, the resource meta, the chunk and the placement are all correct -- and the failure is downstream, in material/shader binding only. **This kills the "our mesh is malformed" family of explanations outright**, which is most of the remaining search space. |
| **C.** no AABB match, nothing larger than 50 m | the ReferenceObjectData never instantiates. Rendering was never reached, the MVDB is irrelevant, and the bug is in the sub-level wiring -- `SubWorldReferenceObjectData` -> bundle -> `SubWorldData` -> `WorldPartData` -> ROD. |

**I predict B.** The reasoning: on MP_001 the client loaded the bundle, reached the game with 86 new
DxTextures and a 2 MB mesh chunk resident, and the level did not crash -- which is a lot of the
pipeline working. A malformed MeshSet tends to hang or crash the client at load (it did, repeatedly,
earlier in this document), and this one does not. Meanwhile nothing about the MVDB path has ever
been exercised in this repo, and Rime's own comment says a missing entry leaves a mesh **invisible**
-- which is precisely the observed symptom, and is a rendering-side failure that would survive a
change of host.

One confound the blank level ADDS, and it must be stated up front rather than discovered later: our
91 MeshMaterials reference the shipped shader `7d695128-2252-11e0-af13-c7d193512d44`, and its
compiled permutations live in a ShaderDatabase resource. On MP_001 that shader was certainly
resident, because MP_001 draws pallets and tyre stacks with it. On a from-scratch level with its own
`levels/realitymod/realitymod/shaderdb` there is **no guarantee either the shader partition or its
compiled bytecode is present**. So outcome B on REALITYMOD is weaker evidence than outcome B on
MP_001 would have been, and outcome A is correspondingly stronger.

### T10. Result of the REALITYMOD run: prediction WRONG, and the failure moved

Outcome was **none of A, B or C**. The server does not finish loading the level at all -- a mode the
pre-registered table did not contemplate, which is worth recording as a miss rather than filed under
the nearest listed option.

**What worked, and it is the larger half.** dust2 is now genuinely *authored* level content. The
bundle carries its own copy of `levels/realitymod/realitymod` -- the level's own partition -- with
one extra `SubWorldReferenceObjectData` beside the shipped `teamdeathmatch` and `tdm2` entries, and
the mod's Lua is now nothing but a mount and a prepend. The engine picks it up by itself:

```
[BLT] LoadBundles comp=3 n=3
[BLT]   bundle: levels/realitymod/dust2        <- our bundle, prepended
[BLT]   bundle: mapeditor/shellsb
[BLT]   bundle: Levels/REALITYMOD/REALITYMOD
[BLT] LoadBundles comp=4 n=1  bundle: Levels/REALITYMOD/teamdeathmatch
[BLT] LoadBundles comp=5 n=1  bundle: Levels/REALITYMOD/tdm2
[BLT] LoadBundles comp=6 n=1  bundle: Levels/REALITYMOD/dust2     <- the engine asking for OUR sub-level
```

Compartment 6 is the engine loading dust2's sub-level on its own initiative, because the level it
read told it to. The shadow took effect, the `SubWorldReferenceObjectData` is well-formed, and the
bundle/partition naming rule holds. **This also retro-explains MP_001**: there the SWROD was patched
in from Lua at `Partition:Loaded`, by which point the engine had already passed "Creating entities
for autoloaded sublevels", so dust2's sub-level was very likely never instantiated at all -- which
would account for both the silence and the absence of any crash.

**What fails.** The server dies during level load, every time, at the same place:

```
LoadingInfo: Registering entity resources
LoadingInfo: Creating material grid
<process exits>
```

Without our bundle the very next lines are `Creating physics manager`, `Spawning level`,
`Creating entities for autoloaded sublevels`, ..., `Level:Loaded`. So it dies in or just after the
material grid, before the physics manager reports.

**Two hypotheses tested and killed:**

1. **Physics fields on the entity.** `StaticModelEntityData` carries `PhysicsData` and
   `PhysicsPartInfos`, and it was authored with a null `PhysicsData`; dying one step before the
   physics manager made that the obvious suspect. Rebuilt with **`RigidMeshEntityData`**, whose
   entire chain (`SpatialEntityData` -> `EntityData` -> `GameObjectData`) contains no physics and
   whose whole field list is a transform and a mesh ref -- the type `docs/nohavok-subworlds.md`
   counted 298 of on MP_001. **Identical crash. Disproved.**
2. **Instantiating our blueprint.** Rebuilt with the sub-level's `WorldPartData.Objects` **empty** --
   same bundle, same 86 textures, same MeshSet, same MVDB, same sub-level, nothing placed.
   **Identical crash. Disproved.**

That second one is the useful one. With nothing placed, the entity-creation path is never entered,
so the crash cannot be caused by the `ObjectBlueprint`, the entity data, the `ReferenceObjectData`,
or the MeshSet being drawn. **The failure is in loading or wiring the sub-level, not in its
contents.**

> **A methodology note against myself.** I first recorded this bisect as confirmed while reading a
> **stale** `server.log`: the run had been REFUSED by the harness's single-run guard
> (`REFUSING: e2e run already in progress`) and never started. The result above is from a re-run
> with the log deleted first. The earlier dust2-port sessions were burned by exactly this class of
> mistake, and the guard's refusal goes to the runner's stdout while the conclusion was being read
> out of a different file -- so nothing looked wrong.

**Leading suspect now, and it is NOT dust2.** The shadowed level partition itself. `Blank_Level_Test`
ships `TestJson1_nowater.json` alongside four dated `.bak_v0037/0042/0044/0048_preant` backups, and
its `mod.json` is version **0.0.110** while its `RimeCommands.txt` is dated three days earlier and
does not even mention the file. So the JSON in the zip is very plausibly **not** the source the
shipped `REALITYMOD.sb` was built from, and shadowing the level with a recompile of a stale
description would break the load exactly here -- before any of dust2's own content is reached.

**The next test, and it needs no dust2 at all:** build a bundle containing ONLY a round-trip of
`levels/realitymod/realitymod` -- their JSON, recompiled, with **no** added
`SubWorldReferenceObjectData` -- and prepend it. If the level still dies at the material grid, the
shadow is stale or lossy and the whole approach needs the level's real current source (or keku's
`rename_partitions_by_prefix` route) rather than the zip's JSON. If it loads, the shadow is faithful
and the added sub-level reference is what the engine objects to.

### T11. Dropping the shadow: the level now LOADS, and the failure moved to the client

The §T10 crash was the shadowed level description, not dust2. Confirming that by debugging someone
else's level was the wrong use of a run -- the mesh, the 91 materials and the 86 textures were never
what crashed. So the shadow was dropped and dust2's sub-level is referenced by the runtime
`SubWorldReferenceObjectData` patch again (host `realitymod_patch` in `build_dust2.py`), keeping the
blank level's two real advantages: nothing else in frame, and no competing MeshVariationDatabase.

**The server now loads the level completely, with dust2's sub-level in it:**

```
[dust2] DUST2 SERVER mounted Dust2/Dust2
[dust2] DUST2 SERVER prepending levels/realitymod/dust2 ahead of 2 bundles
[BLT]   bundle: levels/realitymod/dust2
[dust2] DUST2 SERVER patched level with sub-level levels/realitymod/dust2
[BLT]   bundle: levels/realitymod/dust2          <- loaded AGAIN, as its own sub-level
[BLT] LoadingInfo: Registering entity resources
[BLT] LoadingInfo: Creating material grid
[BLT] LoadingInfo: Creating physics manager
[BLT] LoadingInfo: Spawning level
[BLT] LoadingInfo: Creating entities for autoloaded sublevels
[BLT] LoadingInfo: Initializing entities for autoloaded sublevels
[dust2] DUST2 SERVER level loaded
[BLT] LoadingInfo: Running
```

That second `bundle: levels/realitymod/dust2` is the engine loading dust2's sub-level *as a
sub-level*, after the patch -- the step MP_001 never showed. The load then walks
"Creating/Initializing entities for autoloaded sublevels" and finishes. **No crash, level running.**

So of the three routes tried, the scoreboard is:

| route | sub-level referenced | sub-level loaded | level finishes loading |
|---|---|---|---|
| MP_001, Lua patch | yes | never observed | yes |
| REALITYMOD, authored shadow | yes (own compartment) | yes | **no -- dies at material grid** |
| REALITYMOD, Lua patch | yes | **yes** | **yes** |

### T12. A second instrument that was not answering

`Dust2Probe/ext/Server/Measure.lua` reported, four times, fifteen seconds apart:

```
DUST2MEASURE run=1 total=0 bigger-than-50m=0 dust2-aabb-matches=0
DUST2MEASURE types:
```

`total=0` with an **empty type histogram** -- not "dust2 is missing", but "this iterator returned
nothing at all", on a level the server had just finished loading and was running. The cause is the
realm: a `RigidMeshEntity` is a RENDER entity and a dedicated server does not create one. Measuring
static geometry on the server was never going to work.

This is the second time in this project an instrument that was not answering could have been read as
a negative -- the first was the editor AABB probe in §T5. The histogram line exists precisely so the
difference is visible on the face of the log. The walk has been moved to `ext/Client/Measure.lua`,
reporting over `NetEvents` into the server log, and it has **not yet produced a reading**, because:

### T13. Current failure: the client does not complete the join

`enter_game` clicks the soldier, the client begins loading, and after 260 s the editor target never
appears. A screenshot of the client window shows:

```
DISCONNECTED
The connection to the server timed out.
```

This is a **new and more specific symptom** than anything earlier in this document. On MP_001 the
client always reached the game; here the server is up and running the level, and it is the client
that fails to finish. The client is doing something the server is not: creating the render entity
for dust2's `RigidMeshAsset`, uploading 86 DxTextures, and resolving the MeshVariationDatabase.

Candidates, none tested yet, in the order they should be tried:

1. **Client-side level load is simply slow and the join times out.** `Blank_Level_Test`'s own ext
   already raises `ClientSettings.loadingTimeout` reasoning in the same territory, and 10.7 MB of
   new bundle plus 86 textures lands on top of a level that is otherwise nearly empty. Cheapest
   test, and it is a configuration change rather than a data change.
2. **The client crashes or hangs building the mesh entity** -- the half of the pipeline the server
   never exercises. This is where the MVDB and shader-permutation questions actually live.
3. **`objects/shaders/proppreset` has no compiled permutation** in `levels/realitymod/realitymod/shaderdb`,
   which is the confound registered up front in §T9 and which only bites on the client.

**Honest status: dust2 still has not been seen to draw.** What changed this session is that the
failure has moved twice -- from "silently never instantiated" (MP_001), through "server dies at
level load" (authored shadow), to "server runs the level fine and the client times out joining"
(current). Each move is a narrowing, and the current one puts the remaining problem squarely on the
client rendering path, which is where the MVDB hypothesis always lived.

### T14. Prediction, registered BEFORE the timeout run

Hypothesis 1 from §T13 is no longer a guess -- the number was read out of the level's own data.
`Blank_Level_Test` ships its own settings partition, `levels/realitymod/realitymod/settings_win32`
(`0f573c99-0ffa-f422-0f32-ce402cd8f447`), and its `ClientSettings`
(`351ae22c-2dea-142f-277e-a410d0381220`) carries:

```
LoadedTimeout  = 5.0
LoadingTimeout = 5.0
IngameTimeout  = 5.0
```

and its `ServerSettings` (`ccc543fa-...`) `LoadingTimeout = 5.0`, `IngameTimeout = 3.0`.

**Five seconds.** MapEditor already raises these to 1000 (`ME_CONFIG.LOADING_TIMEOUT`,
`ext/Server/FBSettingsManager.lua`) -- but it registers its handler against the STOCK guids
`C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4 / B479A8FA-...`, which is the shipped game's settings
partition, **not this level's own**. So on REALITYMOD nothing raises them, and the client has five
seconds to complete a load that now includes 10.7 MB of new bundle, a 2 MB mesh chunk and 86
DxTextures. `DISCONNECTED - The connection to the server timed out` is precisely the shape of that.

**Prediction: raising these four values gets the client into the game.** Not that dust2 draws --
only that the join completes and the client-side measurement finally returns a reading. If the
client still times out with the timeouts at 1000, the timeout was a red herring and the cause is the
client-side mesh-entity build or the shader permutation (§T13 candidates 2 and 3), which is a
genuinely different place to look.

Recorded as a distinct claim so it can be wrong on its own: this predicts **the join**, not the
render.

### T15. Result: the timeout is DISPROVED -- and the first attempt at it silently did nothing

**Prediction from §T14 was wrong.** With both `ClientSettings` and `ServerSettings` timeouts verified
raised to 1000, the client still ends at `DISCONNECTED - The connection to the server timed out`.
The five-second timeout was a red herring.

Getting to a trustworthy negative took two attempts, and the first one is the interesting half:

**Attempt 1 silently did not apply.** `RegisterInstanceLoadHandler` was registered against the guids
in `Blank_Level_Test`'s shipped JSON (`0f573c99` / `351ae22c` / `ccc543fa`). It **never fired** -- no
print, on either realm. Reported as-is, that run would have read as "raised the timeouts, still times
out, hypothesis disproved", when in fact nothing had been raised. The only reason it was caught is
that the handler prints unconditionally, so the *absence* of its line was visible.

> This is the third instance in this document of the same failure mode, and it is worth naming
> properly: **an intervention that silently does not apply is indistinguishable from a hypothesis
> that has been disproved.** The earlier two were measurement instruments (the editor AABB probe
> answering for nothing, the server-realm entity walk in the wrong realm); this one was a *fix*
> rather than a *probe*, which makes it more dangerous, because a failed fix produces exactly the
> evidence you were looking for. Every intervention now prints what it actually changed.

**Attempt 2 found the settings by TYPE instead of by guid** (`Partition:Loaded` -> scan instances
for `ClientSettings`/`ServerSettings`), which cannot miss for that reason, and it reported:

```
DUST2PROBE raised ClientSettings #1 in levels/mp_subway/mp_subway/settings_win32
DUST2PROBE raised ServerSettings #1 in levels/mp_subway/mp_subway/settings_win32
DUST2PROBE timeout scan done: 1 ClientSettings, 1 ServerSettings raised
```

Note the partition name: **`levels/mp_subway/mp_subway/settings_win32`**, not the
`levels/realitymod/realitymod/settings_win32` the zip's JSON declares. That is a third independent
sign that `Blank_Level_Test`'s shipped superbundle was not built from the JSON in the zip -- the
same mismatch that made the level shadow crash the load in §T10.

Client still times out. **Candidate 1 is dead**, with the intervention verified applied. The
remaining candidates are §T13's 2 and 3, both client-only: the mesh-entity build, and the shader
permutation.

### T16. The shader-permutation check is blocked on a Rime bug, not answered

Candidate 3 was meant to be settled directly, per the note that compiled bytecode lives in each
`ShaderSolution`'s `PixelPermutation.ShaderBytecode` / `VertexPermutation.ShaderBytecode`. But

```
dump_shader_solutions levels/mp_subway/mp_subway/shaderdb PropPreset <out>
dump_shader_solutions levels/mp_001/mp_001/shaderdb      PropPreset <out>
```

both throw inside `RimeLib.Cmd.ExecutionContext.ProcessCommand` and take the REPL down with them --
on the control shaderdb (MP_001) as well as the test one, so it is not a property of the blank
level's data. **This is a finding about the tool, not about the shader.** Whether
`objects/shaders/proppreset` has a compiled permutation on this level remains **unknown and
untested**, and must not be written up as either confirmed or ruled out.

Next step for it: run the command under a debugger or add the exception text to the REPL's output
(it currently prints only the stack), then re-ask. The question is still the right one -- our 91
MeshMaterials all point at that one ShaderGraph, and a missing permutation is a client-only failure,
which is exactly the shape of what is left.

### T17. Standing status

- dust2 builds: 91-subset MeshSet, 91 materials, 86 ported CS:S textures, one placement at
  identity/0,0,0. Byte-verified offline.
- On REALITYMOD the **server** loads the level with dust2's sub-level instantiated and runs it.
- The **client** does not complete the join. Not the timeout (disproved, verified). Not yet
  attributable to the mesh-entity build or the shader permutation, neither of which has been tested.
- **dust2 has still never been seen to draw.** No screenshot exists.

### T18. Prediction, registered BEFORE the shader-permutation run

`dump_shader_solutions` failed in §T16 because it called `File.WriteAllBytes` into a directory that
did not exist -- a `DirectoryNotFoundException` escaping `ProcessCommand` and taking the REPL with
it. That is why it "crashed" on the MP_001 control too, which should have been the tell: **a data
problem does not follow you to a control.** Fixed upstream (`Directory.CreateDirectory` first),
rebuilt, verified present in the working tree.

The question: does the shader all 91 MeshMaterials point at, `objects/shaders/proppreset`, have
compiled permutations in the shaderdb the blank level actually uses?

| result | reading |
|---|---|
| **matched=0 on mp_subway, >0 on MP_001** | the client has nothing to compile dust2's material with on this level. A concrete cause for a client-only failure, and directly fixable -- carry the solutions, or use a shader the level does have. |
| **>0 on both** | the shader is exonerated on presence. Remaining candidate is the mesh-entity build (§T13 #2), and MP_001's non-render stays unexplained by shaders. |
| **matched=0 on both** | presence is not the discriminator at all -- MP_001 demonstrably draws pallets and tyre stacks with this exact shader, so a zero there means I am querying the wrong database. Instrument problem, not a finding. |

**I predict >0 on both.** MP_001 certainly compiles it, and `Blank_Level_Test`'s shaderdb is
inherited from mp_subway, a level full of ordinary props. The third row is written down precisely so
a zero-everywhere result gets read as a broken query rather than as evidence -- the mistake this
document has now made three times.

### T19. Candidate 3 is DEAD: the shader is fully present, in every permutation

Prediction from §T18 correct -- **>0 on both**, and not marginally:

```
levels/mp_subway/mp_subway/shaderdb   PropPreset  matched=26
levels/mp_001/mp_001/shaderdb         PropPreset  matched=38
```

Broken down by render mode and object lighting, the blank level's inherited shaderdb covers
everything:

| mode | objLight | mp_subway | mp_001 |
|---|---|---|---|
| Default | LightMap / LightProbe / None | 12 / 20 / 20 | - / 12 / 12 |
| DeferredShadingGBufferLayout0 | LightMap / LightProbe / None | 68 / 264 / 264 | 72 / 390 / 390 |
| ZOnly | None | 370 | 532 |

Every combination dust2's materials could ask for has compiled DXBC on this level. **The shader
hypothesis is dead** -- it is not why the client fails, and it was never why MP_001 drew nothing.

### T20. What that table exposes instead: our mesh has NO ZOnly subsets

The ZOnly row is the largest bucket in both databases -- 370 and 532 compiled permutations of a
depth-only pass -- and **every shipped mesh examined in this document has ZOnly subsets sitting in
category 3**:

```
res05.meshset  catidx [[0,1,2,3],[],[],[4]]      sub4 stride=16, prims=2376 = sum of the other four
roof.meshset   catidx [[1,0],[],[],[3,2]]        two material subsets, two ZOnly
tires.meshset  every LOD: one material subset + one stride-16 subset
pallet.meshset lod0: 'lambert2' + one stride-16 subset
```

dust2's MeshSet has `catidx [[0..90],[],[],[]]` -- category 3 empty, no ZOnly subset at all. That was
a deliberate simplification made early (§T1: "no ZOnly; it halves the chunk"), carried forward
untested through every build since, and justified by a §R2 note that has itself since been retired.

A deferred renderer that depth-prepasses its static geometry and finds a mesh with nothing to draw
in the Z pass is a plausible way to get **exactly** the symptom this document has been chasing since
the beginning: content that loads, places, occupies the right bounding box, and never appears. It is
also the only structural difference left between dust2's MeshSet and every shipped mesh it was
modelled on.

**Prediction, registered before the run:** adding one ZOnly subset -- res05's arrangement, a single
stride-16 subset covering all 20,785 triangles, listed in category 3 -- is what makes dust2 draw. If
the client still fails to join, that is a separate bug from the render and the ZOnly change is
untested rather than disproved; I will say so rather than fold the two together.

### T21. ZOnly added; still cannot be tested, because the client still will not join

The ZOnly subset is built and byte-verified:

```
subsets 92   category0 = 91 material subsets   category3 = [91]
zonly  stride=16  prims=20785  vertexOffset=1995360  startIndex=62355  vertexCount=62355
vertexDataSize 2993040 == 62355*32 + 62355*16      indexDataSize 249420 == 62355*2*2
```

The superbundle builds (10.9 MB), the server loads the level with it, and the client **still** ends
at `DISCONNECTED - The connection to the server timed out`, with the timeouts verified raised to
1000 in the same run.

**So the ZOnly change is UNTESTED, not disproved** -- exactly as pre-registered in §T20. It has never
been rendered, because nothing has been rendered. Folding it in with the join failure would be the
same error as reading a silent instrument as a negative, and it is written down here so a later
session does not find "added ZOnly, still nothing" and conclude the idea was tried and failed.

The client-side probe confirms the boundary precisely: `grep -c "armed on Level:Loaded"` returns
**0**. `Measure.lua` announces itself the instant `Level:Loaded` fires on the client, so its silence
is not an empty walk -- **the client never reaches Level:Loaded at all.**

Where that leaves the three candidates from §T13:

| candidate | status |
|---|---|
| 1. client load timeout | **disproved** (§T15), intervention verified applied |
| 2. mesh-entity build | **still the only live candidate**, and now the sole one |
| 3. shader permutation | **dead** (§T19) -- PropPreset has compiled DXBC in every mode x lighting combination on this level |

Candidate 2 is now the whole remaining search space, and it has never been probed directly. The
client dies somewhere between receiving the level and `Level:Loaded`, doing work the server skips:
creating the render entity for a 92-subset `RigidMeshAsset`, uploading 86 DxTextures, and resolving
the MeshVariationDatabase. The cheapest split of it, and the obvious next run, is to bisect the
BUNDLE rather than the theory -- ship the sub-level with the mesh resource but no MVDB, then with
neither, and find which one the client cannot survive. That is three builds of a tool that already
takes one command, and it converts "the client dies somewhere in there" into a named partition.

### T22. The bisect ran, and it measured a CONTAMINATED BASELINE

All three configurations failed identically:

| config | bundle | client joined |
|---|---|---|
| 1. no MVDB partition | 10.9 MB | no |
| 2. no mesh, no chunk, no textures, no MVDB | **7,792 bytes** | no |
| 3. as 2, plus WorldPartData.Objects empty | 7,792 bytes | no |

A 7.8 KB bundle holding nothing but an ObjectBlueprint and an empty sub-level cannot plausibly be
what breaks a client, and that is what made the result suspicious rather than conclusive. So I ran
the control that had never been run in this configuration -- **the blank level with the Dust2 mod
removed entirely** -- and it failed too.

**The baseline was broken. All three bisect results are void.**

Narrowing it took two more runs:

```
Blank_Level_Test + Dust2Probe                  enter_game -> False
Blank_Level_Test alone (no probe)              enter_game -> True
Blank_Level_Test + Dust2 (no probe)            enter_game -> True   <-- and dust2 is loaded
```

**The cause was `Dust2Probe` -- my own test aid.** Specifically its `UI:PushScreen` filter, which
dropped `SpawnScreenPC` / `SpawnButtonScreen` / `SpawnScreenTicketCounterConquestScreen` to get
BF3's deploy-screen depth-of-field off a capture. On MP_001/Conquest that was harmless and the
client still joined. On REALITYMOD/TeamDeathMatch it stops the join outright.

> **Third variant of the same failure, and the worst one yet.** A fix that silently does not apply
> hides a real effect (§T15). An instrument in the wrong realm reports absence where there is none
> (§T12). A **test aid that changes what it measures manufactures a failure that was never there** --
> and it did so for six consecutive runs, across an entire bisect, while I attributed the result to
> dust2. The tell was available throughout and I did not look at it: I never ran the no-dust2
> control on this level in this configuration.
>
> Rule going forward: **the control runs first, in the same configuration, every time the
> configuration changes.** Not once at the start of a line of investigation -- every time.

### T23. Where this actually leaves dust2: further than it has ever been

With the probe gone and dust2 present, on the blank level:

```
DUST2-NO-PROBE enter_game -> True
objects -> {"total": 27, "dust2": ["levels/realitymod/dust2/blueprint",
                                   "levels/realitymod/dust2/part",
                                   "levels/realitymod/dust2"]}
```

27 objects against the control's 24 -- **the three that dust2's sub-level adds**. So on the client,
on a blank level: the superbundle mounts, the bundle prepends, the level patch takes, the sub-level
loads, its partitions are enumerated by the editor, and **the client completes the join and reaches
the editor**. Every stage of the pipeline up to rendering now works, on both realms, with the full
92-subset mesh, 86 textures and the MVDB present.

What is still missing is a **camera**. Without `Dust2Probe` nothing force-spawns a soldier, so the
client sits at the TDM deploy screen against a black backdrop, and MapEditor's freecam refuses to
open without a live soldier (§T6). The probe supplied that -- and the probe is what broke the join.

**Next step, and it is now a small one:** bisect the probe itself. It does three things beyond the
screen filter -- force-spawn, raise timeouts, run the entity walk -- and the run with only the
screen filter removed still failed, so at least one of the other three is also hostile on this
level. Re-add them one at a time, running the no-dust2 control **first** each time, until a soldier
spawns and the join still succeeds. Then the freecam opens, and the question this document has been
asking since the beginning -- does dust2 draw -- becomes answerable in a single screenshot.

**Still no screenshot of dust2 rendering. It has not been seen to draw.**

### T24. Probe bisect: the force-spawn is hostile too, so the probe cannot supply the camera here

Rebuilt `Dust2Probe` down to a single capability -- force-spawn a joining player -- with the
`UI:PushScreen` filter gone for good, the timeout raise gone, and the entity walk gone. Server-side
only, one file.

Result: **the client still ends at `DISCONNECTED - The connection to the server timed out`.**

```
Blank_Level_Test + Dust2                      enter_game -> True    (control, run immediately prior)
Blank_Level_Test + Dust2 + Dust2Probe(spawn)  enter_game -> False
```

The server log shows the join beginning and then nothing further:

```
DUST2SPAWN player joining: Powback
```

...and no `DUST2SPAWN spawned` line, because the spawn waits six seconds and then looks the player
up, and the player never finishes joining. So on REALITYMOD/TeamDeathMatch **both** of the probe's
capabilities are hostile to the join, independently: the screen filter (§T22) and now the
force-spawn. Force-spawning a soldier server-side, mid-handshake, on a level that has its own TDM
spawn logic and 102 spawn points, is not something this level tolerates.

> The retry loop that produced the silence is itself a small instance of the recurring problem: when
> `GetPlayerByName` returns nil it re-arms for another 2 s and prints nothing, so "the player never
> arrived" and "the spawn was never attempted" look identical. It should print each retry. Noted
> rather than fixed, because the mod it is in is now a dead end on this level.

**What this settles, and it is the important part:** dust2 does not break the client. That was
established in §T23 and this run reinforces it from the other side -- every failure to join has now
been traced to the test aid, and the configuration WITHOUT the test aid joins with dust2's full
92-subset mesh, 86 textures and MVDB loaded and all three of its partitions enumerated.

**The remaining problem is no longer about dust2 at all. It is: how to get a camera on this level.**
Three routes, none tried:

1. **Let the level deploy normally.** The client sits on BF3's TDM deploy screen with a working
   DEPLOY button; it is Scaleform, so CDP cannot click it, but VU may expose a spawn path that does
   not require faking input the way the probe does. This is the route that does not fight the level.
2. **Host on MP_001 instead**, where the probe demonstrably worked and the client always reached the
   game -- at the cost of the blank level's two advantages (empty frame, no competing MVDB), both of
   which were the reason for moving.
3. **Find a camera that does not need a soldier.** MapEditor's freecam refuses without one
   (§T6), but that is MapEditor's own guard, not an engine constraint.

**Still no screenshot, and dust2 has still never been seen to draw.** What has changed across this
whole session is that the reason has moved from "something in our data is wrong" to "we cannot point
a camera at it", and those are very different problems.

### T25. Route 3: the freecam does NOT need a soldier -- read out of the code, not guessed

`UIManager:EnableFreeCam` refuses while `PlayerManager:GetLocalPlayer().soldier` is nil, and that
guard is why no session in this repo has produced an in-game photograph on a level the harness
cannot deploy into. Tracing what the enter chain actually does with the soldier:

```lua
FreeCam:Enable()   -> Create() if no camera yet
FreeCam:Create()   -> EntityManager:CreateEntity(self.m_CameraData, LinearTransform())
                      s_Entity:Init(Realm.Realm_Client, true)
                      self.m_CameraData.transform = ClientUtils:GetCameraTransform()
                      self.m_CameraData.fov = _GetFieldOfView()
FreeCam:TakeControl() -> self.m_Camera:FireEvent("TakeControl")
```

**Nothing in that chain touches the soldier.** The freecam builds its own camera entity and takes its
starting pose from `ClientUtils:GetCameraTransform()`, which is valid whether or not a soldier
exists. `s_LocalPlayer` is not read again anywhere in `EnableFreeCam` after the guard. The guard's
own comment gives it away -- *"Don't change to freecam if the player isnt alive, maybe add message
saying so?"* -- it is a UX check, not a technical requirement.

So route 3 is real, and it is four lines. Added `ME_CONFIG.DEV_FREECAM_WITHOUT_SOLDIER`,
**default false so normal MapEditor behaviour is byte-identical**, which lifts two gates:

- the soldier check in `EnableFreeCam` (with an unconditional print of which branch was taken);
- the `m_ActiveMode == EditorMode.Playing` gate, in `EnableFreeCam` and in the deferred enter in
  `OnUpdateInput`. That one has the same root cause: `OnLoadingComplete` -- which is what sets
  `Playing` -- only fires after the deploy and server sync the harness cannot perform on this level,
  so the mode never leaves `Loading` and the enter request is dropped rather than held.

**Status: implemented, exercised once, NOT demonstrated.**

Correction to an earlier version of this section, which said the proving run "did not get far enough
-- the client was still at soldier-select". That was wrong, and wrong in the usual way: I read the
run's state while it was still in flight, concluded it had failed, and stopped everything. Its
result landed afterwards:

```
[e2e] no editor yet after 154s -- clicking again
FREECAM enter_game -> True
page  localhost:8884/json  webui://main/main-menu
page  localhost:8884/json  webui://mapeditor
```

So the run completed, with the flag `true`, and returned True. **But that is not evidence the guard
was lifted successfully**, for a reason established earlier in this document: `enter_game` returns
True when a `webui://mapeditor` CDP target exists, and that target appears as soon as the WebUI page
boots -- which happens whether or not the editor enter actually completes. The identical `True` came
back from the no-probe control before this change existed.

The one signal that would settle it -- the unconditional `EnableFreeCam: no soldier, continuing
anyway` print -- is a CLIENT-side `print()`, and client prints do not reach the server log. Its
absence there proves nothing either. **The instrument for this question does not yet exist**: it
needs relaying to the server over `NetEvents` the way earlier client-side probes did, or a
screenshot showing the editor chrome rather than the deploy screen.

The flag is left at `false`. Whether lifting the guard produces a working camera remains
**untested**, and the code reading above is an argument, not a result.

### T26. Session end state

**dust2 has never been seen to draw. There is no screenshot.** Everything below is where a
continuation should start.

Working, verified this session:

- the full chain builds byte-clean: 92-subset MeshSet (91 material subsets + ZOnly), 91 materials,
  86 ported CS:S textures, MVDB, blueprint, sub-level, one placement at identity/0,0,0;
- on the blank level REALITYMOD the **server** loads the level with dust2's sub-level instantiated
  and runs it;
- the **client joins** with all of it loaded -- `objects total 27` against the control's 24, the
  three extra being dust2's own partitions.

Dead hypotheses, each disproved rather than abandoned: client load timeout (§T15, intervention
verified applied); shader permutation absent (§T19, `matched=26/38` across every mode x lighting);
alpha-test discard (measured at block level: 0 blocks use the transparent index); MVDB slot names
wrong (validated against PropPreset's own resource table -- it samples exactly `texture_Diffuse`,
`texture_Specular`, `texture_Normal`); entity physics fields (§T10).

Untested, in the order they matter:

1. **A camera.** Route 3 implemented above, unexercised. Route 1 remains: the probe's spawn failed
   because it fired 6 s after `Level:Loaded` while the player was still joining -- a timing bug, and
   a modder's note passed on this session says exactly *"changing from Level:Loaded to
   Player:Respawn fixed it"*. That is a different proposition from what was tested and should be
   tried before falling back to MP_001.
2. **Does it draw** -- unanswerable until 1.
3. **The ZOnly subset**, added because every shipped mesh has one and dust2 had none. Built,
   byte-verified, never rendered.
4. **Lighting.** The LightProbe permutation reads `lightProbeShR/G/B/O` from `$Globals`. If a camera
   ever shows dark geometry, that is *unlit*, not *absent* -- check presence before brightness.
