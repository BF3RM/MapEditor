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
| `MeshVariationDatabaseEntry.VariationAssetNameHash` | a hash naming a variation stored in a DIFFERENT partition | **2,323 of 2,353** resolve |

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

## What this does NOT cover

- **Names that exist only in the executable.** Frostbite's compiled reflection holds a property,
  event and cvar name for every type the engine knows, whether or not BF3 instantiates it. Only
  types actually present in shipped EBX contribute here, which is why the type/field table is
  9,422 names and not the engine's full set. Scanning `bf3.exe` for ASCII would add them and would
  also add garbage with invented boundaries, which is the failure mode this table exists to avoid.
- **Names generated at runtime.** Anything a script or the engine concatenates before hashing was
  never a string in the shipped data.
- **Nothing is decoded from resources other than the Ant banks.** MeshSet, Havok and shaderdb
  payloads are not string-mined; the asset, mesh, material and shader NAMES they correspond to come
  from EBX and are covered, but any purely internal name in those blobs is not.
- **`ToLowerInvariant` is exact only for ASCII.** 288 of 251,195 names are not ASCII; for those the
  lowercase column uses Python's `str.lower()`, which .NET does not guarantee to match.
- **BF3 only.** The dump command is registered for engines with an `IPartitionConverter` and the
  EBX header layout it parses is Frostbite 2.0's. Other titles need their own run.
