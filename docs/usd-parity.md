# BF3 <-> USD parity: living status

What round-trips today, what does not, and the measurement behind each claim. Every number here
came from a run; anything unmeasured says so. Updated as work lands.

Last updated: 2026-09-06.

## A mod now MODIFIES a level BF3 ships, and the order decides what wins (2026-09-06)

**Update-in-place is no longer unproven.** A mod with its own superbundle, booted against STOCK
`MP_001` in the isolated instance, changed both an EBX partition and a resource that BF3 itself
ships -- and the engine reported the edited values, predicted before the run:

    control   name=Objects/LoadingPallet_01/LoadingPallet_01
              trans(0.000,0.000,0.000)  aabb min(-0.500,0.000,-0.815) max(0.505,0.180,0.825)
              usdpatch/loadingpallet_01 -> NOT_FOUND

    patched   name=USDPATCH_EDIT_OK_C
              trans(12.500,34.250,56.750)  aabb min(-7.500,-2.250,-6.750) max(8.375,3.125,9.500)

Nothing in BF3 contains the string `USDPATCH_EDIT_OK_C`, `(12.5, 34.25, 56.75)` is the vector this
toolchain wrote into `StaticModelEntityData.Transform.trans`, and the AABB is the `LocalAabbs[0]`
this toolchain wrote into the object's `HavokPhysicsData`. The engine BUILT AN ENTITY from our
bytes on a map we did not build, and the level loaded.

### The finding: partitions resolve FIRST-wins, resources LAST-wins

Every previous attempt prepended one bundle, because the working precedent (`UsdRoundTrip`) does.
That is right for half the problem and silently wrong for the other half. The same superbundle, the
same bundle, only its POSITION in `ResourceManager:LoadBundles` changed:

| bundle position | EBX partition under the game's name | resource under the game's name |
|---|---|---|
| **PREPENDED** | **WINS** -- `name=USDPATCH_EDIT_OK_C`, `trans(12.500,34.250,56.750)` | LOSES -- `aabb min(-0.500,0.000,-0.815)` |
| **APPENDED** | LOSES -- stock name, `trans(0.000,0.000,0.000)` | **WINS** -- `aabb min(-7.500,-2.250,-6.750) max(8.375,3.125,9.500)` |

Four boots, one variable. That is why "partitions never shadow" was recorded as a law here: the
partition experiments that failed were resource-shaped, and the one arrangement that works for a
partition is the one that cannot work for a resource.

**The complete recipe is TWO bundles in one superbundle**, one at each end of the list -- which also
respects the standing rule that a bundle requested twice wedges the load, because neither is:

    local s_New = { PART_BUNDLE }
    for _, l_B in ipairs(p_Bundles) do s_New[#s_New + 1] = l_B end
    s_New[#s_New + 1] = RES_BUNDLE
    p_Hook:Pass(s_New, p_Compartment)

Booted that way against stock `MP_001`, BOTH edits land in one run: `name=USDPATCH_EDIT_OK_C`,
`trans(12.500,34.250,56.750)`, `aabb min(-7.500,-2.250,-6.750) max(8.375,3.125,9.500)`. The
superbundle is 9,504 bytes of `.sb` and 843 of `.toc` -- an update-in-place mod does not carry the
level.

### What was measured, run by run

All against stock `MP_001` (`MP_001 ConquestLarge0 1`) in the ISOLATED instance, one mod in
`ModList.txt` per run, harness `/tmp/t1_boot.sh`:

| run | bundle carries | position | verdict | engine reported |
|---|---|---|---|---|
| base | nothing | -- | LOADED | stock name, `usdpatch/loadingpallet_01` NOT_FOUND |
| B | partition under a NEW name | prepend | LOADED | `usdpatch/loadingpallet_01` -> ObjectBlueprint `USDPATCH_EDIT_OK_B` |
| A | partition under BF3's name | prepend | LOADED | `name=USDPATCH_EDIT_OK_A` |
| C | same + edited transform | prepend | LOADED | `name=USDPATCH_EDIT_OK_C`, `trans(12.500,34.250,56.750)` |
| Capp | same | append | LOADED | stock name, `trans(0.000,0.000,0.000)` |
| P | `HavokPhysicsData` resource | prepend | LOADED | stock aabb |
| Papp | same resource | append | LOADED | `aabb min(-7.500,-2.250,-6.750) max(8.375,3.125,9.500)` |
| X | both, two bundles | prepend + append | LOADED | both, in one boot |

**The additive case matters on its own.** Run B ships a partition under a name BF3 has never heard
of and the engine resolves it -- new EBX delivered into a shipped level. The baseline says
NOT_FOUND for the same name, so this is content, not a lookup that would have succeeded anyway.

### What the mesh run does NOT show

An earlier run overrode the `MeshSet` resource with an edited bounding box and the spawned entity's
AABB did not move. That is **not** evidence about `MeshSet`: the AABB the server reports is
`LocalAabbs[0]` of the object's `HavokPhysicsData`, `[-0.5, 0.0, -0.815, 0.505, 0.18, 0.825]`, byte
for byte what the engine printed -- while the `MeshSet` header's own box is
`(-0.5, -0.0011, -0.815)`, whose `-0.0011` never appears. The probe was reading a number the
`MeshSet` does not own. It was also prepended, which is now known to be the losing order for a
resource. Whether a dedicated server reads `MeshSet` at all is still unmeasured.

### The build side

`replace_resource <name> <id> <file>` is the right tool and was not being used: it keeps the
original resource's TYPE, META and id and swaps only the payload, so an override does not have to
guess a meta. It reported the real ones -- `MeshSet E0040000000000006000000070009400`,
`HavokPhysicsData 80000000900500008006000058010000` -- where hand-written `add_resource` calls had
been carrying a literal.

Content was verified before any boot, out of the BUILT superbundle rather than from the file that
went in: `mount_standalone_sb` on our own `.sb`, then `dump_resource` / `dump_partition_json`.
The partition read back with `Name = USDPATCH_EDIT_OK_B`; the edited 6,997-byte Enlighten payload
and the edited 1,344-byte `MeshSet` read back sha256-identical to what was written.

## An edited Enlighten bake is in a built level, byte for byte, and the level boots (2026-09-06)

The bake round-tripped through USD with 0 changed bytes months of work ago; what had never happened
was putting an EDITED one back into a built level's superbundle. `tools/usd/enlighten_inject_test.py`
does it, and the edit is made IN USD -- on the stage's own `bf3:payload` attribute, with the stage
saved to disk and REOPENED before anything is read back, so nothing measured here lived only in
memory:

    level        mp_001
    source       162 resource(s), 377,036 payload byte(s)
    authored     162 resource(s)   {databases 1, probeSets 159, staticDatabases 1, shaderDatabases 1}
    edit         levels/mp_001/mp_001/enlighten/shaderdatabase
                 189 material(s); material 0 colour (0.782,0.782,0.782) -> (0.125,0.25,0.375)
    readback     162 resource(s), 377,036 payload byte(s)
    identical    161 of 162
    changed      1, by exactly 12 bytes, first at offset 4
    meta         162 of 162 carry one
    RESULT       PASS

The change count is the guard that matters. A writer that quietly handed back the source bytes
would report 162 identical and 0 changed, which is what "0 changed" looks like when it means
nothing; this refuses unless exactly one payload changed, by exactly the 12 bytes of one Vec3, at
the offset the format puts the first material's colour.

**Built into a level, and read back out of it.** All 162 were added to the `usdlevel` bundle of the
standalone `REALITYMOD` build (renamed `levels/mp_001/` -> `levels/realitymod/`), against a control
build differing only in those lines:

    control    bundles=8  errors=1 (the known rugpile_01_n)  sb=56,007,312   RESULT LOADED
    injected   bundles=8  errors=1 (the known rugpile_01_n)  sb=56,251,200   RESULT LOADED
    delta      +243,888 bytes of superbundle for 377,036 bytes of payload

Then `mount_standalone_sb` on that 56,251,200-byte superbundle and `dump_resource` on all 162:

    out of the BUILT level superbundle   162 / 162 byte-identical, 377,036 / 377,036 bytes
    the edited one                       material 0 colour reads back (0.125, 0.25, 0.375)

That is Rime's own mounter reading our level's own bundle, so "the payload is in there" is not an
inference from a size delta.

**It also overrides a stock level.** The same edited resource, shipped as a mod bundle against stock
`MP_001`, loads.

**What this does NOT show, with the measurement.** A DELIBERATELY CORRUPT shader database -- the
material count set to 65,535 against a 6,997-byte payload, so any reader walking it runs off the
end -- was shipped in the winning (APPENDED) order and the level **still loaded**. A dedicated
server does not read the Enlighten bake, so booting it is acceptance of the container, not evidence
that the engine consumed the payload. Confirming an edited bake looks different needs a client and
an eye, and that was not done.

## The closure is DEAD WEIGHT, and the client freeze has two named causes (2026-09-06)

### The closure buys nothing: 49.4 MB of every 61.9 MB

`mp_001`, 6,199 placements, on the host superbundle that now registers teams, built twice --
identical except that the second drops all 10,396 `/tmp/closure/*.json` partitions:

| mp_001 | with closure | WITHOUT closure |
|---|---|---|
| build commands | 13,078 | 2,682 |
| superbundle | 61,924,317 B | **12,529,621 B** |
| distinct "could not find a valid variant" | 476 | **476** |
| missing resources | 1 | **1** |
| world parts resolved | 25/25 | **25/25** |
| `ServerStaticModelEntity` | 6200 (6,199 + 1) | **6200** |
| teams | registered | **registered** |

**Every number is identical and the bundle is 79.8% smaller.** The earlier finding that the closure
was MANDATORY ("shipping only the 171 named blueprints died during entity creation") was measured
against the broken baseline -- the stale recipe that never loaded a sub-level and never registered a
team -- and does not survive the fix. The emitter should stop authoring it: on `frontend` it is
10,396 of 10,462 commands, and dropping it takes that level from 56,013,281 to 6,196,911 bytes.

The 476 missing texture variants are NOT caused by dropping the closure -- the with-closure build
has exactly the same 476. They are a separate, pre-existing gap (see the stub `TextureAsset` below).

### The freeze bisected: two independent sufficient causes, and a third of the bundle is innocent

Continuing the bisect, each row one variable, `frontend` on the fixed host:

| the `usdlevel` bundle contained | server | CLIENT |
|---|---|---|
| sub-world only, 0 objects, 0 partitions | `static=0` | **LOADS** |
| + the **10 stub `TextureAsset` partitions** | `static=0` | **LOADS** |
| + all 11 texture partitions, i.e. the 10 stubs **plus `flat_normal` + its `add_dds_texture`** | `static=0` | HANGS |
| + the **27 mesh partitions + 37 `add_existing_resource`**, 0 placements | `static=0` | HANGS |
| + 27 mesh partitions, **61 placements, no `add_existing_resource` at all** | `static=61` | HANGS |
| everything **except** `flat_normal` | `static=61` | HANGS |
| everything, closure dropped | `static=61` | HANGS |

**Cause 1 -- the generated DDS.** The texture set hangs and the same set minus `flat_normal` loads,
so the freeze is in

    add_dds_texture levels/realitymod/frontend/textures/flat_normal \
        /tmp/lvemit/frontend/partitions/_flat_n.dds true false false World_SkipNoStr

plus its partition. One generated texture resource, in a bundle with nothing else in it, is enough
to stop the client from ever finishing the level load. Every emitted level ships exactly one.

**Cause 2 -- the emitted mesh partitions.** The mesh set hangs on its own, and it hangs with the
`add_existing_resource` lines removed entirely, so the MeshSet resources are not what does it: the
27 emitted `*_Mesh` partitions being present are sufficient. Removing `flat_normal` from the full
build does not save it, which is how we know there are two causes and not one.

**Innocent, each measured rather than assumed:** the 6,711 duplicated closure partitions; the
`SpotLightEntityData`/`PointLightEntityData`/`SoundEntityData`; the placement count (1 hangs, 61
hangs, 0 loads); the `add_existing_resource` mesh registrations; and the 10 stub `TextureAsset`
partitions, which load fine.

**Not tested:** the 27 blueprint partitions. The recipe is built (`build.cmds.frontend_B`) and never
booted -- one cycle would settle it.

### What a stub TextureAsset looks like, since it is the shape of the pending question

    levels/realitymod/frontend/textures/levels/frontend/objects/tank3_d
      TextureAsset  { "Name": "levels/frontend/objects/tank3_d" }

One instance, one field. It names a texture BF3 ships and supplies no resource -- which is exactly
what the 476 "could not find a valid variant" warnings are about. Those partitions load fine on the
client, so this is a rendering gap rather than the freeze; recorded because the same emitter writes
the mesh partitions that DO freeze it, and the next step is to dump one of those and diff it field by
field against the game's own partition of the same type.

### Reproducing

Every variant is a `build.cmds` in `~/Games/VeniceUnleashed/shot-instance/artifacts/`
(`build.cmds.frontend_{empty,pnp,nres,one,nl,nc,T,Tstub,Tflat,B,M,noflat}`,
`build.cmds.mp_001_nc`), fed to `tools/usd/build_host_superbundle.py --level <name>`. A cycle is
about ten minutes: build ~2 min, server boot ~20 s, client cold start ~3 min, then either
`enter_game: True` with a `webui://mapeditor` CDP target inside 3 minutes, or nothing for 5 and the
client sitting at `team=0` on a black screen.

## The client freeze is NOT duplication: bisected to the emitted mesh partitions (2026-09-06)

The lead from Rime's own help -- *"Re-registering a mesh the level already provides freezes the
client"* -- was worth chasing and is **WRONG for this failure**. Six boots, one variable each, all on
`frontend` (27 meshes, 60 placements) in the host superbundle that now registers teams:

| what the `usdlevel` bundle contained | server | CLIENT |
|---|---|---|
| sub-world only: `SubWorldData` + `WorldPartData` with **0 objects**, no partitions | `static=0` | **JOINS, team=1, editor opens** |
| + the 66 mesh/blueprint/texture partitions + 37 mesh resources, **still 0 placements** | `static=0` | HANGS |
| + 66 partitions + **61** placements, **no** `add_existing_resource` at all | `static=61` | HANGS |
| + 66 partitions + 37 resources + **1** placement | `static=1` | HANGS |
| + all of the above, lights and sound entities removed | `static=61` | HANGS |
| + all of the above, **10,396 duplicated closure partitions dropped** | `static=61` | HANGS |
| the untouched emit (10,462 partitions) | `static=61` | HANGS |

**Everything below the first row hangs and the first row does not.** So it is not volume (one
placement is enough), not duplication, not the lights or the `SoundEntityData`, and not MeshSet
re-registration. **The emitted mesh/blueprint/texture partitions being PRESENT in the bundle is
sufficient, with nothing instantiated from them.**

Every one of these boots the SERVER handled identically and correctly -- teams registered, world
parts resolved, `ServerStaticModelEntity` came out at placements+1 -- which is one more thing the
headless sweep cannot see.

### The duplication census, since it was the hypothesis

The host superbundle (its 8 shipped bundles) provides **7,119** distinct partitions. Against that:

    frontend   emits 10,457   6,711 also in the host (64.2%)   3,746 genuinely new
    mp_001     emits 11,839   6,712 also in the host (56.7%)   5,127 genuinely new

The overlap is the game-mode closure the host already carries: all 2,756 `weapons/`, 1,142
`sound/`, 763 `characters/`, 762 `fx/`, 694 `persistence/`, 332 `ui/`. And it is real duplication,
not a near-miss: a closure JSON is a verbatim copy -- `weapons/knife/u_knife` is emitted with the
game's own PartitionGuid `0003de1b-f3ba-11df-9818-9f37ab836ac2` and its single instance.

**10,396 of `frontend`'s 10,462 build commands are that closure**, and dropping all of them costs
nothing measurable: the superbundle falls from 56,013,281 to 6,196,911 bytes, the server still
reports the same 61 entities, and the client hangs exactly as before. The 66 that remain are the
level: 22 mesh partitions, 22 blueprints, 11 textures and the sub-world. **The emitter should stop
authoring the closure regardless** -- it is 50 MB of the 56 MB every level ships and it buys nothing
-- but it is not what breaks the client.

**This contradicts a rule recorded earlier in this document, and the earlier one is the suspect.**
The closure was written down as MANDATORY -- "shipping only the 171 named blueprints authored 2189
more objects and then died during entity creation" -- and that measurement was taken against the
BROKEN baseline: the stale `RimeCommands.txt` that never loaded a sub-level and never registered a
team. Several of this document's "laws" were established the same way, and a law measured on a
foundation that was itself defective is worth re-measuring before it is trusted. Pending a retest on
a content-heavy level with the fixed host.

Adding a `MeshVariationDatabase` for the sub-level bundle (`mesh_variation_db_add_all`, 30 meshes
registered, 974 skipped as base-universal) *changes* the failure -- the client disconnects after
~20 s and exits instead of hanging -- and does not fix it. Reproduced twice.

### What the freeze looks like, precisely

The client joins (the server logs the connection), is assigned `team=0 squad=0 alive=false
soldier=false` and never leaves it; the window stays on the black loading screen; the CDP endpoint
stops answering entirely; ~2 cores spin with RSS pinned to the kilobyte (754,828 kB on the first
runs, 1.12 GB creeping 12 kB/20 s on mp_001). In the one variant that loads, the same client reaches
`team=1 squad=1`, `enter_game True`, and a `webui://mapeditor` CDP target inside ~3 minutes.

### Next step, bounded to three boots

**DONE, see the section above (2026-09-06):** the three kinds were shipped one at a time. Textures
hang because of the generated `flat_normal` DDS (the 10 stub partitions beside it load fine); the
mesh partitions hang on their own; blueprints remain untested.

## The zero-teams defect is FIXED: an exported level now registers teams (2026-09-06)

**An exported level, built by this toolchain, now boots with a working game mode.** `mp_001`,
6,199 placements, in the isolated shot instance:

    LoadBundles comp=4  Levels/REALITYMOD/teamdeathmatch
    LoadBundles comp=5  Levels/REALITYMOD/tdm2
    LoadBundles comp=6  levels/realitymod/usdlevel
    Registering team 0 with 0 player slots and 4 squad slots.
    Registering team 1 with 16 player slots and 4 squad slots.
    Registering team 2 with 16 player slots and 4 squad slots.
    Level:Loaded name=Levels/REALITYMOD/REALITYMOD mode=TeamDeathMatch0
    CONTENT_TOTAL parts=25 instances=25 absent=40
    ENTITY static=6200 group=0 light=0 spatial=0

Same for `frontend` (61/60). The generator is `tools/usd/build_host_superbundle.py`.

**A player still cannot DEPLOY, for a different reason, isolated below.** Teams register; the
client is what fails now.

### Where the team entities actually come from

`Blank_Level_Test`'s own `mod.json` (v0.0.110) says it, and the dumps confirm it: the game mode is
**mp_subway's TDM sub-level, renamed `levels/mp_subway/*` -> `levels/realitymod/*`** with the static
art stripped. Read out of the shipped `.sb` with `mount_standalone_sb` + `dump_partition_json`
(Rime's `mount_standalone_sb` lives in the mounted-GAME context, after `select_game`, and wants the
`.sb` FILE, not its directory -- both cost a run to find out):

| partition | instances | what it holds |
|---|---|---|
| `levels/realitymod/teamdeathmatch` | 6 | `SubWorldData` + 3 `WorldPartReferenceObjectData` |
| `.../layer0_teamdeathmatch_logic` | 105 | **102 `AlternateSpawnEntityData`** + the `full_teamdeathmatch` LevelSetup ref |
| `.../layer1_teamdeathmatch_spawners` | 2 | `UICombatAreaEntityData` |
| `.../layer3_teamdeathmatch_friendzones` | 9 | 7 `VolumeVectorShapeData` + `PathfindingBuildOrderData` |
| `levels/realitymod/tdm2` | 3 | `SubWorldData` |

**Authoring those five as JSON is NOT enough.** A build that adds exactly them with
`add_json_partition` produces a 360,288-byte superbundle, loads both bundles at comp=4/5 -- and the
server **exits at `LoadingInfo: Creating physics manager`**, before `Spawning level`. The shipped
`teamdeathmatch` bundle carries **6,323 partitions**, not 5: the other 6,318 are the LevelSetup's
closure (2,768 `weapons/`, 1,003 `sound/`, 764 `characters/`, 694 `persistence/` ...), and they are
in a 5.9 MB file only because they are CAS refs. `reference_existing_partition` pulls that closure
but EMBEDS it: **2,278,182,240 bytes**.

### The recipe that works: clone the shipped superbundle, override one partition

    build_sb Win32/Levels/REALITYMOD/REALITYMOD Frostbite2_0 <sb dir> true   <-- the CAS flag
    clone_sb_chunks Win32/Levels/REALITYMOD/REALITYMOD
    build_bundle <b> ; clone_bundle <b> ; build       for each of the SHIPPED 8 bundles
      (on the main bundle only, add_json_partition the patched LevelData after clone_bundle)
    <the emitted level's own bundle> ; build
    build

`clone_bundle` + the CAS flag reproduce the shipped superbundle to **5,950,017 bytes against
5,933,667**, with the original bundle-name casing, and it boots with teams. Without the CAS flag the
same clone is **782,062,080 bytes**. With `mp_001`'s content on top it is 61,924,317 bytes.

**The LevelData to patch is `ext/Shared/TestJson1_nowater.json`, not `TestJson1.json`.** Dumped out
of the shipped `.sb`, `levels/realitymod/realitymod` matches nowater on all 11 instances -- the only
differences are three engine-assigned bookkeeping ints per object (`IndexInBlueprint`,
`IsEventConnectionTarget`, `IsPropertyConnectionTarget`). It is the one that wires both
`SubWorldReferenceObjectData` with a `SubWorldInclusionSetting` on the shared GameMode criterion
`8553f314-...:8b89e816-...`, `EnabledOptions ["TeamDeathMatch0", "TeamDeathMatchC0"]`. `TestJson1.json`
-- which every emitted level has been built from -- is three revisions older, references a
`levels/realitymod/water` partition the recipe never builds, and names no sub-level at all. **That
single stale file is the whole zero-teams defect.**

Our own sub-level is appended as a fourth `SubWorldReferenceObjectData` with `InclusionSettings:
null` (ungated, so it loads under any mode) and `BundleName: levels/realitymod/usdlevel`.

### What is broken NOW: the CLIENT cannot load a level containing the emitted bundle

This is a different defect from the one above and the control is clean. Same client, same host
level, same MapEditor build, same machine, back to back:

    SHIPPED superbundle, no usdlevel bundle    joins, team=1 squad=1, level completes,
                                               enter_game True, webui://mapeditor target exists
    + emitted usdlevel bundle (60 placements)  joins, team=0 forever, black loading screen,
                                               CDP endpoint stops answering, ~2 cores spinning
                                               with RSS pinned to the kilobyte
    + emitted usdlevel bundle (6,199)          identical, 13 min, RSS 1.12 GB creeping 12 kB/20 s

So it is not content volume (60 placements fails), not the game mode (teams now register), and not
the client's ability to load this host level (the control loads it and opens the editor).

Adding a `MeshVariationDatabase` for the sub-level bundle --
`mesh_variation_db_add_all levels/frontend/frontend/meshvariationdb_win32
levels/realitymod/usdlevel/meshvariationdb_win32 1 false ""`, which registered 30 meshes and skipped
974 as base-universal -- **changes the failure but does not fix it**: the client now disconnects
after ~20 s and exits instead of hanging forever. Reproduced twice.

~~**The lead for the next attempt is in Rime's own help text** for that command: *"Re-registering a
mesh the level already provides freezes the client."*~~ **TESTED AND WRONG, see the section above
(2026-09-06).** The census was run (6,711 of frontend's 10,457 partitions duplicate the host) and
dropping every one of them does not change the freeze; neither does dropping the mesh resources
entirely. The freeze bisects to the emitted mesh/blueprint/texture partitions being present at
all.

### Harness: the deploy-screen tint is FIXED, the editor panels are not

`HudToggle:HideAll()` fires `ExitUIGraph` on **every** `ClientUIGraphEntity`, not just the HUD graph
`133D3825-...`, and the vanilla deploy screen's blue tint and blur come off the render. Verified by
image: `~/Pictures/vu-level-shots/control_realitymod_editor_clean_viewport.png` has a clean viewport
where every earlier shot carried "SQUAD / CUSTOMIZE / DEPLOY POINTS / US" burned across it. It is
called only when `ME_CONFIG.DEV_FREECAM_WITHOUT_SOLDIER` is set, because this file's own header is
right that touching the game-menu graph can cost freecam input on the normal deployed path.

The Gameface editor panels still cannot be hidden: `visibility:hidden` and `opacity:0` on
`document.documentElement` both report success over CDP and change nothing on screen. Roughly a
third of the frame is still editor UI; only the centre "Viewport" region is game.

### Reproducing

    tools/usd/build_host_superbundle.py --level mp_001 \
        --shipped-sb <mod>/sb/Win32/Levels/REALITYMOD/REALITYMOD.sb.bak_v0104 > /tmp/b.cmds
    RimeREPL /tmp/b.cmds

Dumps of the five game-mode partitions, the patched LevelData and the recipes are kept in
`~/Games/VeniceUnleashed/shot-instance/artifacts/`. The shot instance holds its own copy of
`Blank_Level_Test` and `MapEditor`; the shared instance and `iso-instance` were not touched.

## NO exported level has ever been RENDERED, and the reason is measured (2026-09-06)

**There is still no picture of an exported level, and this section is why.** The attempt below got
a VU client onto the box, into the MapEditor freecam, and flying -- on a STOCK level. Pointed at an
exported level it never leaves a black loading screen, and the cause is not the emitter.

**PARTLY SUPERSEDED by the section above (2026-09-06):** the zero-teams defect diagnosed here is
FIXED and an exported level now registers teams. The client still does not finish loading one, for a
separate reason isolated there.

    exported mp_001   client joins, level never finishes loading, 15+ min, CDP dead   NO IMAGE
    exported frontend client joins, same, and frontend is 27 meshes / 60 placements   NO IMAGE
    stock blank sb    server registers teams; client reaches the deploy screen        (control)
    stock MP_001      client + freecam + capture works end to end                     IMAGES

### The measurement: an exported level registers no teams, so no player can ever enter it

Server log, the two runs differing only in which `REALITYMOD.sb` is on disk:

    STOCK Blank_Level_Test superbundle          EXPORTED level superbundle
    ------------------------------------        ------------------------------------
    LoadBundles comp=3 REALITYMOD               LoadBundles comp=3 REALITYMOD
    LoadBundles comp=4 REALITYMOD/teamdeathmatch  LoadBundles comp=4 realitymod/usdlevel
    LoadBundles comp=5 REALITYMOD/tdm2          (nothing)
    Registering team 0 with 0 player slots      (nothing)
    Registering team 1 with 16 player slots     (nothing)
    Registering team 2 with 16 player slots     (nothing)
    Level:Loaded                                Level:Loaded

`Registering team` appears **0 times** in the saved sweep logs of `mp_001`, `frontend` and
`sp_paris` -- so this is not one bad run, it is every level in the table above. A player who joins
one of these servers sits at `team=0 squad=0 alive=false soldier=false` forever; the client hangs on
a black loading screen burning ~6 cores with its RSS pinned to the kilobyte, and its CDP endpoint
stops answering. **Every "LOADED" in the table above is a level no player can enter.**

### It is the Blank_Level_Test REBUILD that loses the game mode, not the USD emitter

Rebuilding the harness superbundle from its own `RimeCommands.txt` with **zero USD content** already
loses it. Bundle lists, straight out of the `.toc`:

    SHIPPED REALITYMOD.sb (5,933,667 B)      REBUILT (48,448 B, recipe only, no USD)
      Levels/REALITYMOD/REALITYMOD             win32/levels/realitymod/realitymod
      .../REALITYMOD_Settings_Win32            .../realitymod_settings_win32
      .../REALITYMOD_GameConfigLight_Win32     .../realitymod_gameconfiglight_win32
      .../REALITYMOD_loading_music             .../realitymod_loading_music
      .../REALITYMOD_UiLoadingMp               .../realitymod_uiloadingmp
      .../REALITYMOD_UiPlaying                 .../realitymod_uiplaying
      .../teamdeathmatch          <-- GONE
      .../tdm2                    <-- GONE

The shipped superbundle also carries `levels/realitymod/realitymod/shaderdb`,
`.../meshvariationdb_win32`, `levels/realitymod/teamdeathmatch/{layer0_teamdeathmatch_logic,
layer1_teamdeathmatch_spawners,layer3_teamdeathmatch_friendzones,meshvariationdb_win32}` and
`levels/realitymod/tdm2`. The recipe has no source for any of them -- 5.88 MB of the 5.93 MB shipped
superbundle is content `RimeCommands.txt` cannot reproduce. The recipe also never builds
`levels/realitymod/water` (`RealityMod_Water.json`), which the shipped `TestJson1.json` LevelData
*references* through `5c000001-...`, and never builds `levels/realitymod/teamdeathmatch`
(`RealityMod_TdmSubWorld.json`), which ships beside it and is used by nothing.

**So the harness has been booting a level with no game mode since before the USD work started, and
the boot check could not see it** -- `Level:Loaded` fires, the world parts resolve, and the entity
count comes out at placements+1, all with no teams and no possible player.

### How far the fix got

Three changes, each verified against the server log:

1. `add_json_partition levels/realitymod/water RealityMod_Water.json` -- resolves the dangling
   sub-world the shipped LevelData already references.
2. A second `SubWorldReferenceObjectData` in the host LevelData with
   `BundleName: levels/realitymod/teamdeathmatch` (same shape the emitter uses for its own
   `usdlevel`), plus a bundle of that name holding `RealityMod_TdmSubWorld.json`.

That **works as far as it goes**: the engine now loads `comp=5 levels/realitymod/teamdeathmatch`
next to `comp=4 levels/realitymod/usdlevel`. Teams still do not register, because the shipped
`RealityMod_TdmSubWorld.json` is a `SubWorldData` with `Objects: []` -- the team entities live in the
three `layer*_teamdeathmatch_*` partitions that only exist inside the shipped `.sb`. Adding a bundle
by NAME alone does nothing; the engine only loads a sub-level the LevelData points at.

**Next step, concrete:** put the SHIPPED `REALITYMOD.sb` back, boot it, and dump
`levels/realitymod/teamdeathmatch` and its layers with `Blank_Level_Test`'s own
`ext/Shared/PartitionDumper.lua` (Rime cannot read a standalone superbundle -- there is no
`mount_standalone_sb` in this build). Feed those JSONs back into the recipe and the game mode is
reproducible; then, and only then, is an exported level enterable.

### What DOES work, with images

The capture half is proven, on stock MP_001 (`ConquestSmall0`), MapEditor mod, no physical input:

- `ME_CONFIG.DEV_AUTO_ENTER_EDITOR` + `DEV_FREECAM_WITHOUT_SOLDIER` open the editor over CDP.
- `tools/e2e/dust2_shot.py`'s `FocusCamera` walk flies the real freecam to arbitrary world
  coordinates; six viewpoints over Grand Bazaar were flown and captured, and the shots show the
  actual level -- building facades, street, skyline, the antenna mast -- from the coordinates asked
  for.

Two things the harness still cannot do, both visible in those images and both worth fixing before
the next attempt:

- **The editor's Gameface panels cannot be hidden.** `visibility:hidden` and `opacity:0` on
  `document.documentElement` both report success over CDP and change nothing on screen, so roughly
  half the frame is editor UI. Only the centre "Viewport" region is game.
- **Without a deployed soldier the deploy screen's blue tint and blur sit over the render.**
  `HudToggle` fires `ExitUIGraph` on the HUD graph only (`133D3825-...`); the deploy screen is a
  different `ClientUIGraphEntity`. Firing it on every UIGraph is the obvious thing to try.

Images: `~/Pictures/vu-level-shots/` --
`stock_{overhead,oblique_se,oblique_nw,street,close,low_wide}.png` (stock MP_001 from the six
viewpoints an exported-level run would use, i.e. the comparison set that was missing), plus
`stock_mp001_editor_open.png` and the two `exported_*_client_stuck_loading.png` black-screen frames.

### Reproducing

Server + client were run from a THIRD instance, `~/Games/VeniceUnleashed/shot-instance`, because
another session was using `iso-instance` at the time. Only one VU server can run on this box: both
instances share one `server.key` (same Zeus GUID) and the ports 7948/udp and 47200/tcp are fixed.

    /tmp/shot_build.sh <level>      build an emitted level into iso-instance's BLT sb
    /tmp/shot_build2.sh NONE [tdm]  rebuild the harness recipe alone (the control)
    /tmp/shot_build3.sh <level>     the water + teamdeathmatch attempt above
    /tmp/lvshot.py <outdir> <tag> /tmp/views_mp001.json    fly + capture

Note `/tmp/shot_build.sh` writes into `iso-instance`'s `Blank_Level_Test/sb`; the frontend build
done here overwrote what was there.

## Every level BF3 ships BOOTS, and the engine counts the objects (2026-09-06)

**48 of 49 levels had never been started.** The pipeline was verified on mp_001 and on authoring
tests that never touch an engine, and this project's own lesson was that "MP_001 loading did not
mean the emitter worked" -- a second level exposed three separate defects. So every level was
emitted, built and booted in the isolated instance, one at a time.

    48 of 49 LOADED     1 refused by the content guard (web_loading: 0 meshes, 0 placements)
    static entities     316,586 created by the engine against 316,538 placements emitted
    build errors        72, all one class (below); every affected level still loads
    superbundles        49,594,592 .. 61,182,672 bytes, mean 54,351,428

**The verdict alone would be worthless.** A level that emits nothing loads perfectly, and four
variants of that have already fooled this pipeline, so each level is scored on three numbers that
an empty bundle cannot produce:

1. **What was emitted** -- mesh partitions, placements, textures and mesh references, refused
   before booting if the level emitted no geometry.
2. **World parts the ENGINE resolved** -- `SearchForDataContainer` on `levels/realitymod/usdlevel`
   and each `part<N>`. Every level resolved EXACTLY the number it emitted: 25/25 on mp_001,
   55/55 on sp_paris, 1/1 on frontend, and so on for all 48.
3. **Entities the engine actually created** -- a new `ServerStaticModelEntity` count on
   `Level:Loaded`. Across all 48 it is **placements + 1, every time, with no exception**; the +1
   is the blank host level's own single `ReferenceObjectData`. mp_001 6,200/6,199, sp_paris
   13,833/13,832, sp_new_york 1,588/1,587, frontend 61/60.

That third number is the one that cannot be faked: the objects are in the world, at the count the
USD stage carried, on every level BF3 ships.

**Read the section above this one before trusting any of it as a level you could PLAY.** Every one
of these 48 servers registers ZERO teams, so no player can enter and no client finishes loading --
measured 2026-09-06. `Level:Loaded` plus the world parts plus the entity count is a statement about
the CONTENT and nothing more.

**What the probe did NOT find:** the same pass counted `ServerStaticModelGroupEntity`,
`ServerPointLightEntity` and `ServerSpatialEntity` and got **0 on every level** -- 0, not the -1
this probe returns when an iterator does not exist, so the types resolve and are empty. Levels do
author `PointLightEntityData` (frontend 6 spot + 1 point, mp_001 113 point), so either a dedicated
server creates no light entities at all, or these are the wrong runtime type names. Unresolved; the
static-model count is the only entity number this section claims.

| level | meshes | placements | textures | mesh refs | build err | .sb bytes | world parts | static entities | boot |
|---|---|---|---|---|---|---|---|---|---|
| `coop_002` | 305 | 5,128 | 261 | 376 | 3 | 53,812,336 | 21/21 | 5129/5128 | **LOADED** |
| `coop_003` | 328 | 3,684 | 357 | 530 | 1 | 53,950,720 | 15/15 | 3685/3684 | **LOADED** |
| `coop_006` | 98 | 1,916 | 356 | 209 | 0 | 50,594,496 | 8/8 | 1917/1916 | **LOADED** |
| `coop_007` | 308 | 3,789 | 646 | 685 | 2 | 53,726,752 | 15/15 | 3790/3789 | **LOADED** |
| `coop_009` | 377 | 8,732 | 266 | 441 | 1 | 55,088,992 | 35/35 | 8733/8732 | **LOADED** |
| `coop_010` | 421 | 4,770 | 285 | 475 | 0 | 55,389,760 | 19/19 | 4771/4770 | **LOADED** |
| `frontend` | 27 | 60 | 264 | 37 | 0 | 49,594,592 | 1/1 | 61/60 | **LOADED** |
| `mp_001` | 534 | 6,199 | 795 | 1066 | 1 | 56,007,312 | 25/25 | 6200/6199 | **LOADED** |
| `mp_003` | 306 | 8,726 | 604 | 637 | 0 | 53,121,744 | 35/35 | 8727/8726 | **LOADED** |
| `mp_007` | 258 | 7,214 | 532 | 502 | 0 | 52,905,456 | 29/29 | 7215/7214 | **LOADED** |
| `mp_011` | 382 | 11,244 | 586 | 726 | 1 | 55,597,648 | 44/44 | 11245/11244 | **LOADED** |
| `mp_012` | 322 | 6,548 | 482 | 549 | 3 | 55,420,992 | 26/26 | 6549/6548 | **LOADED** |
| `mp_013` | 325 | 7,536 | 503 | 579 | 6 | 55,322,912 | 30/30 | 7537/7536 | **LOADED** |
| `mp_017` | 361 | 6,025 | 500 | 662 | 0 | 54,121,040 | 24/24 | 6026/6025 | **LOADED** |
| `mp_018` | 270 | 5,855 | 487 | 476 | 0 | 54,147,744 | 23/23 | 5856/5855 | **LOADED** |
| `mp_subway` | 640 | 11,425 | 736 | 1209 | 8 | 59,841,568 | 45/45 | 11426/11425 | **LOADED** |
| `sp_bank` | 745 | 11,527 | 257 | 898 | 4 | 60,834,640 | 46/46 | 11528/11527 | **LOADED** |
| `sp_earthquake` | 548 | 9,015 | 275 | 708 | 0 | 58,115,616 | 36/36 | 9016/9015 | **LOADED** |
| `sp_earthquake2` | 418 | 8,055 | 258 | 424 | 0 | 54,142,368 | 32/32 | 8056/8055 | **LOADED** |
| `sp_finale` | 484 | 6,543 | 258 | 519 | 0 | 54,806,976 | 26/26 | 6544/6543 | **LOADED** |
| `sp_jet` | 173 | 4,810 | 254 | 229 | 0 | 53,893,008 | 19/19 | 4811/4810 | **LOADED** |
| `sp_new_york` | 98 | 1,587 | 258 | 124 | 0 | 50,573,648 | 7/7 | 1588/1587 | **LOADED** |
| `sp_paris` | 663 | 13,832 | 257 | 763 | 1 | 61,182,672 | 55/55 | 13833/13832 | **LOADED** |
| `sp_sniper` | 636 | 9,018 | 254 | 681 | 0 | 58,030,304 | 36/36 | 9019/9018 | **LOADED** |
| `sp_tank` | 299 | 6,238 | 258 | 361 | 9 | 53,914,032 | 25/25 | 6239/6238 | **LOADED** |
| `sp_tank_b` | 349 | 3,533 | 260 | 354 | 0 | 52,974,336 | 14/14 | 3534/3533 | **LOADED** |
| `sp_valley` | 123 | 3,573 | 265 | 143 | 2 | 51,439,344 | 14/14 | 3574/3573 | **LOADED** |
| `sp_villa` | 353 | 5,956 | 256 | 427 | 0 | 54,104,976 | 24/24 | 5957/5956 | **LOADED** |
| `web_loading` | 0 | 0 | 0 | 0 | 0 | -- | - | - | **NOT_RUN** |
| `xp1_001` | 439 | 9,699 | 594 | 720 | 0 | 54,819,408 | 38/38 | 9700/9699 | **LOADED** |
| `xp1_002` | 359 | 7,273 | 542 | 597 | 0 | 53,862,496 | 29/29 | 7274/7273 | **LOADED** |
| `xp1_003` | 346 | 8,913 | 526 | 569 | 0 | 53,999,824 | 35/35 | 8914/8913 | **LOADED** |
| `xp1_004` | 201 | 5,170 | 441 | 361 | 0 | 51,968,672 | 21/21 | 5171/5170 | **LOADED** |
| `xp2_factory` | 452 | 4,078 | 384 | 708 | 10 | 55,570,032 | 16/16 | 4079/4078 | **LOADED** |
| `xp2_office` | 537 | 5,957 | 637 | 841 | 0 | 55,508,208 | 24/24 | 5958/5957 | **LOADED** |
| `xp2_palace` | 540 | 4,160 | 535 | 803 | 0 | 55,157,456 | 17/17 | 4161/4160 | **LOADED** |
| `xp2_skybar` | 268 | 4,439 | 464 | 423 | 0 | 52,585,888 | 18/18 | 4440/4439 | **LOADED** |
| `xp3_alborz` | 151 | 4,813 | 369 | 261 | 0 | 51,500,816 | 19/19 | 4814/4813 | **LOADED** |
| `xp3_desert` | 241 | 7,933 | 500 | 470 | 0 | 53,870,592 | 31/31 | 7934/7933 | **LOADED** |
| `xp3_shield` | 191 | 7,922 | 480 | 381 | 0 | 52,484,256 | 31/31 | 7923/7922 | **LOADED** |
| `xp3_valley` | 245 | 7,767 | 447 | 425 | 0 | 52,843,904 | 31/31 | 7768/7767 | **LOADED** |
| `xp4_fd` | 379 | 8,962 | 597 | 671 | 0 | 54,516,480 | 36/36 | 8963/8962 | **LOADED** |
| `xp4_parl` | 424 | 10,551 | 671 | 781 | 0 | 55,111,152 | 42/42 | 10552/10551 | **LOADED** |
| `xp4_quake` | 423 | 8,245 | 583 | 723 | 0 | 54,935,792 | 33/33 | 8246/8245 | **LOADED** |
| `xp4_rubble` | 460 | 8,377 | 627 | 789 | 1 | 54,755,936 | 33/33 | 8378/8377 | **LOADED** |
| `xp5_001` | 258 | 5,664 | 474 | 470 | 5 | 53,016,048 | 23/23 | 5665/5664 | **LOADED** |
| `xp5_002` | 259 | 3,887 | 452 | 509 | 8 | 53,366,864 | 16/16 | 3888/3887 | **LOADED** |
| `xp5_003` | 259 | 5,466 | 452 | 449 | 3 | 53,115,776 | 22/22 | 5467/5466 | **LOADED** |
| `xp5_004` | 237 | 4,724 | 396 | 400 | 3 | 53,222,960 | 19/19 | 4725/4724 | **LOADED** |

### The one level that does not boot is the one with nothing in it

`web_loading` is the loading screen, not a map: 59 instances, **0 distinct meshes and 0
placements**, so nothing is emitted and the content guard refuses it before the harness runs.
Forced through anyway, the engine reaches `bundle: levels/realitymod/usdlevel` and the process
exits -- an EMPTY usdlevel bundle does not load. Worth recording, because the standing assumption
here was the opposite ("a level that emits nothing loads perfectly"); in THIS harness an empty
sub-level bundle is fatal, and only a non-empty one gets as far as being able to lie.

### The 49 is provably the whole set

`levels/` holds 69 directories, and 49 of them contain a `<level>/<level>` partition with the
LevelData. The other 20 -- `mp_canyon`, `mp_whitepeak`, `xp3_legrandval`, `xp4_parliament`,
`xp4_financialdistrict`, the `testrange_*` set and the rest -- carry art under a level namespace
and **no LevelData at all**, so there is no 50th level being quietly skipped. The list of
directories that hold a LevelData is exactly the list that was swept.

### The 72 build errors are one bug, and it is ours

Every "Could not find resource" across the whole sweep, 71 distinct names, was put in the recipe by
the emitter's `HavokAsset` pass -- it references `HavokAsset.Name` for every such record the level
owns. Asked of the mounted game, **0 of 71 resolve**:

    where_is  levels/coop_003/props/coop003sidewalk_short_physics_1_win32   Not mounted
    where_is  levels/coop_003/props/coop003sidewalk_short_physics_0_win32   resource
                win32/levels/coop_003/coop_003 -> win32/levels/coop_003/ab02_art_parent

The same object declares two `HavokAsset`s, `_Physics_0_Win32` (Scale 1.0) and `_Physics_1_Win32`
(Scale 2.0). BF3 shipped a resource for the first and not the second. 70 of the 71 are that shape
(`_physics_<n>_win32`, n from 0 to 6); the 71st is the already-known `objects/rugpile_01/rugpile_01_n`
texture that BF3 never shipped either. The fix is to reference only names that resolve; the cost
today is noise, not a failure -- all 19 levels that hit it boot.

### Reproducing

    /tmp/mod_ee.sh <level>      USD export + emit          (no Rime, no VU; ~16 s)
    /tmp/mod_bb.sh <level>      build + boot + score       (holds flock /tmp/rime.lock; ~90 s)
    /tmp/mod_sweep.sh           all 49, resumable from /tmp/mod_results.tsv

The `ServerStaticModelEntity` probe is appended to the ISOLATED instance's
`Blank_Level_Test/ext/Shared/__init__.lua` (the shared instance's copy is untouched; backup at
/tmp/mod_blt_init.lua.bak).

## Every animation codec BF3 ships now writes (2026-09-06)

The 3,000 clips this document called read-only -- `VBR` 2,225 and `CURV` 775 -- decode and
re-encode, byte for byte, over every bank in the game. One mount, 322 banks, 0 parse errors:

    CURV clips           775 of   775  re-encode BYTE-IDENTICAL, 775 patchable
    VBR clips          2,225 of 2,225  re-encode BYTE-IDENTICAL, 2,225 patchable
    VBR sections       2,225 of 2,225  header size fields account for Data exactly
    VBR const quats   14,891 of 14,891 decode to UNIT quaternions
    DCT clips          3,778 of  3,778  (unchanged)
    uncompressed       2,191 of  2,194  (unchanged; 3 are empty)
    payload bytes  338,458,436 of 338,458,436 identical   (all four codecs; the DCT-only
                                                          figure below is still 38,366,576)

Neither codec had a reader at all. `dump_animation_bank` printed a CURV clip's array COUNTS and
called it `decoded: true`, and had no branch for VBR whatsoever -- which is how 3,000 clips could
look handled and be untouchable. Neither was a bit-packing problem in the end; both were LAYOUT
problems, and each was cracked by an invariant the format cannot fake.

### CURV: the payload is float32 keys, and the layout is the whole job

    channel slots   NumRotations*3 + NumVectors*3 + NumFloats
    ChannelGroups   {NumKeys, NumChannels}, concatenating: each takes NumChannels entries from
                    ChannelOffsets and NumKeys from Keys, in order
    Values          per group, NumKeys x NumChannels floats, KEY-MAJOR
    Consts          the slots that never move, paired with ConstOffsets

A rotation occupies THREE slots, not four -- measured, because at three
`len(ChannelOffsets) + len(ConstOffsets)` equals the slot count on 770 of the 775 clips and at four
it matches none. Key-major was measured too rather than assumed: read that way a channel's samples
are a smooth series on 672 clips against 5 the other way, and `sum(NumKeys*NumChannels)` accounts
for `Values` exactly on 775 of 775. 682 clips have one channel group, 46 have two, 30 have four, so
a single-group reader would have passed every length check and mixed two clips' channels together.

Being plain about it: a CURV round trip is exact because nothing is quantised. 775/775
byte-identical is a statement that the group/key/channel walk is right, not that a bit packer was
reproduced.

23 of the 775 carry a `Keys` array that does not add up to their groups' key counts (15 of them
have no groups at all). Those clips still decode and still WRITE -- what is missing is the frame
number of each key, and `keyTimesAccounted` says so per clip instead of inventing times.

### VBR: six sections named only by size, and they add up

`VbrAnimationAsset` names its sections by SIZE, which made the layout checkable offline:

    Data = KeyTimes[KeyTimeSize]
         + ConstIndices[ConstQuaternionCount*4 + ConstVector3Count*3 + ConstFloatCount]
         + ConstChanMap[ConstChanMapSize]
         + VectorOffsets[VectorOffsetSize] + FloatOffsets[FloatOffsetSize]
         + Descriptors[(QuaternionCount*4 + Vector3Count*3 + FloatCount) * 4]
         + FrameBlocks[sum(FrameBlockSizes)]

That sum equals `Data.Count` on 2,225 of 2,225 clips and on none of them is it off by a byte. The
last unknown was the four bytes per ANIMATED component: a constant channel costs one byte per
component, an animated one costs four plus its share of the blocks, and until that term was in the
equation the residual ran from 16 to 2,792 bytes with no pattern.

A constant channel is a palette reference -- one byte per component into `ConstantPalette`, whose
entries are NORMALISED into the clip's own window, so the value is `min + palette[i] * (max - min)`
with min/max per channel kind. The oracle that settled this is one the format cannot fake: read
that way, 14,891 of 14,891 constant quaternions in the game come out UNIT. Read any other way --
palette entries as raw values, or the sections in any other order -- it collapses to 63-72%.
`TrajMin/TrajMax` sit beside `Vec3Min/Vec3Max` and are the obvious place for a trajectory channel
to differ; they are equal to the Vec3 pair on 2,225 of 2,225 clips, so which vector channel is the
trajectory never has to be decided.

A nearest-entry encode is exact rather than approximate because NO clip's palette holds a duplicate
finite entry, so a decoded constant has exactly one index that could have produced it. 523 of
173,545 constants come back with a nonzero value error and its worst is 1.0e-6 -- float32 rounding
through the normalised fraction -- and every one of them still picks the same index, which is why
the bytes are identical anyway.

### What VBR still cannot do, with the measurement

**The per-frame blocks are not decoded.** 133,985 of the 307,530 VBR channel components (43.6%)
are animated and stay read-only; the 173,545 constant ones (56.4%) read and write. Only 11 of the
2,225 clips have no animated channel at all, and the median clip is 57% animated.

The four bytes per animated component look like eight nibbles of per-coefficient bit widths --
mostly monotonically decreasing, `0x0000000b` for a component that only ever holds a DC term
against `0x5667788a` for one that moves -- but they do not determine a block's size. Across 2,225
clips no function of them predicts a block length (`ceil8(sum)`, per-component `ceil8`, 32-bit
padding and 64-bit slice padding were all tried and all miss), only 42 clips have all their blocks
the same size, and one clip's blocks range 963..1,286 bytes against a descriptor sum of 8,106 bits
-- both above and below. So the blocks carry a per-block adaptive coding that has not been
recovered, and no amount of matching byte counts would make an encoder for it.

That is the honest position: a VBR clip's frame data is COPIED through the encoder, and only the
constant-index bytes are rebuilt from values. The edit probe below is what tells those apart.

### An edit lands, and only where it was aimed

Three banks, `check_animation_codec` writing the probe and `patch_animation_bank` applying it:

    b_sp05_sub_bankentry   CURV Values      4 of  46,464 byte(s) changed
                           CURV Consts      0 of   1,496
                           VBR  Data        1 of  80,484
                           5 of 1,727,204 bytes in the bank, 2/2 edits landed, max error 0.0
                           17/17 untouched clip(s) byte-identical
    b_sharedaisoldier      CURV Values      1 of  51,376   VBR Data 1 of 6,056
                           DCT  Data      211 of   3,552
                           3/3 landed (max error 6.0e-8), 54/54 untouched clip(s) byte-identical
    b_shared_coop          3 clips, 1,250 of 1,373,688, 3/3 landed (max error 2.9e-4)
                           32/32 untouched clip(s) byte-identical

One CURV float nudged by 0.25 moves the four bytes behind it and nothing else -- and lands EXACTLY,
because the codec quantises nothing. One VBR constant repointed at another palette entry moves ONE
byte of an 80 KB payload. That is the difference between a writer and a copier, and byte equality
alone could not have shown it.

`RimeLib.Tests/Animation/CurveVbrCodecTest.cs` pins both codecs without a game mount: the
group/key/channel walk on a two-group clip whose groups have different key AND channel counts, the
VBR section offsets on a clip with every section non-empty, and the one-value-in-one-value-out
property for each.

### The bug this nearly shipped with

The first run of this reported **CURV 775/775 byte-identical** and had compared **zero bytes**. The
check handed a `float[]` to a `FloatBytes` helper that reflects a `Data` property off its argument;
a `float[]` has none, so it returned an empty array, the comparison loop ran zero times and every
clip passed. It was caught by cross-checking the reported payload total against an offline sum of
the same arrays -- 43,664,076 where 338,458,436 was expected. `CheckCurve` now records
`comparedBytes` and refuses to call a clip byte-exact on an empty comparison, and the helper has a
real `float[]` overload.

### Not done

- **The USD side still only carries DCT clips.** `antanim.author` reads the per-frame samples
  `dump_animation_bank` produces, and it produces them for DCT only. CURV and VBR are writable
  through `check_animation_codec` / `patch_animation_bank`, not yet through a stage. Wiring CURV in
  would mean deciding what its three-float rotation channel MEANS, and that is not measured: the
  values reach 45.7 radians, which rules out any bounded encoding and is consistent with unwrapped
  Euler, but consistent is not proven and a wrong guess is a bank that loads and animates wrong.
- **Still no Ant GenericData archive writer**, so no clip can be added, removed or re-typed.
- **Not boot-tested.** The DCT path has been booted (below); these two have not.

New command on the way: `dump_anim_codec_clips <outdir>` sweeps every mounted Ant bank and writes
each VBR/CURV clip's header fields and base64 payload, which is what made the codec work possible
offline -- a full mount is too expensive to pay for once per hypothesis.

## Animation clips are writable (2026-09-06)

**BOOTED (2026-09-06).** A patched `ak74` bank -- 184 of 183,068 bytes changed by the encoder --
built into a bundle and loaded in the isolated instance:

    UsdRoundTrip: prepending usdroundtrip/scaledb to 1 bundles
      bundle: usdroundtrip/scaledb
    Level:Loaded name=Levels/REALITYMOD/REALITYMOD

No "could not be read". What this proves is that the engine ACCEPTS a re-encoded DCT payload -- a
corrupt encode would fail to load or crash on use. It does not prove the animation looks different;
the edit was 3.0e-8, deliberately chosen to be measurable rather than visible.

Both writers that were byte-proven-but-unbooted are now booted (see the mesh section).

The last asset class that could be exported and not returned. `Header.Serialize` and
`DofTable.Serialize` threw, so a clip could be decoded, given real bone names and edited in USD, and
then had nowhere to go.

**Two things were in the way, and only one of them was the codec.**

*The format does have a less-compressed storage type, and BF3 uses it.* `AnimationAsset.CodecType`
is a fourcc, and across all 322 antanimation banks the 8,972 clips split:

    DCT   3,778     VBR  2,225     RAW  1,534     CURV  775     FRAM  660

`RawAnimationAsset` is plain float keys. Its payload is
`NumKeys x (QuatCount x 4 + Vec3Count x 4 + FloatCount)` floats with the scalar block padded to a
multiple of 4 -- which accounts for all 1,534 exactly (1,522 fit at four floats per Vec3 with no
padding needed; the other 12 declare `FloatCount` 93 and pad it to 96). So uncompressed float keys
are a codec the engine already accepts.

*But that alone writes nothing*, because there is no writer for the CONTAINER. An Ant bank is a
relocatable GenericData archive whose every pointer is a file offset; emitting one from the object
graph means re-laying-out the whole archive and its reflection table, and nothing in Rime does that.
Switching a clip to a different codec changes its size, and changing its size means exactly that
re-layout. So the uncompressed codec is the wrong lever on its own.

**What the data supports is keeping each clip's own header and overwriting its payload where it
already lies.** Re-encoded against its own bit widths, delta bases and quantisation multipliers, a
DCT clip produces exactly as many bytes as it shipped with; the bank's layout, its reflection table,
every other clip and every pointer are untouched. `RimeLib.Animation.Frostbite2_0/EA/Compression/DCT/Compressor.cs`
is the encoder, `patch_animation_bank` does the write, and the result goes into a bundle with the
ordinary `add_resource <partition> AssetBank <blob>` path.

### The bitstream re-encodes byte for byte

`check_animation_codec`, over every bank BF3 ships (one full mount, 322 banks, 71,485 Ant objects):

    DCT clips             3,778 of  3,778  re-encode BYTE-IDENTICAL
    payload bytes    38,366,576 of 38,366,576  identical
    coefficients clamped          0
    decode failures               0
    header round trip     3,778 of  3,778  (Header/DofTable write -> read -> every field equal)
    patchable             3,778 of  3,778
    uncompressed clips    2,191 of  2,191  patchable

Not byte-identical by luck: `patchable` means the recorded file offset was checked to ALREADY HOLD
that clip's payload before anything is claimed. The first version of this passed a length check,
wrote a correctly sized file, and corrupted the bank -- see the traps below.

Three `RawAnimationAsset` clips are excluded above because they are EMPTY (`IK_NoAddon_StandPose
Anim`, 0 floats, three times in `b_basicassetsmp`); there is nothing to patch. One bank of the 322,
`b_sp10_sub_halo jump`, holds 9 objects and no clips at all.

### The float trip is lossy, and here is how lossy

Byte-identical applies to COEFFICIENTS in and coefficients out. Going all the way to floats and back
cannot be exact, and this document should not pretend otherwise: the decoder normalises quaternions,
so their magnitude is gone before an encoder ever sees them, and re-quantisation rounds. Measured
over all 3,778 clips, largest disagreement per clip between `decode(x)` and
`decode(encode(decode(x)))`, on the channels the comparison is meaningful for:

    median 1.9e-4     p90 1.2e-3     p99 2.4e-3     max 2.1e-2

630 clips (16.7%) exceed 1e-3 and 4 exceed 1e-2. The worst is a 3P melee animation in
`s_basicassets`. The delta bases the encoder derives sit within 5 quantisation steps of the shipped
ones and within 1 step for 3,405 of 3,778 clips.

### An edit actually lands

`patch_animation_bank`, on a real bank, with one translation channel nudged by 0.25 in a DCT clip
and one float key nudged in a `RawAnimationAsset`:

    ak74    2 clip(s) patched, 184 of 183,068 byte(s) changed, blob same length
            reloads to 38 objects, 2/2 edits landed (max error 3.0e-8)
            23/23 untouched clips byte-identical
    ah-1z   2 clip(s) patched, 1,070 of 50,156 byte(s) changed, blob same length
            reloads to 4 objects, 2/2 edits landed (max error 9.9e-5)
            1/1 untouched clip byte-identical

The untouched-clip count is the half that matters: a writer that clobbered a neighbouring array
would produce a bank that loads perfectly and animates wrong.

The USD half is `antanim.edits_from_stage` and `tools/usd/antanim_edit_test.py`: an untouched stage
emits ZERO edit files, one nudged channel emits exactly one clip in the right partition at the right
index, and of the 9,180 floats in it, 17 carry the edit, 9,163 are unchanged and 0 are neither.
`RimeLib.Tests/Animation/DctCodecTest.cs` pins the codec without a game mount.

### What this does NOT do

- **A clip cannot gain frames or precision.** Re-encoding against the clip's own header means
  `NumKeys` frames in, `NumKeys` frames out, and a coefficient that outgrows its shipped bit width
  is CLAMPED, not widened. The 0.25 probe clamped 20 coefficients on one ah-1z clip and 10 on an
  ak74 clip; the command says so rather than writing quietly. A clip needing more than it shipped
  with would have to be rewritten as `RawAnimationAsset`, which needs the archive writer below.
- **No Ant GenericData archive writer.** Clips can be edited in place; a clip cannot be ADDED,
  REMOVED or re-typed, and no new bank can be created.
- ~~**VBR and CURV clips are still read-only** -- 3,000 of the 8,972.~~ **DONE 2026-09-06**, see
  the section above: CURV re-encodes byte-identical and VBR's constant channels do, with its
  animated frame blocks still undecoded.
- **Not boot-tested.** The patched blob reloads through Rime's own reader and decodes to the edited
  values; it has not been built into a superbundle and loaded by the game. Every claim above is a
  byte or a value, not a frame on screen.

### Two traps this cost

- **Blob-relative offsets look absolute.** Each object is parsed from its own `GD.DATA` blob, which
  is COPIED out first, so every array pointer the parser reads is relative to that copy. Recording
  them raw put two clips' 14 KB payloads 14 bytes apart, and the patch wrote a file of exactly the
  right length into the middle of the bank's own structure. The fix is `Blob.DataOffset` plus a
  refusal to write unless the target bytes already ARE the clip's current payload.
- **The blob carries its own endianness and it is not the file's.** `AssetBank.Load` reads the outer
  file big-endian, but a `GD.DATA` blob has an endian flag and BF3's are LITTLE-endian -- while the
  DCT sample stream inside them is read big-endian regardless. A DCT payload is a byte array and
  does not care; the float and short arrays beside it do, and writing those the wrong way round
  produces a clip that decodes to noise instead of failing. The byte order is now taken from the
  blob, not assumed.

Also measured on the way: BF3 pads a DCT payload past its last real bit -- 16, 24 or 32 bytes over
the 8-byte-aligned length (1,872 / 1,852 / 54 clips). That slack is never decoded. The encoder
matches the shipped LENGTH rather than re-deriving a padding rule from a handful of clips.

## Collision REBUILDS at the game's object count (2026-09-06)

    swept        7,617 resources: 2,149 rebuilt, 5,468 preserve-only, 0 failed
    objects      45,274 built against 45,989 in the game (98.4%)
    round trip   22,714 placements, 348,518 values compared, 0 changed
    edit probe   every rebuild: the moved shape moves, nothing else does
    BigRadioTower  120 objects in the game, 118 rebuilt -- the 2 are its MOPP
    RESULT       PASS

The section above fixed the reader and left the writer at **81 objects against BF3's 120**. That
gap is now **2**, and both are named: `hkpMoppBvTreeShape` and `hkpMoppCode`.

Class by class on BigRadioTower, which is the resource the 81-vs-120 number came from:

| class | game | built |
|---|---|---|
| hkRootLevelContainer | 1 | 1 |
| HavokPhysicsContainer | 1 | 1 |
| hkpListShape | 1 | 1 |
| hkpConvexTransformShape | 67 | 67 |
| hkpConvexTranslateShape | 2 | 2 |
| hkpBoxShape | 26 | 26 |
| hkpCylinderShape | 11 | 11 |
| hkpConvexVerticesShape | 9 | 9 |
| **hkpMoppBvTreeShape** | **1** | **0** |
| **hkpMoppCode** | **1** | **0** |
| TOTAL | 120 | 118 |

**Four changes, each answering one line of that table.**

*Rotated placements are `hkpConvexTransformShape`.* 52,448 of BF3's placements are, against 102,842
translates, and the builder had no class for them -- so 67 of the tower's 69 wrappers were the
wrong object AND lost their rotation. The layout is an hkTransform: three rotation COLUMNS then the
translation, 32/96 bytes at 32-bit and 64/128 at 64-bit, measured off the game's own two packfiles
rather than derived.

*Placements and LEAVES are separate objects.* BF3 puts **26 distinct boxes in the tower and points
69 wrappers at them**; one box per placement wrote 69. Sharing is driven by the leaf the reader
says a placement points at, so a rebuild reproduces the game's own instancing exactly -- a
geometry-only key merged 58 boxes BF3 had kept apart over a 250-resource sweep.

*A shape at the origin with no rotation gets no wrapper at all.* The tower's 11 cylinders and 9
hulls are direct children of the list; wrapping them wrote 20 `hkpConvexTranslateShape` objects the
game does not have.

*Connectivity is emitted only where the game has one.* 5,330 of BF3's 36,004 hulls carry an
`hkpConvexVerticesConnectivity` and the rest leave the pointer null; the builder emitted one every
time. Rime now reports which, off the fixup table -- a null pointer has no fixup, and reading the
slot only ever sees an unrelocated zero.

Plus `hkpCylinderShape`, `hkpSphereShape` and `hkpCapsuleShape` writers, and an `hkpListShape` --
emitted only where the game has one, because 1,272 resources put a bare translate under the
container and 900 put a bare list. **The class-name table is now only the classes actually used, in
the order they first appear in the data section**, which is the game's own rule: checked on
BigRadioTower, MEHouse01Large and big_curtain, whose tables match their objects exactly.

**Every signature was read out of the game and every one of the five guesses was wrong.** The five
new classes were first written with plausible-looking checksums; the real ones
(`hkpConvexTransformShape` 0xAE3E5017, `hkpListShape` 0xA1937CBD, `hkpCylinderShape` 0x3E463C3A,
`hkpSphereShape` 0x0795D9FA, `hkpCapsuleShape` 0xDD0B1FD3) are unanimous across all 7,617
resources.

### What is NOT rebuilt, and why the pipeline refuses rather than approximates

**5,468 of 7,617 resources are preserve-only.** They hold an `hkpCompressedMeshShape`,
`hkpExtendedMeshShape` or `hkpStorageExtendedMeshShape` -- the SHAPES themselves are Havok SDK
bakes, and emitting the resource without them would ship a level whose water you fall through.
`build_collision.can_rebuild()` is the gate and `build()` raises rather than drop a mesh; the
pipeline preserves the original bytes, which is the rule terrain and meshes already follow.

**1,006 of the 2,149 rebuilt lose their MOPP**, reported as `degraded`. That is a different claim
from the one above and is why it is a different word: `hkpMoppBvTreeShape` + `hkpMoppCode` are an
ACCELERATION structure, not geometry, and a bare `hkpListShape` under the container is an
arrangement BF3 ships in 900 resources. The collision is complete; the broadphase is slower.
`hkpMoppUtility::buildCode` lives in the SDK and is not synthesised here.

**Byte equality against BF3's bake is not available and is not claimed.** Two measured reasons: the
MOPP above, and the padding lanes of an `hkpConvexTransformShape`'s rotation carry SIMD leftovers
with no rule -- `col0.w` is zero in 28,191 of the 52,448 and equals `col1.z` in 24,257. So the proof
here is the object census plus a full round trip -- game bytes to Rime's reader to descriptors to
the builder and back through Rime's reader -- requiring the same placements at the same positions
with the same rotations, and an edit probe on every one, because a builder that ignored its input
would pass a round trip that only ever fed it the same thing.

Corpus-wide the builder's classes now cover **362,062 of BF3's 400,053 packfile objects (90.5%)**,
up from 299,746 (74.9%).

Residual, measured and not explained away: 245 nested `hkpListShape` are flattened into one, and
1,036 wrappers are emitted that the game does not have -- 861 of them the documented one-shape pad
(a container whose only entry is a bare convex wedges the server), the other 175 unaccounted for.

**Not boot-tested.** An edited collision resource has not been built into a bundle and loaded in
the isolated instance. Everything above is bytes and decode, not engine acceptance.

### USD keeps the rotation now

`tools/usd/collision_extract_roundtrip_test.py` and `collision_byte_roundtrip_test.py` both pass on
BigRadioTower, MEHouse01Large and two `.water.mesh` resources:

    tower   89 placements (69 box, 11 cylinder, 9 convex), 67 rotated -- 1,706 values, 0 changed
    house   39 placements, 16 rotated -- 616 values, 0 changed
    water   1 mesh -- 13 values, 0 changed; 47,272 / 21,304 / 5,420 / 137,580 bytes preserved
            verbatim, and a moved shape correctly forces a rebuild in all four

Two things had to change for that. A rotated placement is authored as a **matrix** xform op, not
translate + orient: going through a quaternion re-normalises the rotation, and BF3's are float32
and not exactly orthonormal -- the tower's shape 10 came back with `rotation[2][2] = -1.0e-4`
against the game's 0, which is the size of the tolerance the test compares at. And a triangle mesh
is read back as a mesh rather than as a hull; reading a water surface back as a convex solid would
have turned it into a block.

## Collision geometry: the placements, not just the shapes (2026-09-06)

    corpus       7,617 HavokPhysicsData resources (the whole game)
    parsed       7,617; 0 unparseable   (was 7,593 parsed, 24 rejected)
    bytes        7,617 / 7,617 byte-identical
    edit probe   7,617 / 7,617 moved exactly the edited bytes and nothing else
    shapes       68,436 placements, of which 21,495 carry a rotation
                 55,628 box, 11,053 convex, 1,523 cylinder, 92 mesh, 82 capsule, 58 sphere
    meshes       14,017 vertices, 16,306 triangles from storage subparts
    wrappers     55,509 of 155,290 reached; 27,497 of 27,497 where nothing is undecodable
    rotations    0 of 68,436 with a non-unit determinant (worst |det - 1| = 8.3e-7)
    RESULT       PASS

Three things were wrong here and all three were invisible: the reader rejected 24 resources for a
reason that was not true, dropped two thirds of every placement in the ones it accepted, and had a
pointer-table bug that emptied the graph in 3,335 of them.

### The 24 `.water.mesh` resources were never big endian

`HavokPhysicsData` threw `NotSupportedException: Big endian Havok data is not supported` on 24
resources, and the diagnosis was wrong. **BF3 ships two shapes of this header** -- 7,593 resources
carry four `(count, offset)` array slots and 24 carry five -- and the five-slot ones are exactly the
24. A four-slot reader computes a packfile offset 16 bytes short, lands on the tail of
`MaterialFlagsAndIndices`, reads that as an `hkPackfileHeader`, and finds a zero where the
layout-rule byte lives. Zero means big endian.

The resource names its own shape and nothing has to be sniffed: **the first array's offset IS the
end of the header** -- 0x40 for four slots, 0x50 for five -- and the count of trailing relocations
matches, four against five. The fifth array declares ZERO elements in all 24, so its element type is
unobservable; it is carried as a count and an offset, which is enough to write the header back
exactly, and `Deserialize` throws rather than guess if one ever ships non-empty.

All 24 now parse and round-trip byte-identically, and the edit probe covers them.

**What they contain, measured:** each is the same six objects -- `hkRootLevelContainer`,
`HavokPhysicsContainer`, `hkpMoppBvTreeShape`, `hkpMoppCode`, `hkpStorageExtendedMeshShape` and its
subpart storage. That is a MOPP-accelerated triangle mesh, so the reader now decodes one:
**7,548 vertices and 6,941 triangles across the 24**, from 4 vertices / 2 triangles on `mp_017` to
1,596 / 1,546 on `sp_valley`. Water reads as water: `mp_011` is 26 vertices dead flat at
y = -8.32 over 320 x 43 units, `sp_valley` is a river varying in height across 5.8 x 5.6 km.

Nothing about the index width is assumed. An `hkArray` payload is inline and the next one begins
where it ends, so the array's FOOTPRINT is known, and the element size is the one of 4, 2 or 1 that
the footprint fits with only 16-byte alignment left over; it is then required that every index
addresses a vertex that exists. A wrong width is rejected rather than turned into confident
garbage. **All 92 subpart storages BF3 ships decode, 0 rejected** -- 61 with 8-bit indices, 7 with
16-bit, 24 with 32-bit, which is why guessing one width would have failed.

### Two thirds of every placement was being dropped

`GetShapes` swept the virtual fixups for shape classes and used `hkpConvexTranslateShape` for
position. Corpus-wide that is the wrong wrapper two times in five: BF3 places shapes through
**102,842 `hkpConvexTranslateShape` and 52,448 `hkpConvexTransformShape`**, and only the second
carries a rotation. Nothing decoded `hkpConvexTransformShape` at all.

Measured against the old code on the same corpus:

    OLD   176,340 shapes returned, 127,927 of them (72.5%) at the ORIGIN, none with a rotation
    NEW    68,436 placements, every one positioned, 21,495 with a rotation

The new number is SMALLER and that is the point. The old sweep returned every box and hull object in
the file whether anything placed it or not, gave most of them no position, and collapsed instancing:
BigRadioTower places **26 distinct boxes 69 times**, and the sweep reported 26. The walk reports the
89 shapes the game actually puts in the world -- 69 box placements, 11 cylinders, 9 hulls, 67 of
them rotated -- spanning y = 0 to 282.7 rather than the 0 to 33 the two readable wrappers implied.

`hkpCylinderShape`, `hkpSphereShape` and `hkpCapsuleShape` are read too (1,523 + 58 + 82). The walk
takes the graph from the FIXUP TABLE -- a pointer slot inside object A resolving to object B is an
edge -- rather than decoding each class's array counts, so a list with a disabled or null child is
walked correctly without the reader knowing what "disabled" looks like.

**The bug that made it worse, and would have hidden the fix.** `SetOffsets` read the two fixup
regions back to back, resuming the second loop wherever the first stopped. The first region is
terminated by `-1` with padding after it in **3,335 of the 7,617 resources**, so the second loop
read that `-1` and stopped immediately -- leaving `ObjectOffsets` EMPTY. That dictionary is every
pointer the shape graph is made of, and **1,238,946 object pointers were being lost**, silently,
because an empty table reads exactly like a resource with no children. Both regions are now located
from the section header.

**Two guards, because a shape count with nothing to compare it against proves nothing.** The flat
virtual-fixup census names every wrapper object; the traversal reaches them by a completely
different route; they must agree. They do: **27,497 of 27,497** in the 3,081 resources with no
undecodable class. And a Havok placement is rigid, so its rotation determinant is 1 -- columns read
at the wrong offset still produce confident-looking geometry: **0 of 68,436 off by more than 1e-3**,
worst 8.3e-7.

### What is still not read, named

**99,781 of the 155,290 placement wrappers are held only by `hkpExtendedMeshShape`** and are not
reached. That is deliberate, not an oversight: its subparts hold **819,307 pointer slots** onto a
few hundred shared wrappers, so walking it would emit the same shape thousands of times. The classes
the walk reaches and refuses are `hkpCompressedMeshShape` (8,872), `hkpExtendedMeshShape` (324) and
`hkpConstraintInstance` (5) -- the first two are Havok SDK bakes with 24.9 MB and 22.9 MB of object
data behind them.

And the REBUILD is untouched by all of this -- **SUPERSEDED, see the section above: the writer now
emits 118 of BigRadioTower's 120.** As it stood, `tools/havok/build_collision.py` emitted boxes and
hulls behind `hkpConvexTranslateShape`, so an edited BigRadioTower was 81 objects against the game's
120. The 39 itemised, which became the work list:

| missing from the rebuild | count |
|---|---|
| `hkpConvexTransformShape` (rotated placement) where the builder writes a translate | +34 net |
| `hkpCylinderShape` | +11 |
| `hkpListShape` + `hkpMoppBvTreeShape` + `hkpMoppCode` | +3 |
| `hkpConvexVerticesConnectivity` the builder emits and BF3 does not | -9 |

Corpus-wide the builder's classes cover 299,746 of BF3's 400,053 packfile objects (74.9%); the
44.3 MB of `hkpMoppCode` and 24.9 MB of `hkpCompressedMeshShape` are SDK output and are not
reproducible without it. So a rebuild remains a correct resource rather than BF3's bytes, and an
UNEDITED resource still hands back the game's own bytes -- which is the path that matters.

USD authoring follows the reader as far as it honestly can: `tools/usd/collision.py` now writes the
rotation as an orient op, gives cylinders, spheres and capsules real `UsdGeom` prims instead of the
empty mesh the convex branch would have made of them, builds faces for a triangle mesh from its
index list, and folds rotation, the cylinder axis and the triangle list into the edit digest -- a
field the digest ignores is a field an edit can change without the trip noticing.

## The remaining export-only writers now write, and the bytes match (2026-09-06)

Seven `Serialize` methods that threw `NotImplementedException` -- the shader constants, both
`StreamingPartitionHeader`s, the three RimeLibLite core primitives and `HavokPhysicsData` -- now
mirror their `Deserialize` field for field. Measured against every resource BF3 ships, by reading
the shipped bytes, writing them back, and diffing at the offset the reader consumed them from
(`round_trip_writers`, one full mount):

    STREAMINGPARTITIONHEADER   73,371 of  73,371 byte-identical   PASS
    EXTERNALVALUECONSTANT     190,486 of 190,486 byte-identical   PASS
    EXTERNALTEXTURECONSTANT   102,528 of 102,528 byte-identical   PASS
    RELOCPTR                   68,558 of  68,558 byte-identical   PASS
    RELOCARRAY                113,075 of 113,075 byte-identical   PASS
    MATRIX44                   14,115 of  14,115 byte-identical   PASS
    HAVOKPHYSICSDATA            7,593 of   7,593 byte-identical   PASS

**How often BF3 actually uses each, because a writer for something it never ships is wasted
effort.** Across 41,278 mounted resources and 73,371 partitions:

| type | count | what it gates |
|---|---|---|
| `StreamingPartitionHeader` (FB2.0) | 73,371 | every EBX partition in the game |
| `DxTexture` | 13,017 | |
| `MeshSet` | 9,794 | 68,558 RelocPtr slots, 113,075 RelocArray slots |
| **`HavokPhysicsData`** | **7,617** | third most common resource type in BF3 |
| `OccluderMesh` | 705 | 14,115 Matrix44 transforms |
| `IShaderDatabase` | 49 | 190,486 value + 102,528 texture external constants |
| `StreamingPartitionHeader` (FB2013.2) | **0** | BF3 is Frostbite2_0; this engine is off its path |

Two of the seven were mis-stated in the table below and are corrected there: both
`StreamingPartitionHeader.Serialize(RimeWriter)` and `RelocArray.Serialize(RimeWriter)` were already
implemented and the FB2.0 one is live in `EbxWriter` -- only the `out byte[]` overloads threw. The
73,371 number is what the working one is worth, not a new capability.

**Two fields had to be added to survive byte comparison, and both were found by it.**
`ExternalValueConstant` skipped the two bytes between `Required` and the default `Vec4`; they are
now read and written as `Reserved`, because a writer that assumed they were zero would have been
assuming the thing under test. And `HavokPhysicsData` discarded its four trailing relocations --
the file offsets of the four array pointers -- which are now kept.

### HavokPhysicsData: byte-exact, but only 5.2% of the bytes are modelled

    corpus       7,617 resources (366 MB)
    parsed       7,593; 24 unparseable          (SUPERSEDED: all 7,617 parse -- section above)
    bytes        7,593 / 7,593 byte-identical
    content      170,686 class descriptors, 799,818 virtual fixups,
                 14,125 part translations, 22,349 local aabbs
    edit probe   7,593 / 7,593 moved exactly the edited bytes and nothing else
    RESULT       PASS

This is the honest split, and the second number is the point: **18,960,056 bytes are written from
decoded fields and 348,741,728 are carried verbatim.** Everything the reader decodes is written from
a field -- the wrapper header, all four arrays at the offsets they were read from, both packfiles'
headers and section headers, the class-name descriptors and the virtual fixups. What is copied is
what the reader never decodes: the `__data__` section objects and the Frostbite fixup blobs. That is
declared on `HavokInstance.ObjectData` and `HavokInstance.FixupData` rather than left to be
discovered. So Rime can now write collision, and an editor can move a part translation, a local
AABB, a material index or the scale -- but the SHAPES still belong to the Python builder in
`tools/havok/build_collision.py`, and the 81-vs-120-object frontier is untouched by this.

**Byte equality alone would not have caught a copier, so it is not the only test.** An edit probe
changes one decoded value in every resource and requires that exactly the bytes behind that field
move: 7,593 of 7,593. Without it, a `Serialize` that returned a stashed copy of the input would
score a perfect 7,593 and be worthless.

**The bug byte equality did catch:** the virtual-fixup region rarely ends on a whole 12-byte record
-- `DeserializeData` divides the region by the record size and drops the remainder -- and that
remainder is `0xFF`, not zero. Writing zero there was the *only* difference in **2,887 of 7,593**
resources: 8 leftover bytes at 0x2288 of MEHouse01Large, 4 at 0x59C of the canals bridge pillar. No
field comparison would have seen it, since no field lives there.

**Still not writable, named:** 24 resources fail to parse at all, every one a `.water.mesh` -- the
reader throws `NotSupportedException: Big endian Havok data is not supported`. **FIXED
2026-09-06** (section above): the diagnosis was wrong, they carry a five-slot header, and all 7,617
now parse and round trip byte-identically. Still not writable, because the triangle mesh behind them
needs a MOPP that only the Havok SDK bakes.

Run it with `round_trip_writers <dir>` inside a mount (which also dumps the physics payloads), then
`dotnet Utils/HavokRoundTrip/bin/Release/HavokRoundTrip.dll <dir>` offline -- a full BF3 mount is
shared and expensive, so the Havok corpus is dumped once and iterated against the files.

## Terrain layers and scattering can now be WRITTEN back (2026-09-06)

This doc has been overstating terrain since the section below. Layers and mesh scattering round
tripped through USD with 0 changed fields, which is true and was reported honestly -- but there was
no path back into the game. Every `Serialize` under Rime's `Frostbite/VisualTerrain` threw
`NotImplementedException` except the leaf `MeshScatteringType`, so an edited density had nowhere to
go. "Round trips" was doing work it had not earned.

Six writers implemented (`VisualTerrain`, `VisualTerrainLayer`, `TerrainLayerCombinationDraw`,
`Surface2dDrawMethod`, `Surface3dDrawMethod`, `MeshScatteringMaskScaleMethod`), each an exact mirror
of its `Deserialize`. Measured against every VisualTerrain resource BF3 ships, with
`check_visual_terrain`:

    resources    33/33 byte-identical to the game
    bytes        1,036,583 / 1,036,583 identical
    content      268 layers, 443 mesh scattering types, 6,479 combination draws
    edit probe   33/33 -- one density changed, read back, every other type untouched
    RESULT       PASS

And end to end through the writeback command, `write_visual_terrain`:

    unedited     mp_001 18,447 / mp_007 28,388 / sp_valley 45,765 bytes -- IDENTICAL (compare_resource)
    edited       mp_007 density 0.9 -> 4.25: exactly 4 bytes changed, the float32 at offset 204

**Byte equality is the only reason this is correct, and it is not a formality.**
`MeshScatteringMaskScaleLevelEnd` was read as a bool and is not one: across MP_007's 98 layer
combinations it takes the values 0, 3, 4, 5, 6, 9, 10, 11 and 13, and **90 of the 98 are something
other than 0 or 1**. Read as a bool they all collapse to true; written back they all come out as 1.
That is 90 changed bytes in a resource nobody edited, in a field every field-level check called
unchanged, with the parse staying perfectly aligned either way. It is a byte -- a level index, like
the `Level` on the draw methods beside it. No field comparison anywhere in this pipeline would have
found it.

Two design points, both because the alternative silently loses edits:

- **A scattering type is addressed by `(Layer, Index)`, never by mesh name or by prim order.** A
  layer may grow the same mesh twice at different densities and MP_007 does; the mesh name may
  itself be what was edited; and USD hands children back in NAME order, so `layer_10` traverses
  before `layer_2`. `scattering.py` now authors `bf3:scatterIndex`, and the round-trip test keys on
  the pair rather than on traversal order. Two edits landing on one address is an error, not a
  last-write-wins.
- **Edits are applied ONTO the shipped resource, not rebuilt from the dump.** `VisualTerrainInfo`
  is a deliberately lossy view -- it carries none of the 164 mask-scale draw methods on MP_007 and
  most of the resource header. Rebuilding from it would drop them and still report a clean trip.

Still not writable this way: the layer index lists on a draw are passed through rather than taken
from the edit, because they are what the shader was compiled against -- a list that no longer
matches its shader name is a level drawing the wrong ground.

## An edited mesh now ships; an unedited one is still referenced (2026-09-06)

**BOOTED (2026-09-06).** The last unknown -- whether the engine accepts an `add_chunk`-written RAW
chunk, flagged unverified in `usd-roundtrip.md` §7 -- is now answered. An edited mesh, in a bundle
this toolchain built, loaded in the isolated instance:

    UsdRoundTrip: prepending usdroundtrip/scaledb to 1 bundles
      bundle: usdroundtrip/scaledb
    Level:Loaded name=Levels/REALITYMOD/REALITYMOD
    USDRT SERVER level loaded, arming spawn

No "could not be read". Done in the ISOLATED instance, so no shared state was touched.

**What blocked this for five attempts:** `build_sb` nests -- `build_sb` opens a superbundle, and
`build_bundle` a bundle inside it -- so it needs **two** `build` commands. The first closes the
bundle and prints "Bundle successfully built and added to superbundle!"; the SECOND closes and
writes the superbundle. With one `build` the builder reports that success and writes nothing at all,
and the only honest signal is the engine later saying the superbundle could not be read.

**Confirmed against the live mounter (2026-09-06, run after the fact).** The build and compares the
agent had to skip for machine contention were run:

    build             Bundle successfully built and added to superbundle
                      closure +8 partition(s), +5 resource(s), +6 chunk(s)
    compare unedited  IDENTICAL  (1032 bytes, metaIdentical=True)
    compare edited    IDENTICAL  (1032 bytes, metaIdentical=True)

Both identical is not a failure -- it is the bug, reproduced against the game's own reader. A
MeshSet does not hold the geometry, so a UV edit changes only the CHUNK and `compare_resource` on
the resource cannot see it. That is exactly why comparing the resource referenced the mesh and lost
the edit, and why the fix hashes the chunk.

Still not done: no BOOT. The bundle builds; a level has not been loaded with an edited mesh in it.

    corpus       68 mesh(es) with every LOD chunk present
    unedited     68/68 resource byte-identical to the game
    unedited     68/68 chunk byte-identical to the game
    unedited     68/68 REFERENCED (the game supplies the geometry)
    uv edit      67/68 SHIPPED (the edit reaches the bundle)
    uv edit      1 REFUSED (subsets alias one vertex block; loud, not dropped)
    RESULT       PASS

The writer was never the missing piece. `tools/usd/meshset.py` has emitted MeshSet payloads,
relocation table and resource meta since the first round trip, and Rime has no MeshSet writer at
all -- its `Serialize` methods write a struct header echoing the pointers they read,
`RelocPtr<T>.Serialize` throws, and nothing anywhere emits a relocation table. What was missing was
the DECISION.

**The emitter asked the wrong bytes whether the mesh had been edited.** It compared the rebuilt
MeshSet resource against the game's:

    if original is not None and payload == original:      # reference it

but a MeshSet does not contain the geometry. Positions, normals, UVs and tangents all live in the
CHUNK, and the resource changes only when a count or the bounding box changes. So every edit that
moved neither was called untouched, `add_existing_resource` handed the game's geometry back over
the top of it, and the chunk was never emitted at all -- `for li, chunk in ... if res_path else []`.

Measured on `objects/cableboxsystem_01/cablebox_01_Mesh`, before the fix:

| edit | resource | chunk | old verdict |
|---|---|---|---|
| none | identical | identical | referenced, correct |
| one UV moved 0.25 | **identical** | differs at byte 24 | **referenced -- edit lost** |
| one normal flipped | **identical** | differs | **referenced -- edit lost** |
| one vertex moved | differs | differs | shipped |

A position edit survived only by accident: `_rebound` rewrites the bounding box to the exact
min/max of the positions, and BF3's stored box is not exactly that, so the payload changed as a
side effect. Nothing was relying on the geometry.

**The fix is the pattern collision already uses.** `bf3_usd.export` now authors
`bf3:chunkDigest` on each LOD scope -- the sha256 of the chunk as it left BF3, the same shape as
collision's `bf3:originalDigest`, a digest rather than the bytes because 67 KB per LOD across a
527-mesh stage would carry the game's geometry twice over. `bf3_usd.unedited_geometry` rebuilds the
chunk and compares, and the emitter's rule now reads all three facts:

    def is_referenced(payload, original, geom_ok):
        return original is not None and payload == original and geom_ok is not False

It lives in one function so `tools/usd/mesh_edit_test.py` measures the rule the emitter runs rather
than a restatement of it. A stage exported before digests existed returns `None`, which references
as before and prints how many meshes that covers -- named, not assumed.

**One mesh in BF3 cannot represent a partial edit, and now says so.**
`xp2/objects/decalplanes_02/leaves_01_Mesh` has two subsets that ALIAS one vertex block (both at
VertexOffset 0, VertexDataSize 128 for 4 vertices), so writing them in order made the second
overwrite the first and a UV edit to subset 0 vanished -- clean round trip, nothing reported.
`geom.rebuild_chunk` now refuses a CONFLICTING write to a shared range and names the offset;
identical writes, which is what an untouched mesh does, still pass and byte-identity is unaffected.

**What the bytes are compared against.** The corpus is Rime's own `dump_resource` /
`dump_chunk` output, so "identical to the game" means identical to what the mounted game hands
back, not to a previous run of this codec. The whole 2,078-resource corpus still round-trips
byte-identical after the change (2078/2078 resources, 166/166 chunks) -- the digest is USD
customData and touches no emitted byte.

**Confirmed against Rime's own reader, not only ours.** `compare_resource` compares a candidate
against the MOUNTED game rather than a dump, so it has no third state, and it checks the meta too.
On `objects/cableboxsystem_01/cablebox_01_Mesh`:

    compare_resource ..._Mesh unedited.meshset   IDENTICAL (1032 bytes, metaIdentical=True)
    compare_resource ..._Mesh edited.meshset     IDENTICAL (1032 bytes, metaIdentical=True)

The second line is the finding, not a formality: after a UV edit the resource is byte-identical to
the game's under Rime's own comparator, meta included. Asked of the resource, an edited mesh and an
untouched one are the same file. The edit is entirely in the 1,616-byte chunk, at offset 24.

**It builds.** `build_sb` / `reference_existing_partition` / `add_resource` (with meta
`B0030000000000005800000070009400`) / `add_chunk` / `build`:

    Closure of 'objects/cableboxsystem_01/cablebox_01': +8 partition(s), +5 resource(s), +6 chunk(s)
    Bundle successfully built and added to superbundle!
    Superbundle successfully built!
    sb 89,536 bytes   toc 741 bytes   0 errors

**And the edited bytes are demonstrably IN it.** A superbundle is compressed, so the chunk is not
findable verbatim; the check that works is a control build differing in exactly one input. Same
commands, same everything, only `edited_0.chunk` swapped for the game's own:

    edited  sb 89,536 bytes
    control sb 89,536 bytes
    DIFFER  634 byte(s), first at offset 296, last at 12,327

Same size, 634 bytes apart in the compressed chunk region. Had the emitter referenced the mesh, or
dropped the chunk, the two would be identical -- which is exactly what the old rule produced.

**Still NOT done, and not to be read as done:** no boot. The bundle builds and the engine's
acceptance of an `add_chunk`-written RAW chunk (the referenced path copies it compressed) remains
UNVERIFIED, as `docs/usd-roundtrip.md` §7 already flags. What is verified in-game is a POSITION
edit: §0 predicted an AABB before the run and the engine reported it exactly, from bytes this
toolchain wrote. A UV edit appears in no number the server prints, so confirming one means looking
at a texture on screen, and that was not done.

## The closure is editable, not just shipped (2026-09-06)

A level export that stops at the level's own partitions exports a fraction of what the level IS.
MP_001 owns 490; the closure it pulls in is 10,396 -- the weapons, soldiers, vehicles, sounds and
voice-over it cannot run without. Those already shipped, so they travelled with a mod either way;
what they could not do was be EDITED.

    closure      10,396 partition(s), 211,765 instance(s), 802 type(s)
    read back    211,765 prim(s) under /World/Library
    fields       776,004 compared, 0 changed
    instances    0 never authored
    names        10,396 partition name(s) carried
    stage        243 MB

Authored under `/World/Library` rather than into the level's world: a soldier blueprint is an asset
the level draws on, not something placed somewhere, and putting it in the spatial hierarchy would
say it was.

**Edits go back.** A closure partition the stage changed now ships with the change applied, on the
same rule the level's own entities follow -- only records that actually differ, so an unedited
closure rewrites nothing. Verified end to end at the stage layer: an `EmitterTemplateData` field
edited 4.0 -> 11.5 in USD comes back as 11.5 keyed to its partition
(`tools/usd/closure_edit_test.py`). One wrinkle worth keeping: the closure is authored under its
guid FILE name and ships under its partition NAME, so the writeback looks under both -- keyed on one
alone, an edit to a weapon silently never lands.

**Verified end to end, into a running game.** A combined level+closure stage (66.6 MB) with one
edited emitter field: emitted, built, booted.

    build   bundles=8  errors=1 (the known rugpile_01_n)  sb=55,050,624
    boot    Level:Loaded

Getting there cost two fixes, both the same root cause -- once the closure is authored into the
stage, `stage_entities` stops meaning "this level's entities":

- **Asset referencing went global.** The emitter referenced every `SoundWaveAsset` it could see --
  tank cannons, sniper layers -- 2,629 resources instead of 1,166, and 992 of them do not resolve.
- **Closure reference objects were copied into our world parts.** That is the arrangement this
  document already records as fatal, and it failed exactly as recorded: the load reaches "Creating
  entities for autoloaded sublevels" and the process exits.

Both are fixed by the same rule: only partitions the LEVEL owns are the level's. The closure is a
library, and its assets resolve from the game's own bundles.

The earlier stage-layer result:

    closure   1 partition(s) rewritten with edits from the stage
    closure   10396 partition(s): 10396 shipped, 0 referenced
    FOUND     DistanceScaleFarValue = 11.5 in
              clo_fx_impacts_metal_emitter_m_em_impact_metal_sparks_01_m.json

Exactly one partition rewritten out of 10,396 -- the rule holds under a real emit, not just in
principle. The level's own 490 partitions and the closure's 10,396 are DISJOINT (measured: 0 in
both), so nothing is authored twice and two prims cannot hold conflicting edits for one instance.

## "Round trips" is not "can be written back" (2026-09-06)

A correction to claims made earlier in this document, including by the agent that wrote them.

Several rows here report **0 changed fields** -- scattering, terrain layers, Enlighten, the whole
802-type closure. That measures REPRESENTATION: the data survives BF3 -> USD -> BF3-shaped JSON
unchanged. It does NOT mean an edit can reach the game, because that needs a WRITER for the
resource, and several of those writers throw.

Every `Serialize` in Rime that still throws `NotImplementedException`, and what it costs:

| resource | consequence |
|---|---|
| `VisualTerrain`, `VisualTerrainLayer`, `TerrainLayerCombinationDraw`, `Surface2d/3dDrawMethod` | **terrain layers and mesh scattering cannot be written back** -- only the leaf `MeshScatteringType.Serialize` was implemented |
| ~~Ant DCT `Header`/`DofTable`~~, `PackageMeta` | **`Header`/`DofTable` now write** (2026-09-06, above); `PackageMeta` still throws, which costs nothing while banks are patched in place |
| `MeshLayout`, `GeometryDeclarationDesc`, `OccluderMeshData` | mesh geometry is export-only |

~~`HavokPhysicsData`, `ExternalTextureConstant`, `ExternalValueConstant`, `StreamingPartitionHeader`,
`RelocPtr`, `RelocArray`, `Matrix44`~~ -- all seven now write, byte-verified against the whole game;
see the section at the top of this document. Two of those rows were wrong when written: the
`Serialize(RimeWriter)` on `StreamingPartitionHeader` and on `RelocArray` was already implemented,
and only the `out byte[]` overload threw.

Not a blocker: `EALayer3Header`/`EaLayer32Block` -- BF3 ships 100% XaSeekable1, so they are off its
path entirely.

**The rule this document should have followed from the start:** a row may claim "round trips" on a
USD measurement, but "editable end to end" requires a working writer AND a boot test. Only entity
and reference edits, terrain heights and unedited collision meet the second bar today.

## Does a level actually RENDER in Blender? (2026-09-06)

Geometry, yes. Importing mp_001's stage:

    objects 9,214   meshes 116   verts 1,057,970   faces 2,099,262   materials 118
    lights 0        images 3

Two things were wrong, and neither was Blender:

- **0 lights** because that stage was exported without `--ebx-dir`, so no entities were authored at
  all. Lights exist in the pipeline as UsdLux; they were simply not in that file.
- **3 images of 636** because `_stage_texture` fell back to `resource + ".dds"` -- a path that
  resolves to nothing -- whenever a texture was not in the dump. 117 of 118 texture inputs pointed
  at files that do not exist, so the materials read from nothing and rendered grey while every check
  passed. The 117 are **5 distinct resources**, all cross-level decal and road textures
  (MP_017, SP_Earthquake, SP_Sniper) that an mp_001 mesh-texture dump was never going to include.

The slot is now left UNBOUND with `bf3:textureMissing` set and a count printed, because a material
with no texture is honest and one bound to nothing is not.

**A wrong turn worth recording:** the first fix attempted was converting all 636 DDS to PNG for
Blender -- roughly 500 MB of duplication. Blender reads DXT1/DXT5 natively; the fault was five
absent files. Measuring which formats were actually present, and whether the paths resolved at all,
cost minutes and made the conversion unnecessary.

## Blender loses almost everything -- do not trust its export (2026-09-06)

The whole "editable in a DCC" claim rested on an assumption nobody had tested. Measured, on a
40-partition slice through Blender 5.2:

    bf3Entity records   1,208 -> 0        all lost
    typed attributes   10,407 -> 27       99.7% lost
    relationships         436 -> 0        all lost
    prims               2,862 -> 445

Blender drops customData, custom attributes and relationships wholesale. Feeding its export back in
would destroy every field, every reference and the records the writeback reads -- while LOOKING
correct, because the geometry survives and a level still builds.

`tools/usd/dcc_merge.py` takes Blender's output as what it actually is -- transforms and geometry --
and merges those onto the pristine stage. Three things had to be measured to make prims match:

- Blender **re-roots** the stage (`/World/...` -> `/root/...`): 82 of 82 prims "missing".
- It applies its Y-up/Z-up conversion **on the root**, leaving children in its own space, so a
  child's LOCAL transform comes back `(x, y, z) -> (x, -z, y)` and 31 of 82 read as moved when
  nothing was touched. Comparing WORLD transforms cancels it; the new local is derived back out.
- Blender objects share **one flat namespace**, so repeated leaf names are uniquified
  (`e00000` -> `e00000_005`) -- on every path component, not just the leaf.

    untouched trip   0 moved, 0 missing
    one Blender move 1 moved, 0 missing
    data preserved   1,208 records / 10,407 attributes / 436 relationships, unchanged

## Can I open a weapon, change it, and save it back? (2026-09-06)

The honest table, because "represented" and "editable end to end" are different claims:

| | today |
|---|---|
| Open a weapon and see its whole blueprint | yes -- every field, its sounds, sockets, effects |
| View its animations | yes -- 830 clips with real joint names, as UsdSkelAnimation |
| Change field values | yes -- ~94% of fields are typed USD attributes |
| Re-point a reference (weapon -> projectile) | yes -- 256,459 references are USD relationships |
| Add entries to a list (sockets, chunks) | yes -- arrays are child prims and can be appended |
| Save field and reference edits into a working game | **yes, verified**: edit -> emit -> build -> Level:Loaded |
| Save edited ANIMATION CURVES back | **yes** -- DCT 3,778/3,778, CURV 775/775 and VBR 2,225/2,225 re-encode byte-identical and an edit patches in place; VBR's animated channels (43.6% of its components) are copied, not rebuilt; not boot-tested, and a clip cannot gain frames |
| Save edited MESH GEOMETRY back | **yes** -- an edited mesh ships, an unedited one is still referenced |
| Move things in BLENDER and save back | yes, **via `dcc_merge`** -- never by trusting Blender's own export |
| Save edited textures | yes, but that texture then ships as a copy |
| Save edited collision | rebuilds at 98.4% of the game's object count; not byte-identical to BF3's bake |
| Save edited terrain LAYERS and SCATTERING back | **yes** -- unedited rebuilds are byte-identical on all 33 resources; an edited density changes exactly its 4 bytes |

So data is editable end to end and is most of a weapon. Animation curves now write too, in place
and within the header a clip shipped with.
Mesh geometry is not: the writer is `tools/usd/meshset.py`, in Python, and Rime is not in that path
at all -- checked, and every `Serialize` on `RimeLib.Mesh`'s MeshSet types writes a fixed-size
header echoing the pointers it read, `RelocPtr<T>.Serialize` throws, and nothing emits a relocation
table. There is no C# writer to fix; the Python one is byte-exact against the game.

## How much is actually editable (2026-09-06)

Measured across the whole closure -- 1,238,125 fields:

    before   typed scalars 816,247 + vectors 42,268            69.3% editable
             customData only                     379,610       30.7% carried

    after    + nested records   134,081  ->  namespaced attributes
             + references        95,826  ->  USD relationships
             + arrays of refs    19,723  ->  multi-target relationships
             + arrays of records 52,257  ->  child prims, appendable
             + empty lists       72,730  ->  appendable scopes
             + scalar arrays      4,992  ->  native USD arrays
                                              ~94% editable, remainder appendable

References resolve essentially totally: **256,459 of 256,460** point at an instance that is also in
the closure. Integer arrays are Int64 because BF3 lookup tables hold values past 2^31.

Two silent failure modes are asserted against, not assumed: a reader that reports every reference as
changed would rewrite every partition on every trip, and one that reports none would make
re-pointing impossible. Both were real -- comparing against the record's full guid list rather than
what was authored reported 9 edits on an untouched slice, and the empty-list path skipped its own
read so an appended element was never seen.

## Are we at 100%? (2026-09-06, updated)

**Complete and measured:**

| | evidence |
|---|---|
| USD representation, whole game | 10,396 partitions, 211,765 instances, 802 types, 776,004 fields, **0 changed** |
| Closure editable end to end | edit -> emit -> build -> **Level:Loaded**, 1 of 10,396 partitions rewritten |
| Level graph, all 49 levels | 558,864 instances, 0 authored twice, 23,526,728 fields, **0 changed** |
| Enlighten | 0 changed across three levels; an EDITED bake ships in a built level, 162/162 byte-identical read back out of the 56,251,200-byte superbundle, **LOADED** |
| Update-in-place, stock level | partition and resource of stock `MP_001` overridden; engine reports `USDPATCH_EDIT_OK_C`, `trans(12.500,34.250,56.750)`, `aabb min(-7.500,-2.250,-6.750)` |
| Terrain heights | byte-exact; untouched terrain emits 0 changed nodes |
| Terrain rasters, layers, scattering | 0 changed |
| Collision, unedited | byte-identical, with an edit guard |
| Emitters and scattering | visible GUIDE geometry; 209 markers, 0 that render |
| Art referencing | 527 meshes + 639/640 textures from the player's install; 55 MB; loads |
| Mesh geometry, editable | unedited 68/68 referenced and byte-identical; UV edit 67/68 ships, 1 refused |

**Native USD forms:** lights `UsdLux` (Distant/Sphere/Disk + ShapingAPI), physics `UsdPhysics`,
audio `UsdMedia`, skinning `UsdSkel`, animation `UsdSkelAnimation`, roads `BasisCurves`, terrain and
decals real `Mesh`, scattering preview `PointInstancer`. Everything else is typed `bf3:` attributes
with the record in customData.

**Byte-identical against the game's own bytes** -- the strongest claim available, and now the
common case rather than the exception:

| | evidence |
|---|---|
| Animation clips, ALL FIVE codecs | DCT 3,778 + CURV 775 + VBR 2,225 + uncompressed 2,191; **338,458,436 / 338,458,436** payload bytes |
| Animation clips (CURV) | 775 / 775 clips, all patchable |
| Animation clips (VBR) | 2,225 / 2,225 clips, sections exact, 14,891 / 14,891 const quats unit |
| Terrain layers + scattering | 33 / 33 resources, 1,036,583 / 1,036,583 bytes |
| StreamingPartitionHeader | 73,371 / 73,371 -- every EBX partition in BF3 |
| ExternalValue / TextureConstant | 190,486 and 102,528, all identical |
| RelocPtr / RelocArray / Matrix44 | 68,558 / 113,075 / 14,115, all identical |
| HavokPhysicsData | 7,617 / 7,617 (5.2% written from fields, the rest carried verbatim) |
| Mesh resource + chunk | 68 / 68 unedited byte-identical; 2078 / 166 regression clean |
| Terrain heights | untouched terrain emits 0 changed nodes; 499,230 samples, deviation 0 |

**Not complete:**

1. **VBR's per-frame blocks are not decoded.** All five animation codecs now have writers -- DCT
   3,778, CURV 775, VBR 2,225, uncompressed 2,191, all byte-identical, 338,458,436 payload bytes --
   but 133,985 of VBR's 307,530 channel components (43.6%) are ANIMATED and stay read-only; the
   56.4% constant ones read and write. No function of the per-component descriptors predicts a
   block's length, so those bytes are copied rather than re-encoded, and the encoder says so.
2. **Havok rebuild: 81 objects against the game's 120**, now itemised (+34 rotated placements, +11
   cylinders, +3 list/MOPP, -9 connectivity). Corpus-wide the builder covers 299,746 of 400,053
   objects (74.9%). 44.3 MB of `hkpMoppCode` and 24.9 MB of `hkpCompressedMeshShape` are Havok SDK
   bakes and are NOT reproducible -- those resources can be preserved verbatim, never rebuilt.
3. **99,781 of 155,290 Havok placement wrappers are unreached**, every one held only by
   `hkpExtendedMeshShape`, whose subparts point at a few hundred shared wrappers from 819,307 slots.
4. **Water is readable, not writable** -- rebuilding a triangle mesh needs its MOPP.
5. **Blueprint linkage: the level's own placements are 1,839 of 1,840.** Exactly ONE names a
   blueprint that exists nowhere in the game. The 163 residual reported by `link_blueprints` is
   closure-INTERNAL -- blueprints referencing other blueprints -- because the pass walks every prim
   in the stage, not just the level's; 3,362 of 3,525 link overall.
   Getting there established something about the goal's two halves. The 132 blueprints behind 832
   of those placements -- bicycles, office chairs, cardboard boxes -- are **not in the shipped
   closure at all**, and the level still boots with the right entity count because they resolve from
   the player's own install. That is "100% referenced" working correctly, while "100% editable"
   needs them IN THE STAGE. The two pull opposite ways, and the resolution is the split the rest of
   the pipeline uses: author for editing, ship only if edited. Dumping the 132 took linkage from 258
   to 1,107 without adding a byte to the bundle.

6. **Terrain's 7-layer splat has no USD form.** All the data round trips; USD has no splat shader.
7. ~~**Update-in-place unproven**; Enlighten is not re-injected into a built bundle.~~
   **DONE 2026-09-06** (both sections at the top). A mod changes an EBX partition AND a resource
   of stock `MP_001` and the engine reports the edited values; an edited Enlighten bake is in a
   built level superbundle, 162/162 byte-identical read back out of it, and boots. What is still
   NOT shown: a dedicated server does not read Enlighten at all -- a deliberately corrupt bake,
   shipped in the winning order, loads -- so the GI claim is acceptance, not consumption.
8. **48 of 49 levels have never been booted** (a sweep is running).

**Superseded by the writers landing:** "0 changed is not byte-perfect" was item 2 of this list.
Eight subsystems now have byte equality against BF3's own bytes, so the distinction it drew has
mostly been closed rather than argued away.

## The one-line state

**The complete configuration loads.** mp_003: 53,121,744 bytes, 0 errors, 0 unresolved, 35/35 world
parts live in the engine, full 10396-partition closure shipped, objects reaching the level through
BF3's OWN world parts. Terrain's painted detail (below) is the remaining category.

## Where the completeness gap actually is (measured 2026-09-06)

Three configurations, same level (mp_003), same corpus:

| configuration | content | verdict |
|---|---|---|
| reduced (self-contained types only) | 660 instances | LOADED |
| full closure, reference objects NOT authored | 10396 partitions, 53 MB | LOADED, 0 errors, 35/35 |
| full closure + every reference object COPIED into our world part | 3609 instances | **EXITED** in entity creation |
| full closure + the level's OWN world parts, copies dropped | 32 real world parts + 660 ours | **LOADED**, 0 errors, 35/35 |

The closure is harmless. What the engine refuses is **a copy of the level's ReferenceObjectData
inside a world part we invented**. Pointing our sub-level at the level's own
`WorldPartReferenceObjectData` instead -- their `WorldPartData` partitions ship with the closure --
instantiates the arrangement BF3 itself bakes, and 2949 duplicates simply stop being emitted.

## The bundle is 6 MB, not 55 (2026-09-06)

Dropping the closure, confirmed independently on mp_001 through the emitter's own `ship_closure`
option and booted:

    with closure     55,050,624 bytes    errors=1    LOADED
    without          6,157,728 bytes     errors=1    LOADED, full chain to Running
    add_json_partition  12,114 -> 1,718

**89% smaller, and it still loads.** That 49 MB was EBX we AUTHORED -- verbatim copies of the game's
own partitions, `weapons/knife/u_knife` emitted with DICE's own PartitionGuid. Removing it is not
just a size win: it is the largest block of original game data the mod was carrying, which is what
"referenced, not shipped" was always about.

A separate run on the fixed host measured the rest of the numbers unchanged: world parts 25/25,
static entities 6200, texture warnings 476, teams registered, with and without.

The default is still `ship_closure=True`. Two levels agreeing exactly is strong and it is not 49 --
the sweep that booted 48 levels ran WITH the closure, so it has to be re-run before the default
moves.

## A level that ships no original art (2026-09-06)

    build   bundles=8  errors=1 (the known rugpile_01_n)  sb=55,050,624
    boot    RESULT LOADED -- LoadingInfo: Running, Level:Loaded name=Levels/REALITYMOD/REALITYMOD

**297 MB -> 55 MB**, and it loads. 527 mesh resources and 639 of 640 textures come from the
player's own install; the single exception is a flat normal map that is ours. What remains in the
bundle is EBX -- the 10,396-partition closure plus 1,718 partitions we author -- and no pixels or
geometry of DICE's.

## Referenced vs shipped: the closure was doing both (2026-09-06)

The rule is embed if EDITED, reference if not. Meshes and textures follow it -- 527 mesh resources
and 639 of 640 textures come from the player's own install, the one exception being a flat normal
that is ours. The closure did not: it was referenced AND shipped in the same build, so the
references saved nothing.

    before   add_json_partition 12,114   reference_existing_partition 10,396
    after    add_json_partition  1,718   reference_existing_partition 10,396

**TESTED, AND IT FAILS.** With all 10,396 referenced and none shipped the build succeeds (its only
error is the known `rugpile_01_n`, a texture BF3 itself never shipped) and then the level dies during
load: 3 ticks, `Level:Loaded=0`, process gone. The superbundle also grew to **1,832,446,064 bytes**,
6x the shipped version, which is the tell -- `reference_existing_partition` is not a pointer. It
pulls the partition AND its resources into our superbundle, so referencing the closure costs more
than shipping it and breaks the load as well.

So the rule "embed if edited, reference if not" holds for RESOURCES (meshes, textures) and does NOT
hold for the closure's partitions. The closure must ship. `reference_closure=True` is kept only so
the experiment can be re-run against a future builder; the default stays off.

Of the 1,718 that remain, 641 are ours (`dust2/...`: mesh partitions, MVDB, world parts) and 1,077
are our own EBX authored under the GAME's names for meshes and blueprints. Referencing those
instead was measured to make the engine reject the bundle, but that measurement predates the
closure being referenced, so it is worth re-running.

Checked before booting: 10,392 referenced against 1,718 emitted, **0 names in both** -- nothing
shadows. That was written when shadowing was believed impossible; it is not (top section), but the
disjointness is still worth keeping, because a name in both would make the winner depend on bundle
ORDER rather than on intent.

## The whole game round trips, not just a level (2026-09-06)

A level's own partitions are a narrow slice of BF3 -- weapons, characters, vehicles, sounds and
voice-over live elsewhere -- so judging the pipeline on one level flatters it. Measured against the
full shipped closure with `tools/usd/partition_coverage_test.py`:

    corpus       10,396 partitions
    authored     211,765 instances across 802 types
    fields       776,004 compared, 0 changed
    instances    0 never authored
    RESULT       PASS

802 types is effectively everything a level pulls in. The first run reported 3 changed fields in
`DataSetNode` and `InstanceOutputNode`; those were the TEST aliasing instances, not the pipeline.
BF3 instance guids are PARTITION-SCOPED and recur across partitions, so indexing by guid alone let a
later prim overwrite an earlier one and three fields came back holding another instance's values --
which looks exactly like three lossy fields. Identity is `(partition, instance)`.

## Coverage

| | status | evidence |
|---|---|---|
| Placements | 334,367 across 49 levels | after the sub-world fix; was 223,739 (+1.5x) |
| Levels whose BUNDLE loads | **48/49** | emitted, built, `Level:Loaded`, 316,586 static entities against 316,538 placements; the 49th (`web_loading`) has 0 meshes. **NOT the same as playable** -- every one registers ZERO teams, so no player can enter. `Level:Loaded` was never evidence of a usable level, and every headless check passed while it was unusable. |
| Meshes / textures | referenced from the player's install | bundle 297 MB -> 7 MB (41x); ships no original art |
| Entity fields, all 440 types | typed USD attributes | 35,298 authored; round trip **0 changed fields** |
| Level graph (ownership) | `/World/Level`, world parts own their objects | 49/49 levels; 151,362 owned objects = 151,362 in the EBX; **0 changed** over 23,526,728 fields |
| Skinned meshes | UsdSkel | 535/535 byte-identical, 1632/1632 chunks |
| Meshes, whole corpus | parse/serialize + USD | 2078/2078 resources, 166/166 chunks byte-identical |
| Animation clips | UsdSkelAnimation | 113,066/113,066 channels identical, **named joints** |
| AnimTrackData | time samples + Bezier | 1484/1484 byte-exact |
| Collision | UsdPhysics prims -> HavokPhysicsData | decodes valid: both packfiles, hkpBoxShape/hkpConvexTranslateShape |
| Audio headers | BitWriter + SndPlayer/Chunk serialize | round trip lossless (plain/looping/stream) |
| Lights, volumes, triggers, areas | UsdLux / boxes | ~2000 area+trigger volumes now visible |
| Terrain rasters (mask/material/destruction) | base64 node blocks | mp_001 344 nodes, 2.6 MB, **0 changed**; header 15 fields 0 changed |
| Terrain layer palette + draws | typed prims | mp_001 7/128, mp_007 10/184, sp_valley 10/234 -- **0 changed** |
| Terrain mesh scattering | typed prims per type | MP_007 23 / SP_Valley 22 / MP_001 5 types; 598+572+130 fields, **0 changed** |
| Terrain layers + scattering WRITTEN back | Rime `VisualTerrain` writers | 33/33 resources, 1,036,583/1,036,583 bytes byte-identical; edit probe passes on all 33 |
| Terrain heights, editable | per-node meshes | untouched: **0** changed nodes; 499,230 samples, worst deviation **0**; one edit -> 1 node, bytes exact |
| Enlighten bake (probes, databases, systems) | base64 resources + probe points | mp_001 162 res / 377 KB, mp_007 156 / 240 KB, sp_valley 236 / 59.6 MB -- **0 changed** |

## Collision: byte-perfect when unedited (2026-09-06)

    MEHouse01Large    21,304 bytes   identical (preserved)   + edit guard PASS
    BigRadioTower     47,272 bytes   identical (preserved)   + edit guard PASS

The rule is the one the rest of the pipeline already runs on -- terrain emits only the nodes that
changed, meshes reference the player's install -- applied to collision: an unedited resource hands
back the game's own bytes rather than a rebuild. A rebuild can only approximate BF3's baker (object
order, padding and fixup layout are its choices), so regenerating data nobody touched would be
guessing where the real bytes are already in hand.

The digest that decides "unedited" quantises to **float32**, not to a fixed number of decimals: a
half-extent came back 1.011325 against 1.011324, which is one float32 seen through a double, not an
edit.

A preservation test that always preserves proves nothing, so the test also moves a shape and asserts
the original is REFUSED. Both resources pass both halves.

**Still open:** the rebuild path. Our packfile holds 81 objects against the game's 120, so editing
collision produces a correct resource, not BF3's bytes.

## The scene graph is now the level graph (2026-09-06)

Entities nested by partition path, which made a level browsable and left it structurally wrong. A
partition is a FILE; a world part is a CONTAINER, and the two are not the same thing -- so a
`WorldPartData` prim's children were "other instances that happen to live in the same file", you
could not select a layer and get the layer, and the meshes were not in the tree at all. They sat
in a flat `/World/<mesh>/inst_N` list beside it, which meant the geometry and the EBX record that
places it were two separate things a DCC could move independently and disagree about.

BF3 spells its own graph out in the EBX and nothing here had to be guessed:

    LevelData.Objects
      WorldPartReferenceObjectData -> Blueprint    -> a partition whose primary is a WorldPartData
      SubWorldReferenceObjectData  -> BundleName   -> a partition whose primary is a SubWorldData
        ReferenceObjectData        -> BlueprintTransform places an object blueprint

That is now the hierarchy: `/World/Level` is the LevelData, each reference object owns the
blueprint it points at, and each `WorldPartData` owns the objects its `Objects` list names.
`tools/usd/level_graph_roundtrip_test.py`, run over all 49 levels:

    instances       558,864 authored of 558,864, 0 authored twice
    in the graph    155,512 (27.8%), up to 7 containers deep
    containers      151,362 owned objects against 151,362 named by the EBX's own Objects lists
    reference objs  4,103 structural, 4,101 own their blueprint
    placements      55,658 of 334,367 (16.6%) now sit under the object that places them,
                    all 55,658 at the transform they were dumped with, to the bit
    round trip      23,526,728 fields compared, 0 changed

mp_001 alone: 3,566 of its 14,033 instances owned, 5 deep, 1,297 of 6,525 placements anchored,
594,912 fields compared, 0 changed. The prims read like the level did -- `o000_layer0_default`,
`o004_layer4_buildings`, `o005_squad_deathmatch`, and inside a layer `o003_acunit_01_Mesh`.

**No regression, measured against the same run on HEAD before the change:** `level_roundtrip_test`
534/534 prototypes byte-identical and 534/570 placement sets preserved, both before and after;
`import_level_usd --verify` 78,300 floats compared, largest disagreement `0.000000000`, EXACT,
both before and after; `level_entities.read` 14,033 records / 594,912 fields / 0 changed, both
before and after. Same numbers, different tree.

Three things this turned up, all measured:

- **A placement can only be anchored on an EXACT transform match.** `placements.json` is the
  ENGINE's flattened list, so the link back to the reference object that produced it is the
  transform and nothing else. Matching to 1e-9 found 71 more on mp_001 than exact equality did,
  and every one would have parked a mesh on a transform that is not bit-identical to the dumped
  one -- which is the only thing the placement round trip measures. Exact it is; of mp_001's 1,297,
  8 land on a transform more than one reference object shares.
- **The read-back had to become LOCAL.** With Scopes for parents, local and local-to-world were
  the same matrix; with a world part as a real parent they are not, and writing the world
  transform back would fold the owner's placement into every child on every trip. It is a no-op
  today -- **0 of 4,103** world-part and sub-world reference objects across the 49 levels carries a
  non-identity `BlueprintTransform` -- but that is a fact about BF3's data, not about the code.
- **A USD prim name cannot start with a digit.** `AppendChild('000_layer0_default')` returns the
  EMPTY path with no error, and the failure surfaces hundreds of prims later as "Path must be an
  absolute path: <>". Names are `o000_...`.

Two honest limits:

- **Shared object blueprints are not descended into.** A prop used sixty times would be authored
  sixty times, sixty prims writing back to one EBX record, and fifty-nine edits would vanish with
  nothing reported. So 403,352 instances -- the contents of those blueprints -- are still filed by
  partition path under `/World/Entities`, and the 278,709 placements whose mesh is inside one stay
  in the flat per-mesh groups. Both are found by the same key (`bf3:mesh` on the placement prim),
  so nothing is lost; it is the tree that is incomplete, and completing it needs the
  `objects/`/`props/` EBX this corpus does not have.
- **mp_subway names two sub-worlds that are not there** -- `Levels/MP_Subway/ART_PC_only` and
  `Levels/MP_Subway/Conquest_Large`. That is the entire gap behind 4,101 of 4,103, and it is the
  data, not the resolver.

One unrelated bug fell out of running the exporter from a shell: `export_level_usd.py`'s CLI
passed its options POSITIONALLY into a signature they no longer matched, so `--ebx-dir` landed on
`scattering_path` and `--scattering` on `parts_list`. It now passes by keyword.

## Collision can now be read, not only written (2026-09-06)

    BigRadioTower     35 shapes (26 box, 9 convex)   537 values   0 changed
    MEHouse01Large    39 shapes (38 box, 1 convex)   265 values   0 changed

**SUPERSEDED 2026-09-06** (section at the top). Those 35 were the distinct box and hull OBJECTS, not
the placements: BigRadioTower actually places 89 shapes -- 26 boxes instanced 69 times, 11 cylinders
and 9 hulls -- and 67 of them are rotated by an `hkpConvexTransformShape` nothing decoded. The tower
spans y = 0 to 282.7, not 0 to 33; the 0-33 below was two readable wrappers out of 69.

The tower's boxes reach 27 m half-extent over centres spanning 0-33 m; the house tops out at 7.65 m
and 4.5 m. A tower reading as a tower is the check that these are geometry rather than plausible
noise.

Two things this turned up, both invisible until real game data went through:

- **Havok's planes are POST-radius.** They describe the hull after the convex radius inflates it, so
  no vertex lies on any plane: measured 0 vertices at 1e-3 and 3-5 at 1e-2 against a radius of
  0.0085. Fed back raw they match nothing.
- **`convex_layout.faces` used eps=1e-3, which is too tight for the game's own float32 hulls.** Two
  radio-tower hulls came back with 11 of their 12 planes -- silently rounding a face off a shape BF3
  ships. Across 1e-3 .. 2e-2 the kept count is 11 at 1e-3 and a stable 12 from 3e-3 up; a plateau
  that wide says 12 is the true count. Default is now 5e-3.

**This is not yet a 1:1 BF3 -> USD -> BF3 trip.** The rebuild-and-compare-bytes leg is unwritten,
and that is the only evidence that would justify the claim.

## Terrain rasters and layer palette (2026-09-06)

`SingleTerrainLayerData` (268) and the mask/material/destruction trees (33 each) were bare EBX
markers with their data in resources, so a level kept its heights and forgot what the ground was
MADE of.

    mp_001    344 raster nodes, 2.6 MB, 0 changed; tree header 15 fields, 0 changed
    layers    mp_001 7/128 draws, mp_007 10/184, sp_valley 10/234 -- 0 changed

Rasters are base64 sample blocks rather than images, deliberately: a mask node is a quadtree cell at
its own resolution (66/side against 256 material, 133 destruction), so one flattened picture is the
lossy trap the heightfield already taught us. Editable painting is listed above as still open.

Two identity traps worth keeping, both measured:

- Mask nodes are **not** identified by `(level, indexX, indexY)` -- 307 nodes over 6 distinct cells,
  up to 88 sharing one. Naming by the triple collapsed 307 prims into 6, and the round trip caught
  it only because it counts what came back. Ordinal is the identity.
- Raster nodes carry **2D** bounds (`[x, z]`); the heightfield carries 3D. A fixed `Vec3f` drops or
  invents a component, so bounds are float arrays.

## Terrain mesh scattering now round trips (2026-09-06)

EBX carries none of it: `TerrainMeshScatteringType` is a bare DataContainer with no fields, so a
level could export and come back with its grass gone while every check passed. The parameters live
per-layer in the VisualTerrain resource.

Rime could read them and no further: every field past `RandomPositionOffset` was private,
`Serialize` threw, and `VisualTerrainInfo` carried nothing about scattering. READING that is fixed
in Rime (`3180763c`) -- and only reading: `3180763c` implemented the leaf `MeshScatteringType`
writer alone, and everything above it still threw, so nothing measured below is evidence that an
edit could be saved. That gap is closed separately (top section, same day); the numbers here are
the READ round trip and nothing more. `tools/usd/scattering.py` authors each type as a prim with
all 26 fields as typed `bf3:` attributes -- deliberately NOT a PointInstancer, since scattering is procedural and explicit
instances would invent data the game never stored.

    MP_007     23 types over 10 layers   598 fields   0 changed
    SP_Valley  22 types                  572 fields   0 changed
    MP_001      5 types                  130 fields   0 changed

MP_001's 5 is exactly its count of `TerrainMeshScatteringType` markers in EBX -- an independent
check that the parse is right rather than merely self-consistent.

**The trap this hid behind, worth remembering:** the first run reported 0 types on EVERY level
including Caspian Border. That was not the format -- `RimeLib.*.Frostbite2_0` assemblies load at
runtime and are NOT referenced by RimeREPL, so building the REPL alone left the reader STALE while
the interface change in `RimeLib.Terrain` went through. A present-but-empty field reads exactly like
"this level has none", and cost a full byte-level reverse-engineering pass that only proved Rime's
existing layout was already correct.

## Terrain heights round-trip byte-exact (2026-09-06)

The composite at `/World/Terrain` is a VIEW. Editing it could never be lossless: composite -> node
grid needs a resample, and a resample changes samples nobody touched, so an untouched terrain came
back "edited" and would rewrite trees the game ships.

Each node is now authored as its own mesh (`/World/TerrainNodes/node_<d>_<x>_<y>`, `guide` purpose)
at its own interior size -- 129x129 of BF3's 133 grid, 2-sample skirt -- with `Y = sample *
worldScaleY`. That is a pure scale, so the inverse recovers the stored integer exactly.

`tools/usd/terrain_roundtrip_test.py`, on mp_001:

    export       30 node mesh(es) authored
    untouched    0 changed node(s)                    PASS
    samples      499230 checked, worst deviation 0    PASS
    one edit     1 changed node(s)                    PASS
    edited bytes PASS (0 sample(s) differ from expectation)

One correctness fix went with it: the writeback used `astype('<u2')`, which TRUNCATES, so a float32
divide landing on 12344.9999 read as 12344 and an untouched sample reported as an edit. It rounds
now -- that is what makes "unedited terrain emits nothing" true rather than nearly true.

## Enlighten now round trips (2026-09-06)

A level's global illumination was the last big category the export named and did not carry. It is
not in EBX at all: it is a set of resources -- one `EnlightenDatabase` naming its systems and probe
sets, one `EnlightenProbeSet` each, a `StaticEnlightenDatabase` of baked coefficients, an
`EnlightenShaderDatabase` of per-material colours, and on one level `EnlightenSystem` resources
holding Enlighten's own radiosity data. Across BF3: 7095 probe sets, 72 databases, 72 static
databases, 49 shader databases -- the 7288 Rime already re-encoded byte-exactly -- plus 136
`EnlightenSystem`.

`tools/usd/enlighten.py` authors all of it under `/World/Enlighten`, and
`tools/usd/enlighten_roundtrip_test.py` compares DECODED payload bytes:

    mp_001     162 resource(s)     377,036 bytes    0 changed    162/162 reencode exact
    mp_007     156 resource(s)     240,382 bytes    0 changed    156/156 reencode exact
    sp_valley  236 resource(s)  62,538,770 bytes    0 changed    100/100 reencode exact

Payloads are carried verbatim on purpose, not as a fallback. An Enlighten bake describes light for
the geometry that was there when it was computed, so nothing downstream can regenerate one; a tool
that re-derived it would be inventing lighting the game never had. The parsed header rides along
whole in `customData` rather than as a hundred typed attributes, because it is name lists, lightmap
instances and material tables -- and a per-field translation silently drops whatever Rime has not
been taught to name yet.

Two things are authored as geometry so the bake is visible rather than a number in a header:
probe positions as guide-purpose `UsdGeom.Points` (mp_001 573, mp_007 164, sp_valley 1206, all
exact), and each lightmap instance at its transform's translation (1458 / 591 / 148). The instances
are the record that binds one baked lightmap to one placed object; seeing them is what makes "a
bake cannot survive an edit to the geometry" concrete instead of a claim.

Three measurements worth keeping:

- **Probe positions are not the probe count.** mp_001's database reports 2707 probes, but only 38
  of its 159 probe sets ship any positions at all -- 573 in total. The rest carry only the
  indirection grid. A check that compared points to `probeCount` would fail on every level in the
  game while nothing was wrong.
- **All 136 `EnlightenSystem` resources in BF3 belong to sp_valley**, and they are 50.7 MB of that
  level's 62.5 MB. Nothing in Rime decodes them, so they carry payload and no fields. A dump
  restricted to the four types that DO parse would have dropped 80% of sp_valley's Enlighten bytes
  while truthfully reporting 100/100 re-encoded exactly -- the same shape of trap as a level that
  loads because it emitted nothing.
- **sp_valley ships two `EnlightenDatabase` resources**, not one, so "the level's database" is a
  list. Anything keyed on there being exactly one is wrong on the first sub-levelled map it meets.

The new Rime command is `dump_level_enlighten <level> <dest.json>` (`7b6f6de3`). It exists because
the per-resource `dump_enlighten` cannot be driven from outside: probe-set names are discoverable
only from the database's own `probeSetNames`, so a caller has to have mounted and read before it can
ask for them. One mount now answers the whole level.

## Ant clips now name the bone each curve drives (2026-09-06)

`dof037` is now `LeftHandThumb2`. The chain is not the one the old note guessed at
(`AntAnimationSetAsset` -> `SkeletonAsset`): those partitions hold nothing but an
`AntPackageAsset`, and no EBX in the game binds a weapon bank to a skeleton. The names come from
the bank side:

    AnimationAsset.ChannelToDofAsset -> IndexData[channel] = slot in a DOF set
    LayoutHierarchyAsset             -> the DOF set, an ordered list of LayoutAssets
    LayoutAsset.Slots                -> "LeftHandThumb2.q" / ".t" / ".s" / a scalar

All of it lives in ONE package, `animations/antanimations/s_basicassets` -- the only one of the
322 that holds a rig (5 RigAssets, 5 ant::SkeletonAssets, 97 DOF sets, 47 channel maps). Rime
surfaces it now (`DumpAnimationBankCommand`), along with each object's guid, its position in the
bank and its ObjectName -- so clips also stopped being anonymous: they are `M26_Fire Anim`, not
`clip0004`.

`tools/usd/antanim_roundtrip_test.py`, over the 85 weapon banks that carry decoded frames:

    export       830 clip(s) from 86 bank(s), 830 with named joints
    names        79909 joint token(s): 79893 in a shipped SkeletonAsset, 16 rig-only, 0 unaccounted
    spot check   ak74 M26_Fire Anim channels [0, 3, 96] -> Neck.q, Wep_Root.q, Wep_Root.t   PASS
    values       830 clip(s), 14524312 float(s) compared, 0 changed                         PASS

Across the whole game: **6,428 of 8,972 clips named, 1,018,205 channels; 2,541 clips (203,680
channels) left indexed.** The 16 "rig-only" tokens are the IK effector aux joints and the
foot-plant velocity signals -- rig channels BF3's skeletons correctly do not carry.

Three things this cost, all measured rather than assumed:

- **`IndexData` is big-endian** for StorageType 2. Little-endian puts the largest index at 65280,
  which no DOF set could hold; big-endian tops out at 411 against a 746-slot rig.
- **A trajectory-led DOF set repeats its first 8 slots.** Of the 43 (map, DOF set) pairs BF3
  itself states via `ClipControllerAsset.Target`, 18 address indices past the end of the plain
  slot concatenation -- every one by exactly 8 -- and all 18 validate with zero type violations
  once the block is repeated. Without it every 3P soldier clip stayed anonymous.
- **The obvious tie-break is wrong.** Preferring the smallest matching DOF set would name 8,920
  of 8,972 clips, but it contradicts BF3's own bindings on 3 of 57. The shipped rule names a
  channel only when EVERY DOF set that can admit the map agrees, which is 46 right / 0 wrong /
  11 undecided against those 57.

One correctness fix rode along: the DCT codec returns every DOF as a Vector4 and a clip's
trailing `NumFloatVec` channels really use the fourth float (213 of them in this corpus). A
`Vec3f` translation drops it, so it now rides in `bf3:dofW` -- which is what turns "0 changed"
from nearly true into true.

## Open

1. ~~**TERRAIN'S PAINTED DETAIL.**~~ **DONE 2026-09-06.** Heights (byte-exact), mesh scattering,
   the mask/material/destruction rasters and the layer palette with its combination draws all round
   trip on real game data, and layers and scattering now WRITE back too -- 33 of 33 VisualTerrain
   resources rebuild byte-identical and an edited density lands (top section). What is carried is
   not yet all *editable*: the rasters are preserved
   byte-for-byte but cannot be painted in a DCC, which needs the per-node story heights now have.
   `TerrainColorTree` has nothing to author on mp_001 -- the resource's own slot table reads
   `slot2=null` -- so it is unverified rather than done, and wants a level that populates it.

2. ~~**USD scene graph is still not the level graph.**~~ **DONE 2026-09-06** for the level's own
   structure (section above). What is still filed by partition path is the 72% of instances that
   live inside SHARED object blueprints, and with them the 83% of placements whose mesh is inside
   one. Those are not the level's to own -- the honest fix is to author each blueprint ONCE under
   its own scope and have the reference objects point at it the way a mesh prototype is pointed
   at, which needs the object-blueprint EBX (`objects/`, `props/`) dumped; the corpus here holds
   only `levels/`.
3. ~~**No completed 49-level sweep against the corrected (post-sub-world) data.**~~ **DONE 2026-09-06** (section at the top): 48 of 49 boot, with the world parts and the entity
   count the engine reports checked against what was emitted, level by level. What the sweep does
   NOT show is anything DRAWING -- it is a headless server, so it proves the objects exist at the
   right count, not that they render.
4. **Havok: byte-perfect UNEDITED; an edited shape rebuilds and is not BF3's bake.** (Reading is
   substantially fixed since -- section at the top of this file; the rebuild gap below still holds.) Rime reads the
   shapes, planes and Frostbite wrapper, and an untouched resource now hands back the game's own
   bytes -- MEHouse01Large 21,304 and BigRadioTower 47,272, **identical**, with a guard proving a
   moved shape refuses preservation and forces a rebuild. What is NOT solved is the rebuild itself:
   our packfile holds 81 objects against the game's 120, so an EDITED collision resource is correct
   but not byte-identical to what BF3 would bake. Reproducing the packfile exactly (object order,
   padding, fixups, and the object types we do not model) is the remaining work.

4b. ~~**Ant clips cannot be written back.**~~ **DONE 2026-09-06** (section at the top): every DCT
   clip re-encodes byte-identical and an edited one patches into the bank in place. What is NOT
   done is an Ant GenericData archive writer, so a clip cannot be added, removed or re-typed, and
   VBR/CURV now write too (2026-09-06, section at the top); the residue is VBR's animated frame
   blocks, which are not decoded.
5. ~~**Ant clips carry indexed joints** (`dof037`).~~ **DONE 2026-09-06** for 6,428 of BF3's
   8,972 clips (measured above). The remaining 2,541 keep indexed names because their channel map is
   read the same way by several unrelated DOF sets, and this refuses to pick one.
6. ~~**Enlighten** probe data referenced, not authored.~~ **DONE 2026-09-06** (above): every
   Enlighten resource a level ships is authored into USD and round trips with 0 changed bytes on
   three levels. What is NOT done is re-baking: the data is carried, never recomputed, so a level
   whose geometry is edited keeps lighting for the geometry it used to have. That is a limit of the
   format, not of the carrier -- nothing outside Enlighten itself can bake it -- but it means an
   edited level's GI is stale rather than wrong-and-detectable.
7. ~~**Update-in-place** unproven.~~ **DONE 2026-09-06** (section at the top): partitions resolve
   FIRST-wins and resources LAST-wins, so a mod needs two bundles, one prepended and one appended,
   and then both kinds of edit land on a level BF3 ships. **No equivalence check** against BF3's
   own bake.

## Not blockers (corrected)

- **Havok MOPP** -- only needed for large mesh shapes; boxes and convex hulls do not use one, and
  `tools/havok/build_collision.py` writes the resource without the SDK, byte-verified.
- **XAS audio encoder** -- already exists (`Xas1.EncodeBlock`). The missing piece was a `BitWriter`.
- **EA Layer3 headers** -- BF3 ships 100% XaSeekable1, so they are off its path entirely.
- **`objects/rugpile_01/rugpile_01_n`** -- does not exist in BF3 (`where_is` -> `found: false`).
  The game's own MVDB binds a texture that was never shipped; the warning is correct.

## Traps that cost real time here

- **A bundle can only override one KIND of thing at a time, and the failure is silent.** An EBX
  partition resolves from the FIRST bundle in the list that holds the name; a resource from the
  LAST. Prepending -- which every previous attempt did, because the shipped `UsdRoundTrip` mod does
  -- makes a partition override work and a resource override quietly do nothing, and appending
  reverses it exactly. Four boots, one variable, in the top section. Ship two bundles.

- **`build_sb` with a name missing the `Win32/` prefix writes NOTHING and reports success.**
  `build_sb usdroundtrip/scaled ...` printed "Bundle successfully built and added to superbundle!"
  and produced no file anywhere on disk; the engine then said
  `Superbundle 'Win32/UsdRoundTrip/Scaled' could not be read`. The documented form is
  `build_sb Win32/UsdRoundTrip/Scaled` with the prefix and the capitalisation. Same shape as every
  other trap here: success reported, nothing emitted.

- **`pgrep -f <pattern>` matches the WAITING SHELLS of other agents**, not just real processes.
  Several agents ran `while pgrep -f RimeREPL.dll; do sleep; done` to avoid concurrent mounts and
  deadlocked on each other: `pgrep -f` said 4-8, `ps` said **0**, and the machine sat idle for
  ~40 minutes while three agents reported "still busy". Match the process instead:
  `ps -eo pid,comm,args | awk '$2=="dotnet" && /RimeREPL\.dll/'`. The same self-match makes
  `pkill -f` kill your own shell -- it happened three times in one session.

- A level that emits NOTHING loads perfectly. Guard on content, never on the verdict. Four separate
  variants were hit: zero textures, zero meshes, zero placements, zero entities.
- **"Has this been edited?" has to be asked of the bytes that hold the thing.** The mesh emitter
  asked the MeshSet resource, which describes the geometry without containing it, so every UV,
  normal and tangent edit came back "unedited" and was referenced away. The resource and the chunk
  are two files; a rule that reads one of them decides on half the asset.
- `add_existing_resource` failure prints `Could not find resource (...)` -- no "error", no
  "exception". A build-log error grep must include it.
- A crashed build leaves the PREVIOUS level's `.sb`; booting then measures that. Assert the
  superbundle was rebuilt.
- Scope process checks to your own PID, and assert `ModList.txt` every run.
- **`pgrep -f RimeREPL.dll` matches the WAITING SHELL of every other agent doing the same check**,
  because their command line contains the string. Three sessions sat waiting on each other with no
  REPL running at all. Match on the process instead:
  `ps -eo pid,comm,args | awk '$2=="dotnet" && /RimeREPL\.dll/'`.
- **Building one project restages its dependencies and leaves the runtime-loaded plugins stale.**
  `dotnet test` rebuilt `RimeLib.Terrain` and the mount then died with
  "Method 'WriteVisualTerrain' ... does not have an implementation" -- the interface moved, the
  `Frostbite2_0` assembly that implements it did not. Rebuild every `*.Frostbite2_0` before a mount.
