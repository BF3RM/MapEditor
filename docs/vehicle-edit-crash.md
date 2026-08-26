# Editing a vehicle crashes both realms — investigation

Status: **root cause of the reported symptoms fixed; the re-instantiate crash is located but not
explained.**

## What was reported

1. Edits to vehicles appeared to do nothing, and gravity could not be changed a second time.
2. Edits to reference children were discarded when Apply was pressed.
3. A gravity change on a BMP2 *did* work ("it flew up") — and then **spawning a new BMP crashed
   the game, without Apply ever being pressed**.

## What each turned out to be

### 1. Spawned objects could not record any edit — FIXED (`c0d54d1`)

`GameObjectManager` adopted `s_PendingCustomBlueprintInfo.overrides` over the constructor's
`arg.overrides or {}` **without a nil guard**. A plain spawn carries no `overrides` field, so every
spawned object got `overrides = nil`; the first edit then threw

    GameObject.lua:567: attempt to index a nil value (field 'overrides')

inside `SetOverride`, the edit was never recorded, and the following Apply correctly reported
"nothing to apply". Level objects kept their `{}` and worked — which is exactly why editing the
Tunguska succeeded while every spawned vehicle refused.

### 2. Apply discarded edits whose write failed — FIXED (`c0d54d1`)

`ApplyOverridesToBlueprint` ignored `SetField`'s return value while clearing the instance's
overrides unconditionally. `SetField` returns nil when it refuses or cannot descend a chain, so a
failed write took the edit with it, silently.

### 3. Gravity applying globally, and new spawns crashing — FIXED (`c3337f9`)

Both halves are one bug. Cloning a blueprint with an array field whose `typeInfo.elementType` is
nil threw

    DataContainerExt.lua:356: attempt to index a nil value (field 'elementType')

which aborted the **entire** clone. The caller reads a failed clone as "fall back to editing the
SHARED blueprint", so:

* the gravity edit landed (on the shared blueprint) and the vehicle flew — hence "it worked";
* every later spawn of that blueprint was built from the modified original — hence the crash,
  with Apply never pressed.

Both clone paths carried the same deref (`DeepClone` and the path-only `DeepCopy`). With no
`elementType` we cannot tell whether the members are printable, so they are now left **shared**
rather than failing the clone — the treatment unlisted members already get everywhere else.

## The remaining crash

Editing a vehicle still kills both realms. Located precisely by tracing:

    SO-TRACE: clone returned ok=true nil=false
    SO-TRACE: applying override fields to the clone
    SO-TRACE:   field written ok=true path=.object.components.1.vehicleConfig.gravityModifier
    SO-TRACE: writes done; respawn path = RequestReinstantiate
    REINST-TRACE: about to CreateEntitiesFromBlueprint for 'Vehicles/BMP2/BMP2' networked=false variation=0
    <process gone, same second>

`CreateEntitiesFromBlueprint` on a **runtime clone** of a vehicle blueprint faults natively. It is
not a Lua error, so `pcall` catches nothing and no traceback is produced. Both realms die because
both realms clone.

### Ruled out by measurement, not by argument

| Hypothesis | How it died |
|---|---|
| Lazy-loaded containers | `LAZY-BAIL` never fired once; `rootLazy=false` throughout |
| The `networked` flag on a clone spawn | A/B: forcing `networked=false` still crashed |
| Clone failure | After `c3337f9`: `CLONE-DIAG: 0`, `shared-fallback: 0` |
| The delete step of the respawn | `REINST-TRACE` reaches the spawn call, so the delete completed |
| Vehicles need a FULL clone (`d3d3200`) | Reverted — see below |

### `d3d3200` was wrong and is removed

It routed `needNetworkId` blueprints through a full `DeepClone`. Measured on `Vehicles/BMP2/BMP2`,
that copies **8,304 DataContainers** before the engine dies:

| Container type | Count |
|---|---|
| `SoundWaveVariation` | 4,369 |
| voice-over graph (`VoiceOverValue`, `VoiceOverValueConnection`, `VoiceOverCompareNode`, …) | 3,053 |
| everything else | ~880 |

About 90% audio and dialogue data, to change one float on `vehicleConfig`. It is the same cost
problem `2ad600f` was written to solve (a light copying ~236 containers), two orders of magnitude
worse. It only ever *appeared* to help because it routed around the `elementType` throw.

### The one thing that avoids the crash

Skipping `RequestReinstantiate` and letting the existing Disable/Enable refresh run:

    overrides: ["object.components.1.vehicleConfig.gravityModifier"]
    RESULT: edit APPLIED on attempt 1; both realms alive

Same blueprint, same clone, same write. This also matches the field evidence: while the
`elementType` throw was forcing the shared-blueprint fallback (which refreshes rather than
rebuilds), the gravity edit applied and the vehicle flew, with no crash at that moment.

Non-vehicle objects re-instantiate from path-only clones without trouble — `bulk_edit_e2e` passes
40/40, and every one of those goes through clone + respawn.

## Open question

Why does the engine fault building entities from a runtime clone of a vehicle blueprint, when it
builds the same vehicle from the stock blueprint happily (that is how it gets into the level, and
how the editor spawns one)?

Unverified idea, recorded as an idea only: a path-only clone leaves everything off the edited path
pointing at the stock blueprint's containers, so the build sees a graph that is part fresh copies
and part shared originals. That may be fine for a lamp and not for a vehicle. This has NOT been
tested and should not be treated as the answer — four earlier hypotheses died on contact with
measurement.

## Investigation notes for whoever picks this up

* A native fault kills the process instantly, so **the last log line written is the fatal step**.
  `Logger:Error` prints unconditionally and flushes; `Logger:Write` is class-gated and will not
  show.
* The pre-existing comment "Clone bailed (lazy-load / error)" is misleading — in every measured
  case here it was the *error* half. Chasing the lazy-load half cost hours.
* Client liveness must be tested as "does `window.editor` still exist", not "does CDP answer". A
  crashed client relaunches and CDP returns on a fresh page, which reports a dead client as
  surviving.
* `vu.com` is BOTH the client and the dedicated server binary. `pgrep -f vu\.com` matches the
  server too; match `vu\.(com|exe).*-dwebui` for the client and `serverInstancePath.*-server` for
  the server. Distinguish a crash from a kill by exit code: `0` = crash, `143` = SIGTERM.
* Array elements are addressed by their `.name`, which the WebUI emits **1-based as a string**
  ("1" for JS index 0). Passing a raw 0-based index makes `SetField` descend into nil.

## The actual rule (established 2026-08-22)

**A vehicle blueprint that has been modified at runtime can no longer be spawned from.**

Reproduced deterministically, from a clean server, in this order:

    STEP 1  spawn a BMP2 from the stock blueprint   -> alive   (baseline: spawning is fine)
    STEP 2a edit gravityModifier on it              -> alive
    STEP 2b Apply-to-blueprint (writes the SHARED blueprint) -> alive, and every vehicle flies
    STEP 3  spawn ANOTHER BMP2 from that blueprint  -> DIED

This is not about clones, which is where the investigation had been aimed. Step 3 spawns from the
stock blueprint exactly as step 1 does; the only difference is that step 2b modified it.

It also explains the ORIGINAL field report in one line: the elementType bug (c3337f9) made a
per-instance edit fall back to writing the shared blueprint, so the gravity change applied and the
vehicle flew -- and every later spawn of that vehicle crashed, with Apply never pressed.

### What this means for the two paths

* **Refresh (Disable/Enable)** -- what networked blueprints do now (c287ccf). Live entities re-read
  the SHARED container, so a per-instance edit written to the CLONE is invisible; the change only
  appears once Apply writes it to the shared blueprint. That matches the reported experience
  exactly: "I don't see it apply until I press apply to blueprint".
* **Apply-to-blueprint** -- works visibly (all instances of that vehicle pick the change up), but
  leaves the blueprint unspawnable for the rest of the session.

So a per-instance live preview of a vehicle edit is not currently possible: showing it requires a
respawn from the clone (faults natively), and the only thing that does show it -- writing the
shared blueprint -- poisons later spawns of it.

### Not yet known

Why a modified blueprint becomes unspawnable. Candidates, none tested:

* MakeWritable on a partition-resident DataContainer leaves it in a copy-on-write state the
  entity build cannot consume;
* the write invalidates something the build reads (a cached layout, a size/offset table);
* the modification is fine but the SECOND build from the same blueprint is what fails (i.e. it is
  about re-entry rather than modification) -- distinguish by spawning twice with NO edit between,
  which was measured clean earlier and argues against this.

## Cause found: MakeWritable is what makes the blueprint unspawnable (2026-08-22)

Isolated by running Apply in a MakeWritable-ONLY mode -- `s_Shared:MakeWritable()` is called and
the field write is skipped entirely:

    APPLY-DIAG: MakeWritable-only on 'Vehicles/BMP2/BMP2' ok=true -- skipping the field write
    STEP 3 spawn AFTER apply: DIED

So **calling MakeWritable on a partition-resident vehicle blueprint leaves it in a state
CreateEntitiesFromBlueprint cannot build from.** No modification is required; the write is
irrelevant.

Everything else in the chain is now ruled out by measurement:

| Candidate | Verdict |
|---|---|
| The written VALUE (negative gravity) | ruled out -- a benign `gravityModifier = 2` died identically |
| The per-instance CLONE | ruled out -- a clone-only edit (no Apply) spawns fine afterwards |
| Registration (4 forms) | ruled out -- AddInstance, blueprintRegistry:add, AddRegistry, unique name; all succeeded, all still crashed |
| Lazy loading | ruled out -- LAZY-BAIL never fired, rootLazy=false |
| The networked flag | ruled out -- forcing networked=false still crashed |
| Full vs path-only clone | ruled out -- full clone dies inside the audio graph without reaching the build |

### Why the reported behaviour looks the way it does

* A per-instance edit writes the CLONE, so live entities (built from the shared blueprint) do not
  show it -- hence "I don't see it apply until I press apply to blueprint".
* Apply calls MakeWritable on the shared blueprint and writes it. Existing vehicles are already
  built and merely refresh, so they visibly pick the change up ("all the vehicles start flying
  upwards as expected").
* From that moment the blueprint cannot be built from, so the next spawn of that vehicle crashes.

### What this implies for a fix

Apply cannot make a vehicle blueprint writable in-place without giving up spawning it for the rest
of the session. Options, none implemented:

1. Apply to vehicles only via save/bake, where injection happens at level load -- the window in
   which this is supported at all.
2. Keep per-instance clones and never touch the shared blueprint for `needNetworkId` types,
   accepting that the change shows only after a reload.
3. Establish whether MakeWritable is reversible (is there a way back to read-only, or a fresh
   handle from ResourceManager that is unaffected?) -- untested, and the only route that would
   allow live Apply on vehicles.

## CORRECTION (2026-08-22, later): MakeWritable is NOT the cause

The section above claiming MakeWritable makes a vehicle blueprint unspawnable is **wrong**, and is
left in place only so the reasoning trail is honest.

A standalone mod (`Admin/Mods/MakeWritableRepro`, no MapEditor loaded) runs the sequence in
isolation and the bug does not reproduce:

    STEP 1: CreateEntitiesFromBlueprint (networked=true) -> ok, survived
    STEP 2: MakeWritable() -- no field written           -> ok
    STEP 3: CreateEntitiesFromBlueprint (networked=true) -> ok, SURVIVED

So making a resident vehicle blueprint writable, on its own, is harmless. The earlier
"MakeWritable-only" test was run through MapEditor's Apply, which ALSO records
m_AppliedBlueprints and then loops every instance of the blueprint clearing clones and refreshing
them. The poison is somewhere in that remainder, not in MakeWritable.

### What the repro DID establish

**Spawning a vehicle with `networked = false` crashes the realm.** The first two versions of the
repro forced `networked = false` and died on the very FIRST spawn, before touching anything. With
`networked = s_ObjectBlueprint.needNetworkId` (true for vehicles) the identical spawn succeeds.

That is worth knowing on its own, and it is directly relevant here: MapEditor's clone-spawn path
carried a hardcoded `networked = false` for a long time (see the comment in
InvokeBlueprintSpawnFromClone about a clone guid the peer cannot resolve), which is the path taken
by every respawn after an edit.

### Where that leaves the investigation

Still true and measured:
  * a per-instance (clone-only) edit is safe -- spawning afterwards works;
  * Apply-to-blueprint makes the next spawn of that vehicle crash;
  * the written VALUE is irrelevant (a benign gravityModifier = 2 crashes identically);
  * refreshing instead of re-instantiating avoids the crash at edit time (c287ccf).

Now unknown again: WHICH part of Apply poisons the blueprint. MakeWritable is excluded. The
remaining candidates inside ApplyOverridesToBlueprint are the per-instance loop (clone clearing,
SetOverrides, Disable/Enable on every instance) and the m_AppliedBlueprints bookkeeping -- neither
tested.

## Isolated harness findings (2026-08-22)

`Admin/Mods/MakeWritableRepro` is a standalone mod that pulls MapEditor's real `DataContainerExt`
and drives spawn/clone/spawn from Lua with no editor, WebUI, CDP or client. A cycle is ~90s
server-only instead of minutes through MapEditor.

Established there:

1. **A vehicle spawned with `networked = false` kills the realm.** First spawn, no clone, nothing
   modified. With `networked = needNetworkId` (true) the identical call succeeds. This matters
   because MapEditor's clone-spawn path carried a hardcoded `networked = false` (a leftover
   diagnostic) for much of this investigation, so every post-edit respawn was doing the fatal
   thing. Restored to `needNetworkId`.

2. **MakeWritable on a resident vehicle blueprint is harmless.** Spawn, MakeWritable with no write,
   spawn again: all three succeed. This DISPROVES the earlier "MakeWritable makes it unspawnable"
   conclusion recorded above.

3. **Spawning from a runtime clone does not crash — it returns nil.** Both a root-only clone and a
   clone of the exact edited path (root, object, components[1], vehicleConfig) return
   `CreateEntitiesFromBlueprint -> nil` (no entity bus) and the realm stays up. That nil is the
   same `Spawning from clone failed: nil` MapEditor logs.

### Limitation of these results

The harness is SERVER-ONLY. MapEditor's crash kills the CLIENT (and sometimes both realms), so
these findings rule out the server-side clone+spawn path, not the client one. A client-side
equivalent would need the same sequence driven from `ext/Client`.

### What is still unexplained

MapEditor crashes on a vehicle edit; the isolated equivalent does not. The remaining differences,
none yet tested in isolation:

* the override WRITE into the clone before spawning (the harness clones but does not write);
* the delete-then-respawn ordering (MapEditor deletes the original GameObject first);
* the client realm (see limitation above);
* MapEditor's entity-creation hooks (`OnEntityCreateFromBlueprint`) running during the spawn.

## RESOLVED (2026-08-22): it is the clone rebuild, not the blueprint write

Everything above this line was measured through MapEditor, where several effects overlapped. The
standalone harness (`Admin/Mods/MakeWritableRepro`, MODE selects one route per boot, ~90s a cycle,
no editor/WebUI/CDP/client) separates them. Results, each from a clean server:

| MODE | What it does | Result |
|---|---|---|
| `shared-write` | MakeWritable + write gravityModifier on the STOCK blueprint, then spawn a fresh vehicle | **ok — entity bus returned, realm alive** |
| `none` | clone the edited path, write into the clone, spawn from it | nil bus, nothing spawned, realm alive |
| `twice` | same, spawning the clone twice | nil both times, realm alive |
| `reg-first` | AddRegistry(clone root), then spawn — no prior spawn attempt | **CRASH** (exit 0, no Lua error) |
| `root` / `deep` | AddRegistry(root) / AddRegistry(root + copied children), then spawn | **CRASH** |

### What this overturns

**"A vehicle blueprint modified at runtime can no longer be spawned from" is WRONG.** `shared-write`
does exactly that and the fresh spawn succeeds. That section is left above for the reasoning trail,
but it should not be believed: the crash it attributed to the write was coming from the clone path
that MapEditor ran alongside it.

Both earlier "causes" in this document are now disproven by isolation — MakeWritable first, then
the shared-blueprint write. In both cases the mistake was the same: concluding from a measurement
taken through MapEditor, where the clone rebuild was also running.

### The actual constraint

A runtime clone of a networked blueprint cannot be built from, in either direction:

* unregistered, it is unresolvable and `CreateEntitiesFromBlueprint` returns **nil** — silently
  building nothing, which is what "the object vanished" looked like;
* registered, `CreateEntitiesFromBlueprint` **faults natively** — measured for a root-only
  registration and for root + copied children, and with no prior spawn attempt, so it is
  registration itself and not a second build.

That also answers the question left open in `GameObject.lua`'s re-instantiate comment (whether
replication expects the clone guid in ResourceManager): it does, and putting it there is fatal.

### The fix

`GameObject:SetOverrides` now refreshes (Disable/Enable) instead of rebuilding when the shared
blueprint has `needNetworkId`. Live-read fields apply immediately; build-time-only fields wait for
a level reload or a bake, which is the window custom blueprints are supported in at all. Static
geometry still rebuilds from its clone as before.

### Confound worth remembering

The first two crash runs had already attempted an unregistered spawn before registering, so
"registration is fatal" and "the second build is fatal" fit the data equally. `reg-first` (register,
spawn once, no prior attempt) and `twice` (two unregistered spawns, no registration) separate them.
Both controls were needed; neither result was guessable from the first pair.

## Why per-instance vehicle edits are not possible (2026-08-22, closed)

The reported behaviour — "blueprint details update instantly, vehicleConfig gravity waits for
apply-to-blueprint" — is the engine's data model showing through, not a MapEditor bug.

What a level actually places is a `VehicleSpawnReferenceObjectData` (from `Levels/MP_001/
CQ_logic_RU`, via the EBX dump). Everything it can vary per placed instance:

    BlueprintTransform     position / rotation
    Blueprint              -> a REFERENCE to the one shared blueprint
    ObjectVariation        *nullGuid*
    StreamRealm, CastSunShadowEnable, Excluded, Enabled

`vehicleConfig` is not among them. It lives in the blueprint, which every instance points at, so a
change to it is blueprint-wide by construction. Transform- and reference-level fields are genuinely
per-instance, which is why those apply immediately while a config field does not.

### Why a per-instance blueprint cannot be fabricated at runtime

A blueprint's identity is its partition: the EBX dump shows

    partition    AAE95906-AFD4-11DD-84FB-9FA71F68ED5E
    blueprint    AAE95907-...   <- "#primary instance"
    entity data  AAE95908-...

A networked spawn has to put that resource identity on the wire, and a runtime clone is the primary
instance of nothing. Measured in the harness, one route per boot:

| Attempt | Result |
|---|---|
| clone, unregistered | `CreateEntitiesFromBlueprint` -> nil |
| clone + `ResourceManager:AddRegistry` (new container) | CRASH |
| clone + level's `blueprintRegistry`, in LevelInjector's `Registering entity resources` window | CRASH |
| clone + `Partition:AddInstance` into the blueprint's own partition | nil (no crash) |
| clone + `AddInstance` **and** `AddRegistry` together | CRASH |
| clone + `AddInstance` + unique name + the LEVEL's `blueprintRegistry`, in the load window | CRASH |
| the stock blueprint (a real primary instance) | works, entity bus returned |

Note the failure KINDS differ and are consistent: without a resource identity the engine declines
(nil); given registry membership it proceeds and then faults on what it cannot resolve. Partition
residency moves it back to a graceful nil — closer, but still not a resource.

### What a clone actually lacks (measured, not inferred)

Probed with reads only, so no fault could cost the data:

    ORIGINAL  name=Vehicles/BMP2/BMP2  instanceGuid=AAE95907  partitionGuid=AAE95906
    FindInstanceByGuid(ORIGINAL)                      -> found
    CLONE     name=Vehicles/BMP2/BMP2 (collides)      instanceGuid=<fresh>  partitionGuid=NIL
    FindInstanceByGuid(CLONE) before AddInstance      -> throws (no partition)
    assigning partitionGuid                           -> REFUSED by the engine
    FindInstanceByGuid(CLONE) after Partition:AddInstance -> FOUND
    partition primaryInstance still the original      -> true
    renaming the clone                                -> allowed

So `Partition:AddInstance` DOES confer a partitionGuid and make the clone resolvable -- "the clone
has no resource identity" was too strong. And the name collision is real but is not the blocker: a
uniquely-named, registered clone crashes identically.

After that, every attribute reachable from Lua matches the real blueprint -- partition-resident,
resolvable, uniquely named, in the level's own registry, registered in the window where indices are
assigned -- and the networked spawn still faults. The one remaining difference is that the original
is its partition's PRIMARY INSTANCE and the clone is a secondary one. There is no runtime API to
change that: partitionGuid is read-only and partitions are produced by an offline bundle build.

Registration dominates: once the blueprint is registered the engine proceeds and faults, and giving
it a partition home as well does not rescue it. Nothing in the matrix reaches a spawnable resource
except a genuine primary instance.

A POOL of clones registered at level load is the same cell as `load-register`, which crashed --
pooling changes when the clone is made, not what it is. It would fault on first spawn.

Creating a partition is a bundle-build (offline) operation; there is no runtime API for it. So a
per-instance vehicle config variant is not expressible, and no amount of override plumbing changes
that.

### What this means for MapEditor

* Deep config edits on `needNetworkId` blueprints are blueprint-wide. Apply writes the shared
  blueprint, every instance picks it up, and spawning afterwards is safe (measured).
* Per-instance edits remain correct for everything the reference object owns — transform,
  variation, enabled — and for all non-networked objects, which rebuild from their clone as before.
* The refresh-instead-of-rebuild path stays: for these blueprints a rebuild can only ever produce
  nil or a crash.
* Remaining UX question, not a code question: whether a vehicleConfig edit should auto-write the
  shared blueprint (live preview, but visibly affects every instance) or keep requiring Apply with
  the panel saying why.

## The actual fault, captured (2026-08-22)

Everything above inferred this crash from log positioning, because the server launch script sets
`WINEDEBUG=-all` and suppresses wine's exception reporting. With `WINEDEBUG=+seh` (vuctl now
propagates it) the fault is visible:

    warn:seh:dispatch_exception backtrace: --- Exception 0xc0000005.
    trace:seh:dispatch_exception code=c0000005 (EXCEPTION_ACCESS_VIOLATION) addr=005E490F
    trace:seh:dispatch_exception  info[0]=00000000        <- READ
    trace:seh:dispatch_exception  info[1]=00000018        <- faulting address 0x18
    trace:seh:dispatch_exception eax=02080574 ebx=00000000 ecx=02353084
    trace:seh:dispatch_exception esi=00000000 edi=06ecd8d8

A null-pointer dereference reading a field at offset 0x18. Every SEH handler declines it
(`returned 1`) until wine's last-resort handler terminates the process -- which is why the exit
code is 0 and the log looked like a silent, clean exit. It is not a deliberate VU rejection.

### The signature is identical in every configuration

| Run | Clone state | addr | access | esi | ecx |
|---|---|---|---|---|---|
| `reg-first` | registered only, no partition | 005E490F | read 0x18 | 0 | 02353084 |
| `full-load` | partition-resident + resolvable + unique name + level registry, in the load window | 005E490F | read 0x18 | 0 | 02353084 |

Same instruction, same null, same registers. So the missing pointer is NOT `partitionGuid`, not
registry membership, not the asset name -- none of which move the fault at all. It is an
engine-internal field that gets populated when a blueprint comes from a loaded partition/bundle,
and a DeepCopy product never has one. Nothing reachable from VEXT Lua can set it.

That is why every "maybe if we ALSO do X" attempt failed: X was never the null.

### This is a VU-level matter, not a MapEditor one

Two separate things worth raising upstream, with `Admin/Mods/MakeWritableRepro` as the repro (a
~60-line mod, clean server, ~90s):

1. **A crash where a nil return exists.** The unregistered path already returns nil from
   `CreateEntitiesFromBlueprint`. The registered path dereferences null and kills the realm. A
   null check would turn a lost session into a recoverable failure.
2. **No supported way to create a runtime blueprint.** If runtime blueprint variants are meant to
   be possible, this is the missing API; if they are not, `AddRegistry` accepting a synthesized
   container is a footgun that reads as support.

### Bottom line for MapEditor

Vehicles keep the refresh path.

CORRECTION: an earlier version of this line said per-instance deep config on networked blueprints
"is not achievable" full stop. That is too broad and wrong. It is not achievable AT RUNTIME -- but
the bake already does it correctly: `docs/bake-pipeline.md` §5 gives every overridden instance its
OWN partition, which is a genuine primary instance and spawns networked like stock content. So the
feature works in the shipped level; what is missing is only the LIVE preview while editing.

And even that has a route -- a pre-baked placeholder pool, see `docs/bake-pipeline.md` §9. A
placeholder is a real partition-resident blueprint, and writing one at runtime then spawning from it
is already measured safe (MODE `shared-write`). What was never possible was CREATING a partition at
runtime; borrowing one that was baked offline is a different thing entirely.

### What 0x18 probably is (hypothesis, from the server PDB layouts)

`~/Downloads/pdb_dumps/BF.Main_Win32_Final_server.h` carries the engine's class layouts (no
addresses, so it cannot name the faulting function). `fb::InternalDatabasePartition`:

    struct fb::DatabasePartition { vfptr };                  // 4 bytes

    struct fb::InternalDatabasePartition : fb::DatabasePartition
    +0x00  vfptr
    +0x04  m_name
    +0x08  m_domain
    +0x0C  m_partitionGuid          fb::Guid = 4+2+2+8 = 16 bytes, spans 0x0C..0x1B
    +0x1C  m_instanceFastLookup
           m_instances
           m_primaryInstance        <- SmartRef<DataContainer>, a first-class field
           ...

`0x18` lands inside `m_partitionGuid`. So the fault reads as a NULL `InternalDatabasePartition`
being dereferenced for its partition guid while building the entity.

This also explains the one measurement that did not fit. `Partition:AddInstance` visibly works from
VEXT -- the clone gains a partitionGuid and `FindInstanceByGuid` finds it -- because it populates
the partition's own `m_instanceFastLookup` / `m_instances`. But the engine keeps a SEPARATE reverse
map, `hash_map<fb::DataContainer const*, fb::InternalDatabasePartition*>`, and if the build path
resolves a container's partition through that, a synthesized container is absent from it and the
lookup yields null no matter what AddInstance did. Identical fault, as measured.

Caveats, so this is not quoted later as fact:

* the PDBs are for `BF.Main_Win32_Final_server`; VU hosts on the CLIENT binary, so layouts are
  probably but not certainly identical;
* the struct is inferred from offset arithmetic, not from the faulting function -- the dump has no
  address map, and any other type with a pointer at +0x18 would fit equally well;
* nothing here was executed. It is a reading of the layouts, not a measurement.

For an upstream report the useful form is: build 20939, `c0000005` reading `0x18` at `005E490F`
(module mapped at 0x00400000), on `CreateEntitiesFromBlueprint` with a runtime DataContainer that
was added to a RegistryContainer -- possibly a null partition deref for `m_partitionGuid`.

### Corroboration from FrostEd (DICE's own editor API)

The editor's Python automation states the same invariant from the authoring side:

    def CreatePartitionWithPrimaryInstanceOfType(partitionPath, typeNameString):
        partition = FB.Util.CreatePartition(partitionPath, typeEval)

    rod = GameShared.VehicleSpawnReferenceObjectData.Create(levelPartition)
    rod.Blueprint = blueprintPartition.PrimaryInstance      # always a PrimaryInstance

Creating an asset IS creating a partition whose PrimaryInstance is the object, and a vehicle
spawn's Blueprint is always set to a partition's PrimaryInstance -- never a loose container. Our
crash is that invariant being enforced at runtime.

`CreatePartition` is an authoring-time operation with no runtime counterpart, which is why every
route we tried ends on a null partition.

### The one path that fits the constraint

Do it the way FrostEd does -- OFFLINE. Bake variant blueprints as real partitions into a bundle and
mount it. Each variant then has a genuine primary instance and spawns networked like any stock
blueprint. Precedent exists in this ecosystem (RMBundles ships custom assets; Wave_System refers to
an offline "Rime bake").

NOT verified: whether VU can mount custom EBX partitions this way, and what the authoring toolchain
would be. Recorded as a direction, not a plan.

## Identity is NOT the missing piece -- provenance is (2026-08-22)

`DatabasePartition` exposes `ReplaceInstance(instance, replacement, replaceReferences)`, which swaps
an instance inside a real partition and repoints every reference at the replacement. Used on the
stock vehicle partition (destructive -- fine for a throwaway harness, NOT what an implementation
should do):

    primaryInstance assignment allowed = false          -- the property is read-only
    ReplaceInstance                    ok = true
    clone-is-primary after Replace     = true
    re-resolved BY NAME -> guid=AAE95907 (the ORIGINAL's), sameObjectAsClone = true
    its gravityModifier                = -1.0           -- our edit, on the real identity
    spawn                              -> nil

So the clone became the partition's primary instance, took over the original's guid AND name, and
carried the edit -- and still does not spawn. Every identity attribute now matches the working
blueprint exactly.

**That kills the primary-instance theory** (recorded above) as well as the earlier registration and
partition theories. What is left is PROVENANCE: a baked container lives in the bundle's loaded
memory block (`InternalDatabasePartition::m_ownedMemoryBlock`), and a runtime-synthesized one never
does, whatever guid, name, partition or registry it is given.

### Consequences

1. **Never use `ReplaceInstance` to install a runtime clone.** It succeeds, silently makes the
   blueprint unspawnable, and the level keeps running until something tries to spawn one.
2. **Live preview must MUTATE a baked container, not substitute a runtime one.** That is the
   placeholder-pool design in `docs/bake-pipeline.md` §9, and this result sharpens it: a placeholder
   is not a slot to swap a clone into, it is a real baked blueprint whose FIELDS we overwrite.
   Writing a baked blueprint at runtime and spawning a fresh entity from it is already measured
   safe (MODE `shared-write`).
3. Because only field values can be written -- not structure -- placeholders must be pre-baked per
   source blueprint, so a BMP2 variant needs a baked BMP2 copy. Scalar edits like
   `gravityModifier` are exactly what this supports.


## FINAL CORRECTION: only the spawn root needs to be baked (2026-08-22)

This document repeatedly concluded that a runtime-synthesized container cannot be part of a
networked spawn. That is too strong, and the narrower truth changes the outcome completely:

**Only the blueprint being spawned must be a genuine baked resource. What it references may be
synthesized.**

Measured: a baked blueprint (LAV25) whose `object.components[1].vehicleConfig` was re-pointed at a
runtime `ShallowCopy` carrying `gravityModifier = -1.0` spawned normally, entity bus returned.

Every failure recorded above put the synthesized container at the spawn ROOT. None of them tested a
baked root with a synthesized child, so none of them supported the general claim.

Consequence: live per-instance preview needs only a pool of baked, empty blueprint shells to act as
per-instance spawn roots. MapEditor's existing clone machinery supplies everything below them
unchanged. See `docs/bake-pipeline.md` §10.

## What actually governs this (2026-08-23)

Bisected with `RawWriteProbe` -- a temporary probe that wrote a vehicle's shared blueprint DIRECTLY,
with no GameObject, no clone and no overrides -- plus `tools/e2e/spawn_twice_e2e.py`, which spawns a
vehicle, optionally modifies, then spawns another.

| What was modified | Where | Then spawn another vehicle |
|---|---|---|
| nothing | -- | survives |
| `vehicleConfig.gravityModifier` (raw) | server only | **client dies** |
| `vehicleConfig.gravityModifier` (raw) | **both realms** | **survives** |
| `object.exitDirectionSpeedThreshold` (raw) | **both realms** | **client dies** |
| `object.exitDirectionSpeedThreshold` (editor) | both realms | client dies |
| `vehicleConfig.gravityModifier` (editor) | both realms | client dies ON THE EDIT |

Three things follow, and the first two are solid:

**1. Both realms must hold identical data.** MapEditor spawns on BOTH realms, so modifying only the
server's blueprint makes the server build a vehicle from one set of data and the client build one
from another. That divergence kills the client. This is the rule RealityMod and rm-statics get for
free by writing from shared code at load time, and it is what this preview was violating.

**2. Restoring before a spawn CREATES that divergence.** The spawn guard called Restore() first, so
each realm reverted when IT reached that line and the two disagreed for a window. It was making the
exact problem it was meant to prevent.

**3. Safety is FIELD-DEPENDENT, and that is not yet understood.** Writing `gravityModifier` raw on
both realms is safe; writing `exitDirectionSpeedThreshold` raw on both realms is fatal. Both are
Float32, both on the same blueprint. The plausible split is data read while an entity RUNS versus
data consumed when one is BUILT, but that is a hypothesis, not a measurement.

Unresolved: the editor's own gravity edit killed the client on the EDIT, while the identical raw
write is safe -- so the editor path adds something fatal on top, at least for that field. Manual
testing of the same edit worked repeatedly, so this is not deterministic either. Do not treat "the
preview works for gravity" as established.

`VehiclePreview` is therefore OFF. Vehicles behave exactly as before: edits record, save, and bake
per-instance correctly.

### Why the test kept disagreeing with manual testing

`spawn_twice_e2e` picks the FIRST Float32 it finds on the object, which is usually one of the fatal
ones, while manual testing used gravity. Two different fields, two different outcomes, read as
flaky. A test that chooses its own subject can quietly test something other than what is reported.

## RETRACTION: there is no safe field. Any live write breaks later spawns (2026-08-24)

The field-safety table produced earlier is WRONG and should not be used. It reported
`vehicleConfig.standStillLowSpeedTimeLimit` as SAFE and implied `gravityModifier` was too. Both are
fatal.

The error was the criterion: `field_safety_e2e` declared a field SAFE after ONE surviving spawn,
and these crashes take one to three. The session that had just been marked SAFE died when a third
vehicle was spawned into it.

Re-measured properly:

| Sequence | Result |
|---|---|
| spawn 8 vehicles, NO writes | all 8 fine -- vehicle count is not the problem |
| write `gravityModifier` on BOTH realms (verified landed), then spawn | **client dies on the very next spawn** |
| write `standStillLowSpeedTimeLimit`, spawn twice | survived twice, died on the third |

So the rule is simple and has no exceptions we have found:

**Writing a vehicle blueprint while the level is live breaks subsequent spawns of that vehicle.**

Not field-dependent. Not about which realm (though one-sided writes also desync -- that is a second,
independent failure). Not about vehicle count. The earlier "gravityModifier is safe" result came
from a single run that happened to survive one spawn, and was contradicted the moment it was
repeated.

This matches the original field report exactly -- "changed gravity, then spawning a new BMP
crashed" -- and it matches how every other mod here modifies EBX: at load time, before entities
exist (RealityMod, rm-statics). MapEditor's BAKE does the same thing and is correct.

### Consequences

* `VehiclePreview` stays OFF. There is no subset of fields it could safely preview.
* `tools/e2e/field_safety_e2e.py` and `tools/field_safety_sweep.sh` are kept, but their SAFE verdict
  needs several spawns before it means anything. As written they produce false SAFEs.
* Live preview of a networked blueprint would require either not spawning that blueprint again for
  the rest of the session, or a way to restore the blueprint that the engine accepts -- restoring
  the VALUE is not sufficient, which was measured earlier.

## ROOT CAUSE: MakeWritable on a live vehicle blueprint (2026-08-24)

Not the value. Not the field. Not the realm split. Not the vehicle count.

**Calling `MakeWritable()` on a live vehicle blueprint's containers breaks every subsequent spawn of
that vehicle.**

Measured with the probe in "touch" mode -- it walks `object -> components[1] -> vehicleConfig`,
calls `MakeWritable()` on each container, and assigns NOTHING:

    touch result: path=components.1.vehicleConfig.gravityModifier
                  before=1.6000000238419  after=1.6000000238419  ok=true
    spawn 1 after TOUCH -> client DIED

Before and after are identical, so no data changed. The next spawn still died. Compare:

| Sequence | Result |
|---|---|
| spawn 8 vehicles, nothing touched | all fine |
| MakeWritable the path, write NOTHING, spawn | **client dies on the next spawn** |
| MakeWritable + write a value, spawn | client dies on the next spawn |

### Why this took so long to find

This was the FIRST hypothesis in this investigation, and it was discarded on a bad measurement. The
isolated repro that "disproved" it was server-only, had no client connected, and spawned once. All
three mattered:

* server-only -- the crash lands on the CLIENT;
* no client -- nothing replicates, so nothing reconciles the damaged blueprint;
* one spawn -- these crashes take one to three.

Every later theory (registration, partitions, primary-instance status, realm divergence, field
safety) was built on top of that wrong retraction, and each one produced its own measurements that
looked conclusive in isolation.

### What follows

* A live preview of a networked blueprint is not achievable. It has to write the shared container,
  which requires MakeWritable, which is the poison. There is no subset of fields that avoids it and
  no ordering that undoes it -- restoring the VALUE was already measured insufficient, which is
  consistent: the value was never the problem.
* The editor's per-instance clone path is unaffected: it makes the CLONE writable, not the shared
  blueprint.
* This is exactly why RealityMod and rm-statics write at Level:LoadResources / Partition:Loaded --
  before any entity exists, so nothing is spawned from a blueprint afterwards in that state.
* MapEditor's bake is correct for the same reason.

### The one thing left to test

Whether the damage is confined to the containers actually made writable. If MakeWritable on a
DIFFERENT vehicle's blueprint leaves BMP2 spawnable, the editor could at least know which blueprints
it has poisoned and refuse to spawn those, rather than the whole class.

### The fix that follows: refuse, do not crash

The damage is per-blueprint, so the editor can name exactly which ones it has poisoned.
`GameObjectManager` now records every blueprint made writable by Apply-to-Blueprint
(`m_WritableBlueprints`, cleared on level load) and refuses to spawn those:

    Refusing to spawn 'Vehicles/BMP2/BMP2': this blueprint was modified in place (Apply to
    Blueprint) earlier this session, and spawning it again crashes the client. Reload the level to
    spawn it again -- the edit itself is saved and bakes correctly.

Verified end to end on the originally reported sequence -- spawn a BMP2, edit it, Apply, then spawn
three more: every attempt is refused and the client stays alive. Before this, the first of those
spawns killed it.

This does not make live blueprint editing work; nothing can, short of not calling MakeWritable. It
converts a dead session into a message that says what happened and what to do about it.

## The precise rule (2026-08-24, supersedes the two statements above)

Neither "any live write breaks later spawns" nor "MakeWritable is the poison" is quite right. Both
were measured on blueprints that already had entities built from them.

**If entities already exist that were built from a blueprint, writing that blueprint and then
spawning more of it kills the client.**

| Sequence | Result |
|---|---|
| LAV25 (nothing built from it yet): write, then spawn x3 | alive |
| LAV25: spawn one FIRST, then write, then spawn | **client dies** |
| BMP2: write, then spawn -- BMP2 has vanilla vehicles live on MP_001 | **client dies** |
| BMP2: spawn, then write, then spawn | **client dies** |
| anything: no write at all, 8 spawns | alive |

The earlier "MakeWritable alone is fatal" measurement stands but is a special case: it was done on
BMP2, which already had live entities. The touch-only run proves the VALUE is irrelevant; this pair
of LAV25 runs proves the precondition is EXISTING ENTITIES, not the write.

It also finally reconciles the isolated repro that started all the confusion. `MakeWritableRepro`
MODE `shared-write` wrote BMP2 and spawned successfully -- server-only, with no client. The crash is
the CLIENT reconciling entities whose blueprint changed underneath them, so a server with no client
cannot show it.

### Why this closes live preview for vehicles

Previewing an edit means editing an instance that is on screen -- which is, by definition, an entity
built from that blueprint. The precondition is always met. There is no ordering, field subset or
realm arrangement that avoids it.

The same rule is why RealityMod and rm-statics are safe: they write at Level:LoadResources /
Partition:Loaded, before anything is built from those blueprints.

### Why the guard is the right shape

`m_WritableBlueprints` refuses to spawn a blueprint the session has written. That is exactly the
dangerous set, and a reload clears it. It does not prevent the edit, which still saves and bakes
correctly -- it prevents the crash that used to follow it.

## SOLVED: modify by replacement, not in place (2026-08-24)

The rule established above -- writing a blueprint that already has entities built from it breaks
later spawns -- is about MUTATING the container those entities were built from. It says nothing
about swapping in a different one.

`DatabasePartition:ReplaceInstance(old, new, replaceReferences)` does exactly that: clone the
container, set the field on the CLONE, swap it into the partition, and every reference is repointed.
The original container is never made writable.

Measured on BMP2, which has vanilla vehicles live from round start -- the worst case:

| Approach | Result |
|---|---|
| in-place write (MakeWritable + assign) | client dies on the very next spawn |
| **replacement** (clone, edit clone, ReplaceInstance) | **four further spawns, all alive** |

And the edit is real, not a no-op: reading the blueprint back from the server afterwards gives
`gravityModifier: -4`, against a stock 1.6.

### VehiclePreview now uses it

`ResolveTarget` walks an override chain to the container holding the edited field without making
anything writable; `ReplaceField` clones that container, sets the value on the clone, and calls
`ReplaceInstance`. Restore does the same in reverse, for the same reason -- writing the old value
back would mutate the live container and reintroduce the crash.

Verified on the exact sequence originally reported:

    spawn a BMP2                     -> alive
    edit gravityModifier             -> SERVER wrote -4.0, CLIENT wrote -4.0
    spawn another BMP2               -> alive
    blueprint reads gravityModifier  -> -4

Both realms apply it, which is still required: one-sided data desyncs them independently of this.

### Two traps worth keeping in mind

* **Arrays must be indexed, never cast.** `components` is a field whose next chain node is a 1-based
  element name. Casting the array throws on `.typeInfo`, and the preview then silently wrote nothing
  while reporting success -- a run that "survived" purely because it had done nothing. That mistake
  appeared three separate times in this work.
* **A survival result means nothing unless the write is verified.** Every no-op run in this
  investigation looked like a pass.

### Replacement works, but is not yet RELIABLE (2026-08-24)

Replacement is a genuine improvement over in-place writing -- the edit applies, both realms agree,
and spawning afterwards is fine. It is not stable enough to leave on:

| Run | Result |
|---|---|
| a real editing session | many edits fine, then the server died |
| automated: 1 spawn + 6 edits (run A) | client died on edit 1 |
| automated: 1 spawn + 6 edits (run B) | 6/6 edits fine |

Same code, same sequence, opposite outcomes -- so this is a race, not a rule. `ReplaceInstance`
repoints references out from under LIVE entities: the vehicle being edited was built from the
container being swapped. `Types/GameEntity.lua:135` reports it directly when it loses:

    tried accessing an invalid or destroyed EntityBusPeer

Churn was reduced (a repeat edit on the same object no longer restores first, halving the
ReplaceInstance traffic per keystroke) and run B passed afterwards, but run A had already failed on
a FIRST edit, where that change makes no difference. So the churn was not the cause.

What is still unknown: what the entity has to be doing for a swap to kill it. Until that is
understood, previewing a networked object is a coin flip, and the honest options are to gate it
behind an explicit opt-in or to make the swap safe (e.g. take the entity out of simulation first --
untested, and Disable/Enable has its own history here).

## Apply-to-Blueprint by replacement too (2026-08-24)

Three symptoms from one cause, all reported together: edits not applying, Apply reverting to
default, and spawning a vehicle doing nothing.

Apply wrote the shared blueprint IN PLACE. That:

* made the blueprint's containers writable, so `m_WritableBlueprints` correctly marked it
  unspawnable for the rest of the session -- and the refusal only reached the server log, so from
  the editor a spawn silently did nothing;
* meant `VehiclePreview:Restore()` (which Apply runs first, to avoid baking preview values) put the
  stock value back, and if the per-instance override had not been recorded there was nothing left to
  re-apply -- the blueprint sat at stock, which reads as "Apply reverted my change".

Apply now uses the same replacement path as the preview
(`VehiclePreview:WriteChainByReplacement`), so the blueprint's own containers are never made
writable and it stays spawnable. The unspawnable marking is gone with it.

Verified end to end:

    spawn a BMP2                  -> 2 objects
    edit gravityModifier = -5     -> applied
    Apply to Blueprint            -> client alive
    read the blueprint back       -> gravityModifier = -5   (it STUCK)
    spawn another BMP2            -> alive, 3 objects       (no refusal)

### A later preview restore could undo an Apply (2026-08-24)

Reported as: spawned a vehicle after Apply and it flew (so the value WAS applied), but the inspector
read the stock 1.6, and editing again crashed.

The 1.6 was a preview RESTORE. A preview records the pre-edit value as its "original"; Apply then
makes the edited value the new baseline, but the preview's restore data still held the pre-Apply
number. The next restore -- triggered by previewing a different object -- wrote that stale original
back, silently undoing the Apply. The already-spawned vehicle kept flying because it was built from
the applied container, so the world and the data disagreed, which is exactly how it looked.

`VehiclePreview:ForgetBlueprint` is now called after a successful Apply, dropping restore data for
that blueprint because its current value IS the baseline.

Verified: Apply gravityModifier = -5 on BMP2, then edit a LAV25 (which triggers a restore). BMP2's
blueprint still reads -5.

Also silenced a non-event: `SetOverrides` is called with an EMPTY override set on some paths (a
re-instantiate after Apply has cleared the instance's overrides), and it logged "no field applied",
which reads as a failure while describing nothing. It returns quietly now.

### Replacement needs the refresh, or the preview is invisible (2026-08-24)

Reported as: no crash any more, but changing gravity does nothing.

Replacement swaps the container the BLUEPRINT points at. New spawns get the new value -- which is
why a vehicle spawned after an edit flew -- but a LIVE entity still holds the container it was built
from and never sees the edit. The write lands and the vehicle in front of you ignores it.

The two mechanisms have opposite trades:

| | live entity sees it | spawning afterwards |
|---|---|---|
| in-place write | yes | breaks (client dies) |
| replacement | **no** | fine |
| replacement + refresh the edited object | yes | fine (measured below) |

So the refresh is required, not optional. It was disabled while writes were IN PLACE, where it was
implicated in destroyed vehicles and spawn crashes -- but those came from mutating the container
live entities were built from, which replacement never does.

Re-enabled, still debounced and still single-object. Measured: spawn a BMP2, five gravity edits in a
row, then spawn again -- everything alive, the new vehicle registers.

Not yet established: whether this is stable across many sessions. The ReplaceInstance race that made
previews intermittently fatal was observed BEFORE the refresh was re-enabled, so it is not resolved
by this, merely not reproduced in this run.

## Where the problem actually lies (2026-08-25)

Five attempts at the remaining race, each measured over cold-booted repetitions rather than single
runs:

| Configuration | Survived |
|---|---|
| replacement, no refresh | 1 of 4 |
| + refresh the edited object | 2 of 3 |
| + disable the entity before swapping | 2 of 3 |
| + gate the edit to `UpdatePass_PreSim` | 2 of 6 |

None of them moved the rate. It sits around half, and the death is almost always on the FIRST swap.

So the problem is not any of: the value written, which field, which realm writes, whether the entity
is refreshed afterwards, whether it is disabled first, or where in the frame the write happens.
Every one of those was tested and eliminated.

What remains is the operation itself: **swapping a DataContainer that live entities are currently
using is not safe, and nothing available from VEXT makes it safe.** The precondition is only that
entities exist which were built from that blueprint -- and previewing an edit always meets it,
because the thing being edited is on screen.

The `UpdatePass_PreSim` gate is KEPT despite not fixing this. Every other command that mutates the
entity world (spawn, delete, undelete) is gated that way and these two were not, which was a real
inconsistency; it is simply not the cause of this crash.

### What is left

Previews are opt-in, default off (`PREVIEW_ENABLED` in `VehiclePreview.lua`). Everything else works
without them:

* Apply to Blueprint writes by replacement, sticks, and leaves the blueprint spawnable;
* spawning after edits is fine;
* the edit records, saves and bakes per-instance.

Untested ideas, in the order I would try them: whether a SERVER-ONLY replacement still kills the
client (which would show the client is not dying from its own swap); and whether destroying the
object's entities entirely, swapping, then respawning is survivable, since the crash needs live
entities and that removes them.

## The client was dying from its OWN swap (2026-08-25)

| Configuration | Survived |
|---|---|
| swap on BOTH realms | 2 of 6 |
| **swap on the SERVER only** | **6 of 6** |

Every death in every earlier sweep read "CLIENT died on edit 1". Not swapping on the client removes
them completely -- so the client was killed by its own `ReplaceInstance`, not by the server's.

That also explains why four previous attempts moved nothing: the refresh, disabling the entity
first, and the `UpdatePass_PreSim` gate are all SERVER-side concerns. They were aimed at the wrong
realm.

Note this differs from IN-PLACE writes, where server-only was itself fatal (the realms held
different data while entities replicated). Replacement never mutates the container live entities
were built from, so the client keeping the original container is not the same hazard.

### What is not yet verified

That the edit remains VISIBLE with the client left alone. The server owns vehicle simulation and
replicates it, so a physics field like `gravityModifier` should still show -- but the obvious probe
(the editor's stored transform) reports the spawn position, not the live entity's, so it cannot
measure movement. Needs an eye on the game, or a server-side probe reading the vehicle entity's
transform.

Fields the CLIENT renders from its own data will not preview at all under this setting.

## Current state: previews stable, Apply still not (2026-08-25)

| Sequence | Result |
|---|---|
| preview edits + spawns, server-only swap | 6 of 6 runs survived |
| edit + Apply + spawn, repeated | died on round 2 |
| same, with Apply's instance-rebuild skipped for networked blueprints | died on round 3 |

Previews are stable now that only the server swaps. Apply is not: repeating edit -> Apply -> spawn
kills the realm after a round or two. Skipping Apply's rebuild of every instance (which re-enters
the spawn path, and rebuilding a networked blueprint's instances is independently known-unsafe)
bought one more round and is kept on its own merits, but it is not the cause.

What Apply does beyond a preview, and therefore what remains suspect: it clears per-instance
overrides and resets `internalBlueprint` on every instance, records `m_AppliedBlueprints`, and
serializes the modified partition for the bake. One of those is still touching something the engine
is using.

Practical guidance until that is found: previews are safe to use; Apply works but should be treated
as a once-per-session operation, and a level reload after applying is the safe way to continue.

### The client was rebuilding the vehicle on every edit (2026-08-26)

With previews server-only, `VehiclePreview:Show` returned false on the client -- and `SetOverrides`
treats false as "could not preview", falling through to:

    self:Disable(true)
    self:Enable(true)

So the client destroyed and recreated the vehicle on EVERY edit, undebounced. A run of ~14 edits
killed the client while the server stayed up, which is exactly how it was reported.

`Show` now returns TRUE on the client: handled, deliberately as a no-op. The client's copy of the
blueprint is untouched by design, so there is nothing to re-read and no reason to rebuild anything.

Measured after: 15 consecutive gravity edits plus a spawn -- client and server both alive, the new
vehicle registers. The same sequence previously died around edit 14.

## Entities adopted by the WRONG object (2026-08-26)

Reported: spawn a vehicle and it has no outline; select the PREVIOUS vehicle and you see the new
one's outline instead. The gizmo stays on the correct object.

`m_PendingCustomBlueprintGuids` is keyed by BLUEPRINT instance guid, and consumed the same way in
`OnEntityCreateFromBlueprint`. Two objects spawned from one blueprint therefore share a single entry
and the second overwrites the first, so entities are adopted by whichever object the surviving entry
names. The gizmo is unaffected because it comes from the GameObject's own transform rather than from
entities -- which is precisely how the symptom presents.

`m_SpawningForGuid` already names the object unambiguously: it is set immediately around our own
`CreateEntitiesFromBlueprint` call and the hook fires inside it. The hook now prefers it, falling
back to the table for load-time and vanilla spawns.

NOT verified from here: the client-side AABB. `gameEntitiesData` reads 0 for every vehicle object
including ones that clearly render, so that is not where the outlines come from and the probe proves
nothing. The fix rests on the mis-keying being demonstrable in the code, not on a measurement --
needs an eye on the editor.
