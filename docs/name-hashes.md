# Frostbite name hashes: a reverse table built only from names BF3 contains

`fb::hashQuick` is a 32-bit FNV variant (basis `0x1505`, prime `0x21`) and `fb::hashQuickLowerCase`
is the same function over the lowercased string. Both are one-way. Every public BF3 hash list is
therefore a dictionary attack: someone guessed a name, hashed it, and published the pair if it
matched something they had seen. The guesses that matched nothing still ship in those lists, and a
wrong name in a hash table is worse than a missing one, because nothing downstream can tell.

This does the opposite. It enumerates the strings BF3 itself stores and hashes those. An entry it
produces cannot be a name BF3 does not contain, so the only open questions are COVERAGE and
COLLISIONS, and both are numbers below.

Built 2026-09-06 against the retail BF3 install (all superbundles, one full mount).

## What it is

    tools/hashes/build_hash_table.py       regenerates the table from a Rime dump
    tools/hashes/resolve.py                looks a hash up (hex / unsigned / signed int32)
    tools/hashes/bf3_name_hashes.tsv.gz    the table: 404,486 rows, 251,195 distinct names
    tools/hashes/bf3_name_hash_collisions.tsv
    tools/hashes/bf3_name_hashes_summary.json

Row format is `hash <tab> fn <tab> name <tab> sources`, sorted by hash. `fn` says which function
produces that hash for that name: `quick` = `fb::hashQuick` only, `lower` =
`fb::hashQuickLowerCase` only, `both` = the name is already lowercase and the two agree. A lookup
for a `hashQuickLowerCase` value must accept rows marked `lower` or `both`.

Regenerating it needs one full mount and takes about four minutes:

    # commands.txt
    mount_game "<BF3 path>" Frostbite2_0 true
    select_game 1
    dump_name_sources /tmp/bf3_names 0

    ~/.dotnet/dotnet bin/Release/RimeREPL.dll commands.txt
    python3 tools/hashes/build_hash_table.py /tmp/bf3_names --out tools/hashes --gzip \
        --compare WebUI/src/data/assetHashes.json --compare WebUI/src/data/eventHashes.json

`dump_name_sources` is `RimeLib.Cmd/Commands/Game/DumpNameSourcesCommand.cs`. It writes one file
per source and never merges them, because which source a name came from is what makes the table
auditable.

## Where the names come from

Every count is what the dump wrote, and `build_hash_table.py` refuses to run if a file disagrees
with the dumper's own `summary.json` — a truncated source is otherwise invisible.

    partition names            73,371
    resource names             41,278
    EBX value strings         120,991    string FIELDS inside instances
    Ant names                  30,485    object, joint and DOF-slot names in the animation banks
    EBX type/field names        9,422    the reflection tables of all 73,371 partitions
    bundle names                1,159
    superbundle names              64
    dbx partitions                  0    BF3 ships none
    ----------------------------------
    distinct names            251,195    (sources overlap; 288 are non-ASCII)
    distinct hashQuick hashes 251,183
    distinct lowercase hashes 172,012

Chunk ids are also dumped (61,101) but they are GUIDs, not names, so nothing is hashed from them.

**The value string table is the source a partition listing misses, and it is the biggest one after
the partition names.** Asset names, mesh names, texture names, sound names, shader names and
localisation text are all `CString` fields, and a `CString` field is an offset into the partition's
string table. That table is read here directly from the bytes rather than through Rime's partition
converter, because the converter needs a generated `fb::` class for every type a partition holds
and throws when one is missing — which would silently skip whole directories of the game. Reading
the header, the type string table and the value string table instead covers **73,371 of 73,371
partitions, 0 failed, 0 big-endian**.

Ant names are not in EBX at all. They live in the `AssetBank` blob, so no amount of partition or
resource listing finds them: **322 of 323 banks loaded, 71,485 Ant objects, 30,485 names**. The one
that does not load is named in `ant_failures.tsv` -- it is `animations/antanimations`, the root
package, which streams neither a chunk nor a resource and holds no bank at all. Failures are named
rather than only counted, because "322 of 323" is not checkable otherwise.

## The proof: hashes BF3 states itself

Row counts prove nothing. What matters is whether the table answers a hash the game actually
writes down. Four places do:

| ground truth | what it is | result |
|---|---|---|
| `fb::ObjectVariation` | `Asset.Name` and `NameHash` on the SAME instance | **2,326 of 2,326** resolve, each to exactly one name, and to the same string in the same case |
| EBX type/field descriptors | each stores `hashQuick(name)` beside the table holding the name | **9,422 of 9,422** distinct hashes resolve, over **6,169,691** statements |
| non-cas chunk entries | `AssetNameHash` of the asset the chunk belongs to, with no name beside it | **13,660 of 13,660** resolve |
| `MeshVariationDatabaseEntry.VariationAssetNameHash` | a hash naming a variation stored in a DIFFERENT partition | **2,323 of 2,353** against shipped `ObjectVariation` alone; **~99.9%** against the FULL table |

The last row is the case a reverse table exists for — hash here, name over there — and the 30 that
do not resolve are not a gap in the table. They are exactly the MVDB hashes with no matching
`ObjectVariation` anywhere in the game: 2,323 of the 2,353 are covered by a shipped
`ObjectVariation` instance and the other 30 are covered by none, so the MVDB references
variations BF3 does not ship. No name exists to find.

**Which function is which was measured, not assumed.** `ObjectVariation.NameHash` matches
`hashQuickLowerCase` on 2,326 of 2,326 instances and `hashQuick` on 2 — and those 2 are names that
are already lowercase, where the two functions agree. EBX descriptor and chunk asset hashes are
`hashQuick`; for the chunk hashes all 13,660 names happen to be lowercase already, so they resolve
under either.

## It reproduces

Two independent full mounts were run and the dumps compared. The files differ byte for byte
because a `HashSet` does not iterate in a fixed order, but every source file holds the SAME SET of
names -- `partitions`, `resources`, `ebx_value_strings`, `ebx_type_strings`, `ant_names`,
`gt_objectvariation` and `gt_ebx_descriptor_hashes` all compare equal after a sort. The table is
sorted before it is written, so the finished artifact is **byte-identical between the two runs**
(`bf3_name_hashes.tsv` md5 `fb40743242a177b81da163d378978e6d` both times), as is the collisions
file.

## Collisions

**17 hashes in BF3 have two distinct names.** 12 under `hashQuick`, 5 under `hashQuickLowerCase`.
All 17 are in `bf3_name_hash_collisions.tsv` with both names; neither is dropped. Examples:

    00596E31  lower  au / g3
    0B87541C  lower  id4 / ifv
    12758F90  quick  Localization/us_loc
                   / sound/levels/xp5_riverside/ambients/xp5_bigworld_riverside_twigsnaprustle_01

That is in line with what 32-bit FNV over 251,195 names should give (n²/2³³ ≈ 7). Counting them
correctly needs care: `Foo` and `foo` are two rows and two distinct `hashQuick` inputs but the SAME
input to `hashQuickLowerCase`. Treating them as colliding reported 79,158 lowercase collisions
where BF3 has 5.

## Audit of the lists this repo already ships

`build_hash_table.py --compare` checks a published `hash -> name` JSON two ways: does the name
reproduce its own key under either function, and does BF3 contain that name at all.

    WebUI/src/data/assetHashes.json   23,055 entries
        523    the name does not hash to its own key under EITHER function
        22,531 the hash is in this table -- and all 22,531 agree, 0 disagree
        1      reproduces its key but the name is not in BF3's data

    WebUI/src/data/eventHashes.json   19,704 entries
        0      unreproducible
        13,000 the hash is in this table -- 12,998 agree
        2      "disagree", and both are the genuine collisions 3p/12 and 1p/32
        6,704  the hash is not in this table at all

So where the two overlap they agree completely; the disagreements are collisions, not errors. The
6,704 event hashes this table cannot reach are engine reflection names — `HbaoStepCount`,
`XenonDrawDebugLightTileGridMode`, and a run of Need for Speed names (`OnBustedRacer`,
`OnRacerWreckingCop`) that are not BF3's at all. Which is the point: a data-derived table stops
where the data stops, instead of quietly carrying another game's names.

## Which integer fields are name hashes, measured over all 531 of them

Frostbite stores name hashes in fields that mostly do not say "hash", and there is no list of them.
`dump_int_fields` reads every 32-bit integer field of every instance in all 73,371 partitions --
including the ones nested inside structs and inside arrays of structs, which is where the
connection tables live -- and groups the values by the type and field that declares them: **531
field keys, 166,102 distinct values, 73,371 of 73,371 partitions read, 0 failed, 0 truncated**.

The detector is the resolution rate against this table. A field that really holds a name hash
resolves at or near 100%; a packed bitfield, an index or a size resolves at ~0%, because its values
are small integers no name produces. Zero is excluded from the rate: it is every hash field's
"none" (MVDB writes 0 for the base appearance) and `hashQuick` never returns it.

Of **462 fields with at least one non-zero value, 19 are name hashes (rate >= 0.90), 7 are partial,
and 436 resolve below 10% and are not name hashes.** Full scoring in `bf3_hash_fields.tsv`. The 19:

    rate  distinct  field
    1.000     9794  MeshAsset.NameHash
    1.000     6517  SoundDataAsset.NameHash
    1.000     3436  UnlockAssetBase.Identifier
    1.000     2326  ObjectVariation.NameHash
    1.000     1897  BasicUnlockInfo.Identifier
    1.000      321  InstanceOutputNode.Id
    1.000      318  ModelAnimationEntityData.JointOutputPropertyIds[]
    1.000      210  WeaponStateData.ReferencedAssetHashes[]
    1.000      198  WeaponSocketObjectData.ReferencedAssetHashes[]
    1.000      178  ActionNode.ActionKey
    1.000       95  StatsCategoryWeaponData.SoldierWeaponId
    1.000       47  OutputNodeData.OutputNameHash
    1.000        8  AudioLanguageSetting.NameHash
    1.000        3  StreamPoolAsset.StreamPoolId
    0.999     1512  FaceAnimationWaveMapping.WaveNameHash
    0.995      201  WeaponComponentData.WeaponItemHash
    0.987     2353  MeshVariationDatabaseEntry.VariationAssetNameHash
    0.970      986  StaticModelGroupMemberData.InstanceObjectVariation[]
    0.952     1937  UIItemDescription.ItemIds[]

Together they make **32,337 hash references over 324,527 occurrences, of which the table resolves
32,181 -- 99.52%**. The 156 unresolved slots are 126 distinct hashes, of which 7 were then recovered
by search (below), leaving **119**.

The 0% results are as informative as the 100% ones, and a blanket "resolve every integer" would
have produced a name for every one of them: `MaterialContainerPair.FlagsAndIndex` (32,399 distinct,
a packed bitfield), `SoundWaveVariationSegment.SamplesOffset` (35,903), `IndexRange.First`/`.Last`,
`SoundDataChunk.ChunkSize`, `UIDataSourceInfo.DataKey` (1,073), and `AntRef.AssetId` (483, 0.2% --
Ant ids come from AntGuids, not from names).

The seven partial fields are partial because their names are not in the shipped data, not because
the corpus is short: `SoldierWeaponUnlockAsset.WeaponIdentifier` 57.2% (103/180),
`StatsCategoryVehicleData.FirstVehicleId` 30.6% (15/49), `AudioGraphParameter.NameHash` 23.5%
(67/285), `SoundPatchConfigurationAssetEntry.NameHash` 20.0%, `PropertyConnection.TargetFieldId`
17.5%, `VehicleHudData.VehicleItemHash` 15.2% (16/105), `WaypointData.SchematicsNameHash` 12.8%
(30/234). Widening the corpus from a level closure to the whole game moved WeaponIdentifier from
54% to 57.2% and FirstVehicleId from 30% to 30.6% -- so those names are not merely out of closure.

## Where event hashes live, and why data cannot resolve them

They are in EBX, in nine fields, every one of them nested inside an array of structs -- which is why
a scan of top-level instance fields finds no event id at all:

    field                              distinct   this table    eventHashes.json
    EventSpec.Id                           8028   511 ( 6.4%)   1469 (18.3%)
    DynamicEvent.Id                        6032   174 ( 2.9%)    693 (11.5%)
    PropertyConnection.SourceFieldId       5132   443 ( 8.6%)    424 ( 8.3%)
    DataField.Id                           4748   167 ( 3.5%)    260 ( 5.5%)
    PropertyConnection.TargetFieldId       1505   264 (17.5%)    394 (26.2%)
    LinkConnection.TargetFieldId           1073    60 ( 5.6%)    155 (14.4%)
    LinkConnection.SourceFieldId           1029    77 ( 7.5%)    186 (18.1%)
    DynamicLink.Id                          969    48 ( 5.0%)    127 (13.1%)
    PropertyTrackData.Id                    703    49 ( 7.0%)     90 (12.8%)

**16,727 distinct hashes across those fields. This table names 3,128 of them, `eventHashes.json`
names 2,603.** Conversely, **17,101 of that file's 19,704 entries are never referenced by any of
these fields anywhere in BF3.**

The low rate is not a corpus gap, and BF3's own descriptor tables settle it rather than Rime's
generated classes (`bf3_type_layouts.tsv.gz`, 1,564 types as the shipped data declares them):

    EventSpec           Id Int32
    DynamicEvent        Id Int32
    DynamicLink         Id Int32
    PropertyConnection  Source Class / SourceFieldId Int32 / Target Class / TargetFieldId Int32
    LinkConnection      Source Class / SourceFieldId Int32 / Target Class / TargetFieldId Int32

`EventSpec`, `DynamicEvent` and `DynamicLink` persist exactly one field and it is the id. The name
is compiled away when the schematic is baked, so it is in no partition under any name. Hashing
Rime's 7,418 generated `fb::` property names -- which model only the persisted types -- resolves
1.0% of `EventSpec.Id`, so those are not the missing names either. Closing the rest needs
Frostbite's compiled reflection out of `bf3.exe`, which is outside what a data-derived table can
honestly claim.

## Recovering names by search, and the false-positive arithmetic

A hash match is self-verifying: `hashQuickLowerCase(candidate) == target` proves the candidate is a
preimage. What is not free is the false-positive rate. Over a 32-bit hash, N candidate-target tests
yield N/2^32 spurious preimages on average, so a large enough search hands every target a plausible
wrong name. `crack.py` prints its exact test count with every run, builds candidates only out of
strings BF3 already contains, and was calibrated against a control of random hashes.

**The wide search is exactly as unreliable as predicted.** Mutating every digit run of every corpus
name (67,782,609 candidates) against the 126 unresolved targets is 8.5e9 tests, expecting 1.989
false hits. It returned five names for four targets: three real ones and two chimeras --
`id_dt_d_dta436_reconservicestar25` (DTA436 is inside BF3's 001-501 dogtag numbering, but
`RECONSERVICESTAR25` is DTA079's descriptor and no `DTA436` string appears anywhere) and
`co10_70_sc90_01_coop_player2` (a coop animation name, offered for an MVDB variation hash). Two
predicted, two observed.

**The context-restricted search is evidence.** An MVDB hash arrives with the mesh that references
it, so donors can be limited to that mesh's own directory. Digit mutation inside the context
directory (587,520 tests) plus final-token substitution inside it (59,559,500 tests) is
**60,147,020 tests, expected 0.0140 false hits**, and a control of 126 random hashes over the same
generators produced **0**. It recovered **7 of the 126**, each a directory sibling of the very asset
that references it:

    3337905D  architecture/me_storefronts/me_storefront_twoopening_irag02_wet
    5E5CA06C  levels/xp4_financialdistrict/objects/escalator_01/escalator_01_ov
    615E8C65  xp_raw/props/metalawening/metalawening_02_orange
    661F13B6  objects/sprinkler_01/sprinkler_01_short_black
    7F667ADA  props/streetprops/me_storesignset_01/me_storesignset_01_512x192_v3
    BE452C2C  architecture/me_storefronts/me_storefront_windows_iraq02_wet
    F60C7C45  architecture/me_storefronts/me_storefront_wall_iraq02_wet

(`irag` is BF3's own typo; the donor `me_storefront_twoopening_irag02_inside` ships with it.)

The trap is real and worth recording: `BE452C2C` is referenced by `..._windows_iraq01_wet_mesh` and
its name is `..._iraq02_wet`. Cross-references are normal, so a search keyed to the referencing
asset's OWN number finds nothing; what works is the directory, not the number.

These seven live in `bf3_name_hashes_recovered.tsv` and are deliberately NOT merged into
`bf3_name_hashes.tsv`. The table's guarantee is that every row is a string BF3 contains. A recovered
name is a proven preimage but not a shipped string, and mixing the two would spend that guarantee
on 7 rows out of 404,486.

## What this does NOT cover

- **Names that exist only in the executable.** Frostbite's compiled reflection holds a property,
  event and cvar name for every type the engine knows, whether or not BF3 instantiates it. Only
  types actually present in shipped EBX contribute here, which is why the type/field table is
  9,422 names and not the engine's full set. Scanning `bf3.exe` for ASCII would add them and would
  also add garbage with invented boundaries, which is the failure mode this table exists to avoid.
- **Event, property and link connection names.** Measured above: 16,727 distinct ids across nine
  EBX fields, of which this table names 3,128. `EventSpec`, `DynamicEvent` and `DynamicLink`
  persist only the id, so the names are not recoverable from data at any corpus size.
- **Names generated at runtime.** Anything a script or the engine concatenates before hashing was
  never a string in the shipped data.
- **Nothing is decoded from resources other than the Ant banks.** MeshSet, Havok and shaderdb
  payloads are not string-mined; the asset, mesh, material and shader NAMES they correspond to come
  from EBX and are covered, but any purely internal name in those blobs is not.
- **`ToLowerInvariant` is exact only for ASCII.** 288 of 251,195 names are not ASCII; for those the
  lowercase column uses Python's `str.lower()`, which .NET does not guarantee to match.
- **BF3 only.** The dump command is registered for engines with an `IPartitionConverter` and the
  EBX header layout it parses is Frostbite 2.0's. Other titles need their own run.


## The MVDB misses are almost all resolvable after all (2026-09-06)

The 2,353-entry check above resolves against shipped `ObjectVariation` instances only. Resolving
against the WHOLE table -- which includes names harvested from EBX value strings -- does far better.
On a 74-hash sample that the narrow check called unresolved, **72 resolve**, to real names:

    Props/Vehicles/CivilianCar_04/CivilianCar_04_Red
    Props/StreetProps/SupplyCase_01/SupplyCase_01_Desert
    Architecture/ME_StorefrontsAddons/ME_StorefrontsRoof_01_Shiny
    XP_Raw/Props/StoreSigns_01/StoreSign_Medium_01_i / _h / _j / _k

So "the name does not exist" was wrong: the names exist in the game's strings, just not as shipped
variation instances.

**One of the last 2 has since fallen; the other has not.**
`me_storefront_windows_iraq01_wet_mesh`'s hash `BE452C2C` is
`architecture/me_storefronts/me_storefront_windows_iraq02_wet`, found by mutating digit runs inside
the mesh's own directory (see the search section above) -- the referencing mesh is `iraq01` and the
variation is `iraq02`, so a search keyed to the mesh's own number could not reach it.
`D3D8AB4B`, on `architecture/me_highrise_backdrop_01/me_highrise_backdrop_01_wet_mesh`, survived
both the trailing-token sweep and the 60,147,020-test context search, and is still unresolved.

Against the whole-game table the narrow ObjectVariation check's 30 misses stand at **119 distinct
unresolved hashes across all 19 hash fields**, 7 of them recovered by search.

They are vestigial entries: an MVDB row naming a variation the game does not define. Inventing a
plausible name would put an unverifiable row into the table -- the exact defect that leaves 523
self-inconsistent entries in the public `assetHashes.json`.
