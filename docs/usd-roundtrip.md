# BF3 <-> USD: the round trip, and what it costs

The loop closes. A BF3 mesh goes out to USD and comes back **byte-identical** — resource payload,
geometry chunks and the resource metadata the engine needs to relocate it — and the result builds
into a superbundle that is byte-identical to one built from the game's own bytes.

Everything below is **VERIFIED** by running it, unless labelled otherwise — including, now, in the
game itself.

## 0. The engine loads it

A mesh was taken out of BF3, exported to USD, scaled 2x there, written back through
`tools/usd/meshset.py`, built into a superbundle and mounted by a 40-line VEXT mod. The prediction
was registered before the run: the AABB should read `(-1.0, -0.002, -1.63) .. (1.01, 0.36, 1.65)`,
exactly twice the stock pallet.

```
USDRT SERVER AABB ServerStaticModelEntity min(-0.500, 0.000,-0.815) max(0.505,0.180,0.825)
USDRT CLIENT AABB ClientStaticModelEntity min(-1.000,-0.002,-1.630) max(1.010,0.360,1.650)
```

The client returned exactly the prediction. The server is an unplanned but perfect control: it does
not load render meshes, so it reports the stock pallet in the same run. **The engine consumed bytes
this toolchain wrote.**

Reproduce: `Admin/Mods/UsdRoundTrip/` (superbundle + `ext/Shared/__init__.lua`), add `UsdRoundTrip`
to `Admin/ModList.txt`, then `./.powos-e2e-run.sh usd_mesh_e2e.py` and read `USDRT` lines out of
`logs/server.log`.

Two traps cost a run each and are worth knowing:

- **`Timer` is not a VEXT global in this VU build.** `Timer:Simple(...)` throws
  *"attempt to index a nil value (global 'Timer')"*, which kills the enclosing event handler
  silently — the handler's earlier `print` still appears, so it looks like the callback ran and
  returned nothing. Accumulate on `Engine:Update` instead. MapEditor calls `Timer:Simple` in
  `GameObjectManager.lua`; those paths cannot be working either.
- **Client VEXT output reaches no readable log.** Relay to the server with `NetEvents:SendLocal`.
- MP_001's pallets are baked into the `StaticModelGroup`, so they are not entities and nothing can
  measure them. Spawn your own copy of the blueprint instead.

## Verdict

| direction | status |
|---|---|
| BF3 -> USD, geometry + placement + materials + textures | **works** |
| USD -> BF3, MeshSet resource bytes | **works**, byte-exact on 1199/1199 meshes |
| USD -> BF3, geometry chunk bytes | **works**, byte-exact on 147/147 chunks |
| USD -> BF3, edited geometry, same vertex/index counts | **works** through `replace_resource` |
| USD -> BF3, edited geometry, changed counts | **works** — `add_resource` meta argument, built and verified (§6) |
| USD -> BF3, brand-new mesh in a new partition | needs the same, plus MVDB synthesis (§6) |
| Loading any of it in game | **VERIFIED in game** — see §0 |
| Collision for new geometry | still blocked: Havok MOPP |

## 1. Reproducing it

```bash
pip install --user usd-core numpy
tools/usd/dump_corpus.sh /tmp/bf3corpus 1200 60     # needs RimeREPL + BF3 installed
tools/usd/roundtrip_test.py /tmp/bf3corpus
```

Result on this machine, over a seeded random sample of the game's 9794 MeshSets:

```
MeshSet parse -> serialize, byte-identical : 1199 / 1199
BF3 -> USD -> BF3, resource identical      : 1199 / 1199
BF3 -> USD -> BF3, chunk identical         : 147 / 147
```

The sample covers all three MeshSet types (827 rigid, 70 skinned, 302 composite) and all three
MeshLayout types (1697 / 210 / 848).

`tools/usd/meshset.py` is the resource codec, `tools/usd/geom.py` the vertex/index codec,
`tools/usd/bf3_usd.py` the USD bridge.

## 2. The relocation table — decoded

This was the blocking unknown. A MeshSet payload ends with a flat `uint32[]` holding the byte offset
of every **non-null** 64-bit pointer slot. Null pointers are absent. For
`objects/loadingpallet_01/loadingpallet_01_mesh` the 24 entries account for exactly:

```
  48,  56   MeshSetLayout.Lods[0..1]
  88,  96   MeshSetLayout.Name, ShortName
 120…168   MeshLayout[0].Subsets.ptr + CategorySubsetIndices[0..3].ptr
 224…240   MeshLayout[0].ShaderDebugName, Name, ShortName
 280…400   the same for MeshLayout[1]
 440, 588, 744, 892   the four MeshSubset.MaterialName pointers
```

2 + 2 + 8x2 + 4 = 24, exact. A one-LOD mesh lists slot 48 but not slot 56, because `Lods[1]` is null.

Entries are **not sorted**: they are emitted depth-first over the LODs — per LOD, `Subsets.ptr`, then
each subset's `MaterialName` and `BoneIndices`, then the four category pointers, then the name
strings, then the tail pointers — with the MeshSetLayout's own pointers last. The writer reproduces
that order, which is why the output is byte-identical rather than merely equivalent.

## 3. The resource meta — answered

The table's length is not recoverable from the payload; it comes from the **16-byte per-resource meta**
in the bundle manifest (`RimeLib.Content.Frostbite2_0/.../BundleManifest.cs:453`). For a MeshSet it is
four little-endian uint32s:

```
f0 = size of the MeshSet struct block      (where the data ends)
f1 = size of an inline geometry block      (0 for 9495 of 9794 meshes)
f2 = size of the relocation table IN BYTES (entries = f2/4)
f3 = 0x00940070                            (constant; meaning UNVERIFIED)
```

with `f0 + f1 + f2 == payload size` holding for **9794 / 9794** MeshSets in the game, and the table
always at `payloadSize - f2`. DxTextures carry all-zero meta (13017/13017); OccluderMesh is all-`FF`;
Havok resources use the four fields on a different scheme.

`meshset.py` computes this meta itself, and its output matched the shipped meta on every mesh tested.

## 4. Layout corrections to Rime's model

Rime reads MeshSets, but two details in its model are wrong in ways that only matter when writing.

**`MeshLayout` is 160 bytes when `Type == 0` (rigid) and 176 when `Type != 0`.** The three trailing
union pointers exist only in the larger form. Rime reads 176 unconditionally, so on every rigid LOD it
reads 16 bytes past the end into the next LOD. VERIFIED by measuring the LOD stride on 199 LOD pairs
across 109 meshes: 134 pairs at 160 (all Type 0, all `PartCount == 0`), 65 at 176 (Types 1 and 2, all
`PartCount > 0`). Clean separation, no overlap.

**Those three pointers are a union keyed on Type.** Type 1 (skinned) stores `BoneIndexArray` and
`BoneShortNameArray`, 4 bytes per part each, third pointer null. Type 2 (composite) stores
`PartBoundingBoxes` (32 B/part), `PartTransforms` (64 B/part) and `SubsetPartIndices` (24 B/subset).
Rime's field names carry both readings run together (`BoneIndexArrayPartBoundingBoxes`), which is what
gave it away.

Other layout facts the writer depends on, all measured:

- Blocks are 16-byte aligned. Order: MeshSetLayout, MeshLayouts, subset arrays, bone-index arrays,
  string pool, category index arrays, tail blobs, inline block, relocation table.
- Tail blobs align to their element: 16 for the composite float arrays, 4 for the skinned uint32
  arrays. That is why composite LODs show 8-byte gaps between them and skinned LODs pack tight.
- The string pool shares suffixes, but only structurally: `ShaderDebugName` is `"Mesh:" + Name`, and
  `ShortName` is a tail of `Name`, so the latter two are pointers into the former. Material names are
  always appended fresh — including empty ones, which each get their own NUL byte. A repeat of an
  earlier material name is *not* deduplicated.
- `RelocArray` is 12 bytes: `uint32 count` then `uint64 ptr`, unaligned. `MeshSubset` is 148 bytes,
  `GeometryDeclarationDesc` 76.

## 5. Geometry

The MeshSet holds only the layout. Geometry lives in a chunk named by `MeshLayout.DataChunkId`:

```
[ vertex block : VertexDataSize ][ index block : IndexDataSize ][ pad to 16 ]
```

VERIFIED: read that way, the pallet's Half3 positions reproduce the MeshSetLayout AABB exactly
(min `-0.5, 0.0, -0.815`, max `0.505, 0.18, 0.825`); read the other way round they saturate to ±1.
`Subset.VertexOffset` is a **byte** offset into the vertex block, `Subset.StartIndex` an **element**
offset into the index block, and each subset packs to its own declaration — the ZOnly subset is
typically position-only at stride 16 while the opaque one is stride 32.

The trailing pad is not always zero, so it is carried rather than regenerated.

Format coverage across the 1199-mesh sample is narrow, which is why the codec is small: **7 vertex
formats** (Float3, Half, Half2, Half3, Half4, UByte4, UByte4N), index buffer format **always** 16-bit,
primitive type **always** TriangleList. Two element usages have no name in Rime's enum (37, 50); they
round-trip under a generic name rather than being dropped.

## 6. What is still missing, precisely

Both gaps are in Rime's bundle-building commands, not in the format:

- **`add_resource` wrote zero meta — fixed, built and verified.**
  `ResourceFileReader.TryGetMeta` returned `false`, so `BundleManifestBuilder` defaulted to
  `new byte[16]` of zeros and any added MeshSet relocated nothing. The patch is
  `tools/usd/rime-add-resource-meta.patch` (an optional 32-hex-character `meta` argument). Verified
  by building the same bundle with and without it: the two `.sb` files differ in exactly 5 bytes, and
  the meta region reads `e0 04 00 00 00 00 00 00 60 00 00 00 70 00 94 00` with the argument against
  all zeros without it — precisely what `meshset.py` computes. **Rime is private: the patch is
  supplied as a file and the working tree was restored; it is not committed.**
- **`replace_resource` inherits the original meta** (`ReplaceResourceCommand.cs:41`). That is correct
  only while the new payload has the same `f0/f1/f2` — i.e. same LOD/subset/string shape. Edits that
  change vertex or index *counts* change those sizes and need the same plumbing.

Beyond Rime: **MVDB synthesis** for a mesh that has no entry (an entry is
`CtrRef<MeshAsset> Mesh` + `uint VariationAssetNameHash` + a material list; the MVDB is an EBX
partition, so `EbxWriter` already covers it), and **Havok MOPP** for collision, which is a Havok SDK
feature with no workaround.

## 7. `reference_existing_partition` — exercised, and it works

The 642-line command that nothing had ever called. Run on the pallet's blueprint it pulled the whole
closure and built a valid superbundle:

```
Closure of 'objects/loadingpallet_01/loadingpallet_01':
  +31 partition(s), +8 resource(s), +11 chunk(s), 0 already covered.
  4 mesh(es) added, with the textures their MeshVariationDatabase entries bind.
Bundle successfully built and added to superbundle!
```

Two things worth recording. It resolved an **MVDB index over 828 databases / 241612 entries** and bound
textures automatically. And the closure **did** pick up `..._physics_0_win32` (`HavokPhysicsData`) —
which `docs/dust2-port.md` had flagged as unverified. Kit-bashed props keep their collision.

Gotcha: `build_sb` lives in the base context. A `select_game` before it puts the REPL in the game
context and every bundle-building command answers *"Command not found"*.

```bash
cat > cmds.txt <<'EOF'
mount_game "/path/to/Battlefield 3" Frostbite2_0 true
build_sb Win32/UsdRoundTrip/Test Frostbite2_0 "/tmp/sbout"
build_bundle Win32/UsdRoundTrip/Test
reference_existing_partition objects/loadingpallet_01/loadingpallet_01 1
replace_resource objects/loadingpallet_01/loadingpallet_01_mesh 1 "/tmp/rt_pallet.meshset"
build
build
EOF
script -qfec "$HOME/Projects/Rime/bin/Release/RimeREPL cmds.txt" /dev/null
```

**The proof that the writer's output is indistinguishable in a real bundle:** building that superbundle
from the round-tripped bytes and from the game's own dumped bytes, through the identical code path,
produces **byte-identical `.sb` files** (922368 bytes). The `.toc` differs by a 16-byte field that
changes on every build regardless of content — build nondeterminism, not data.

Comparing against the *untouched* reference build instead differs by 432 bytes in one region, because
`reference_existing_partition` copies the original compressed blob verbatim while `replace_resource`
recompresses. Same content, different encoding. Likewise `add_chunk` writes raw bytes where the
referenced chunk was copied compressed — whether the engine accepts the raw form is **UNVERIFIED**.

## 8. Editing, not just echoing

A round trip that only reproduces its input proves the plumbing, not the point. Scaling every point by
2 in the USD and re-emitting:

```
edited resource: 1344 bytes (original 1344), meta (1248, 0, 96, 0x00940070)
AABB now (-1.0, -0.002, -1.63) .. (1.01, 0.36, 1.65)
re-decoded pos min/max [-1. 0. -1.63] [1.01 0.36 1.65]
```

Counts are unchanged, so the meta stays valid and `replace_resource` is legitimate; the superbundle
built without complaint. Editing *topology* is what trips the gap in §6.

## 9. What USD carries, and what rides along

Geometry and materials go into USD natively: `UsdGeomMesh` per subset with points, normals,
`primvars:st`, tangents and face indices, bound to a `UsdShadeMaterial` + `UsdPreviewSurface` whose
`UsdUVTexture` inputs come from the MeshVariationDatabase.

Frostbite scaffolding that USD has no home for — vertex element formats, strides, subset offsets, LOD
flags, chunk ids, category index arrays, the skinned/composite tail blobs, the chunk pad — rides in
`customData` on the prims. A DCC that ignores `customData` still opens the asset correctly; a DCC that
preserves it round-trips losslessly.

Every declared vertex usage is **also** written as a `bf3_<usage>` primvar at full component width.
That is what makes the trip lossless: `BinormalSign` has no USD equivalent and would otherwise be
silently zeroed on the way back. The standard `points`/`normals`/`st` attributes are what a DCC edits;
the `bf3_` primvars are authoritative on read where present.

| BF3 | USD |
|---|---|
| MeshSet LOD | `Scope` per LOD; `UsdGeomMesh` per subset |
| MeshSubset | one `UsdGeomMesh` (not `UsdGeomSubset` — subsets have their own vertex buffers) |
| MVDB material | `UsdShadeMaterial` + `UsdPreviewSurface` |
| variation hash | material variantSet; hash 0 = base |
| texture | `UsdUVTexture` — DDS is not portable, needs PNG/EXR |
| placements | `UsdGeomPointInstancer` — exact fit |
| skinned mesh | `UsdSkel` Skeleton + `primvars:skel:jointIndices`/`jointWeights` — **works**, §13 |
| AnimTrackData | time-sampled float attribute + Bezier tangents in customData — **works**, §14 |

## 10. Rime's own glTF exporter is still the lossy path

Unchanged and worth repeating, because it is easy to reach for by mistake.
`MeshConverter.ConvertToMeshBuilders` builds `MeshBuilder<VertexPosition, VertexTexture1>` and skips
the rest: LOD0 only, `Opaque` subsets only, 16-bit `TriangleList` only. Every cached GLB carries
`['POSITION','TEXCOORD_0']`, `skins: 0`, `images: 0`, and a **random** `baseColorFactor` per subset.
Normals, tangents, UV1+, vertex colours, bone indices/weights, LODs 1-4 and the transparent/decal/ZOnly
subsets are all discarded at the vertex loop.

`tools/usd/geom.py` does not go through that path; it decodes the chunk directly, which is why it keeps
everything.

## 11. Vehicles

Unchanged. A vehicle is a graph, not an asset: a `VehicleBlueprint` partition whose primary instance is
`VehicleEntityData` with components, plus several separate MeshSets assembled at runtime. USD can carry
the meshes, materials, part hierarchy and (once exported) the skeleton. It cannot carry the
component/entity/physics data — that travels as EBX JSON **alongside** the USD, never inside it. See
`docs/vehicle-edit-crash.md`: a blueprint's identity is its partition, so a runtime clone is the
primary instance of nothing.

## 12. Next

1. **Load it in game.** Everything above is offline. Mount the built superbundle with the ShellPool
   pattern (`ext/Shared/Modules/ShellPool.lua:80-130`) and confirm the pallet renders. Until this is
   done, "works" means "the bytes are right", not "the engine likes it".
2. **A `meta` argument on `add_resource`**, plus `replace_resource` recomputing it. Small, and it is
   what unlocks topology edits and new meshes.
3. **MVDB entry synthesis**, so a mesh with no shipped entry is not invisible.
4. **Placement sets** — `UsdGeomPointInstancer` out of `dump_level_placements`, back through the proven
   `add_json_partition` bake path. Nothing new is needed; it is wiring.
5. ~~**Skeletons / UsdSkel**~~ — done, §13.
6. **Ant clip -> UsdSkelAnimation**, blocked on the channel-to-joint mapping, §14.


## 13. Skinned assets: UsdSkel

A skinned MeshSet now exports as a real rig and comes back byte-identical.

### What was missing

The skinning data was always *carried* — `bones_per_vertex`, the per-subset bone palette, the
`BoneIndexArray`/`BoneShortNameArray` tail blobs, the `BoneIndices`/`BoneWeights` vertex elements —
but never *represented*. Nothing could pose a weapon in Blender.

The blocker was that **a skinned MeshSet does not name its skeleton**. Per LOD it carries
`BoneIndexArray` (skeleton indices) and `BoneShortNameArray` (`fb::hashQuickLowerCase` of the bone
names), and the engine binds those at runtime against whatever skeleton the entity is animated with.
So the skeleton has to be *identified by hash*, and the hash is a Frostbite detail that belongs in
Rime.

### `dump_skeleton` (new Rime command)

`RimeLib.Cmd/Commands/Game/DumpSkeletonCommand.cs`. Reads a `SkeletonAsset` EBX partition and emits
bone names, parent indices, the local (parent-relative) and model (accumulated) rest poses as 4x4
matrices, and `HashQuick` + `HashQuickLowerCase` of every name — computed by
`RimeLib.Frostbite.Utils`, never reimplemented in Python.

It reports `modelPoseMatchesLocalChain`, measured by accumulating `LocalPose` down `Hierarchy` and
comparing with `ModelPose`. **Measured over BF3's 121 SkeletonAsset partitions (3299 bones):
120 reproduce `ModelPose` with worst error exactly 0.** The one exception,
`animations/characters/sp/shared/objects/destruction/falling_highrise_skeleton`, is off by
2.15e-4 — the shipped data's own two pose arrays disagree at that precision, and that same skeleton
is also the worst rest-pose skinning drift below, so it is BF3's noise, not the pipeline's.

### The bone binding, decoded

| field | meaning |
|---|---|
| `MeshLayout.BoneIndexArray` (type 1 tail 0) | `uint32[PartCount]`, the skeleton index of each part |
| `MeshLayout.BoneShortNameArray` (type 1 tail 1) | `uint32[PartCount]`, `hashQuickLowerCase(boneName)` |
| `MeshSubset.bone_indices` | `ushort[BoneCount]`, a per-subset PALETTE of skeleton indices |
| vertex `BoneIndices` (usage 2, UByte4) | index into that palette — **not** a skeleton index |
| vertex `BoneWeights` (usage 4, UByte4N) | weights, ascending, dominant in slot 3 |

`BoneIndexArray` is the sorted union of the LOD's subset palettes. **Measured on the six weapon
meshes: 64/64 hashes resolve against `animations/skeletons/weapon/weaponske01`, and every
`BoneIndexArray` entry equals the skeleton index of the name whose hash sits beside it.**

Weights sum to exactly 1.0 on every subset read here — the `bones_per_vertex == 1` weapons and the
`== 4` characters alike — so `elementSize` is always 4 and the unused slots carry weight 0.

### What is written

`/Mesh` becomes a `UsdSkelRoot` (a `Xformable`, so level placements that reference it are
unaffected), with a `Skeleton` child carrying the full BF3 bone list in BF3 order — so a joint's USD
index *is* its BF3 skeleton index and no remapping table is needed. `bindTransforms` is `ModelPose`,
`restTransforms` is `LocalPose`, `geomBindTransform` is identity because the vertices are already in
model space. Each skinned subset gets `UsdSkelBindingAPI` with `primvars:skel:jointIndices` in
skeleton space (the palette applied) and `primvars:skel:jointWeights`.

### Measured

`tools/usd/skinned_roundtrip_test.py`, over **every skinned MeshSet under `characters/`,
`weapons/`, `vehicles/` and `animations/` — 535 of them**, verified with `compare_resources` against
the live mount:

```
skeleton identified       : 530 / 535
all bone hashes resolved  : 522 / 535
worst rest-pose skin drift: 4.88e-04   (271/535 exactly 0, 531/535 below 1e-5)
resource byte-identical   : 535 / 535
chunk    byte-identical   : 1632 / 1632
compare_resources         : 535 identical, 0 differs, metaIdentical 535/535
```

Non-skinned control, same harness, 278 rigid + 259 composite: **537/537 identical, meta 537/537.**
The UsdSkel work changed nothing that already worked.

Rest-pose skinning drift is UsdSkel's own `ComputeSkinnedPoints` evaluated at the rest pose and
compared with the exported points; at rest `jointWorld * inverse(bind)` is the identity, so a correct
rig moves nothing.

The 5 meshes with no skeleton and 8 with a partial match are ones whose `SkeletonAsset` is not among
the 128 partitions this sweep grepped for (`skeleton|ske\d+$|/rig$`) — the resolver's pool is
incomplete, not the mechanism.

### The binding is load-bearing, not decoration

A byte-identical round trip proves nothing about *which* primvar supplied the bytes. So: edit only
`primvars:skel:jointIndices`/`jointWeights` on `weapons/xp1_l96/l96_1p_mesh` subset0 and reload.
**30 chunk bytes changed, all 30 inside that subset's `BoneIndices`/`BoneWeights` fields, 0
elsewhere**, and a vertex given a 0.502/0.498 split reads back with exactly those weights. The
resource payload did not change, which is correct — the layout did not.

### The weapons, end to end

`weapons/xp1_l96/l96_1p_mesh` is the AWM: BF3 ships no weapon called "AWM", but the L96 (XP1, Back to
Karkand) *is* the Accuracy International AWM and its own material is named `L96AWM_main`.

| resource | LODs | subsets | bones | materials | textures |
|---|---|---|---|---|---|
| `weapons/xp1_l96/l96_1p_mesh` | 1 | 5 | 6/6 | L96AWM_main, Bullets, Blacktape_Base, Aimingdot | 3 |
| `weapons/xp1_l96/l96_3p_mesh` | 5 | 17 | 14/14 | + L96AWM_3p | 3 |
| `weapons/ak74m/ak74_1p_mesh` | 1 | 5 | 5/5 | AK74_Base, Bullets, Blacktape_Base, Aimdot_Base | 3 |
| `weapons/ak74m/ak74_3p_mesh` | 5 | 14 | 16/16 | + AK74_Base3P | 3 |
| `weapons/sv98/sv98_1p_mesh` | 1 | 4 | 6/6 | SV98_main, Bullets, Sightdots | — |
| `weapons/sv98/sv98_3p_mesh` | 5 | 12 | 17/17 | | — |

All six use `animations/skeletons/weapon/weaponske01` (25 bones); the parts they bind are
`Wep_Root`, `Wep_Trigger`, `Wep_Slide`, `Wep_Mag`, `Wep_Mag_Ammo` and (bolt-actions) `Wep_Physic1`.
Textures come from `weapon_shaderstateassets/<a>_mesh_<b>_mesh_win32/meshvariationdb_win32`.

Full export with geometry + materials + textures + skeleton, then re-emitted and compared against the
mount: **4/4 identical, 12/12 chunks, metaIdentical 4/4.**

```bash
tools/usd/export_usd.py res.bin out.usda chunks/ mvdb.json skeleton.json
```

## 14. Animation

### What Rime can read — measured

A new command, `dump_animation_bank`
(`RimeLib.Cmd/Commands/Game/DumpAnimationBankCommand.cs`), loads an `AntPackageAsset` partition's
bank and decodes its clips. Over **all 323 of BF3's `animations/antanimations/` partitions**:

```
banks loaded            : 321  (88 stream a chunk, 233 ship an AssetBank resource)
Ant objects parsed      : 71476
clips decode-checked    : 5204   failures: 0
DCT frames decompressed : 252677
bank load errors        : 0
```

Two fixes were needed to get there. A package is stored one of two ways: `PackagingType_Chunk`
streams a chunk named by `StreamingGuid`, everything else ships the bank as an `AssetBank`
**resource** — and that resource is named after the *partition*, not after `Win32FileName` (which
holds a source-tree path no resource answers to). A chunk-only reader sees 88 of 323 banks.

`Decompressor.Parse` printed its output with `Console.WriteLine` and returned nothing, so no caller
could ever consume a clip. It now delegates to a new `Decode` that returns `Vector4[frame][dof]`;
`Parse` prints what `Decode` returns, so the two cannot drift.

`FrameAnimationAsset` stores each **Vec3 padded to a vec4**. Measured on the weapon banks: 96 quats +
39 vec3 is 540 floats and `96*4 + 39*4 == 540`, while `96*4 + 39*3 == 501`. Same at 75 + 18 -> 372.

### Is the DCT decode correct?

Unit quaternion length proves nothing — `UnpackQuat` calls `Vector4.Normalize`. Three things that do
discriminate, over 11 clips of `animations/antanimations/xp1_l96`:

* **17979 / 17979** Vec3 DOF slots decode with `w` exactly `0.0`. A misaligned bit stream would put
  noise in the padding slot.
* Vec3 magnitudes: median 2.5 cm, p95 0.80 m, max 1.70 m — bone-offset scale for a human rig.
* Adjacent-frame quaternion dot over 43200 pairs: median 1.000000, only **1.27%** below 0.99. The
  motion is continuous; a broken decode is not.

### What blocks Ant clips from reaching USD

**The DOF order is not the skeleton bone order.** Clip quaternion counts (67, 96, 93, 21, 156, ...)
do not line up with skeleton bone counts; taken across every bank, only **441 of 2955** clips have a
quaternion count that even coincidentally equals some skeleton's bone count (14.9%, i.e. noise). The
mapping lives in `ChannelToDofAsset` (63 of them in the banks) plus the actor's joint-map templates,
which is a subsystem, not a lookup. `AntAnimationSetAsset` does carry an explicit `SkeletonAsset`
reference — verified: `nyrail_maincars_animset` -> `nyrail_maincars_skeleton`, 12 bones — so the
route exists; the channel indirection is the work.

**And the Ant writers throw.** `RimeLib.Animation/EA/Compression/DCT/Header.cs:40` and
`DofTable.cs:62` both end `Serialize` with `NotImplementedException`, as do
`EA/GenericData/Data.cs:48`, `Reflection.cs:49`, `EA/Reflection/EntryHeader.cs:76`,
`Archive.cs:54,76`, `Frostbite/PackageMeta.cs:52` and `ReflectionGeneralDataReader.cs:456`. Nothing
decoded from an Ant bank can currently be written back.

### AnimTrackData — the path that closes

`AnimTrackData` is the one Frostbite 2 animation format Rime reads *and* writes. It is a flat array
of 24-byte Bezier keys driving one scalar — `Time, Value, InTanX, InTanY, OutTanX, OutTanY` — and the
resource name says which scalar: `<partition>/animtrackdata/<guid>_<property>`.

`dump_anim_track_data` (new) dumps the keys and reports `reencodesExactly` by running Rime's own
writer over what it read. **Over every AnimTrackData in BF3: 1484 / 1484 re-encode byte-exactly,
434891 keys, every payload an exact multiple of 24 bytes.**

`tools/usd/animtrack.py` takes it to USD: a time-sampled `float` attribute (`bf3:trackValue`) with
the Bezier tangents in `customData`, because USD attributes are sampled, not splined, and writing
only the samples would flatten every curve in the game.

**BF3 -> USD -> BF3, all 1484 tracks, verified with `compare_resources`: 1484 identical, 0 differs.**
581 distinct animated properties. `metaIdentical` reads false on all of them because no `.meta`
sidecar was asserted — this codec computes no resource meta, unlike the MeshSet path — so the
payload verdict is the whole claim here.

Load-bearing check, same discipline as the skinning: move one USD time sample and **exactly 2 bytes
change, both in that key's `Value` field.**

## 15. Audio

Investigated, measured, not implemented — the write side does not exist to implement against.

### How weapon audio is referenced

`SoundWaveAsset` (EBX) -> `Variations` (`SoundWaveVariation`) -> `Segments`
(`SoundWaveVariationSegment` = `SamplesOffset`, `SeekTableOffset`, `SegmentLength`) into a chunk
listed by the asset. The chunk payload is an EA SndPlayer **Format1** stream: a chunk list whose
Header chunk is a `SndPlayerAssetHeader` (codec, sample rate, channels, play type) followed by Data
chunks of encoded samples.

The AK74M/SV98/L96 waves are `sound/weapons/handheld/{ak74,sv98,xp1_l96}/*_wave`. The
`weapon_<class>_<name>_02` partitions beside them are not `SoundWaveAsset`s — they are the sound
graph that references them.

### `dump_sound_wave` (new Rime command)

Reports each variation, its chunk, and every segment's SndPlayer header. Over a 1136-partition sample
of BF3's 8989 `sound/` partitions:

```
SoundWaveAssets read      : 786
variations                : 7658
segments                  : 3622   headers parsed: 3622 (100%)   errors: 0
codecs                    : XaSeekable1 = 3622   (100%)
decodable by RimeLib.Audio: 3622 / 3622
sample rates              : 48000 x3498, 16000 x93, 44100 x31
channels                  : 1 x2772, 2 x507, 4 x341, 6 x1, 8 x1
```

All nine weapon waves parse, all XaSeekable1.

One caveat, flagged in the command's own JSON as `variationsResolvedPositionally`: `CtrRef.Get()`
resolves through the process-wide `PartitionRegistry`, which nothing in the command layer populates,
so every variation reference returns null and the asset reads as having zero variations. The
fallback walks the partition's own `SoundWaveVariation` instances **in order**. That is positional,
not guid-matched, and where an asset has several variations the ordering is unverified.

### What it would take

`RimeLib.Audio` decodes exactly one codec (`Xas1.DecodeChannel`, XaSeekable1) — which the measurement
says is *every* codec BF3 actually ships, so decoding to WAV is reachable today; `Utils/AudioExtractor`
already does it, apart from a hardcoded output path and a missing seek-table parser.

Encoding is not. **Every `Serialize` on the audio side throws `NotImplementedException`**:
`RimeLib.Audio/EA/Audio/SndPlayerAssetHeader.cs:67`, `Format1/ChunkHeader.cs:39`,
`Layer3/EALayer3Header.cs:60`, `Layer3/EaLayer32Block.cs:78`. There is no XAS *encoder* at all.

So the practical plan, in the order the value lands:

1. **Audio travels as opaque chunks.** The `SoundWaveAsset` is EBX, which Rime already writes; the
   samples are a chunk, which `add_existing_chunk` already ships. A ported weapon can carry its
   original sounds *today* with no codec work — nothing needs to decode them.
2. **Decode to WAV for authoring.** A `dump_sound_wave_audio` command reusing `Xas1` +
   `RimeLib.Audio.WaveFile`, output beside the USD, referenced from it. Bounded work; the decoder
   exists.
3. **Encode**: write an XAS encoder plus the four `Serialize` bodies. Only this makes *edited* audio
   shippable, and it is much larger than the other two put together.
