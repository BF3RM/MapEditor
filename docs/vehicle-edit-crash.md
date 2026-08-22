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

Vehicles keep the refresh path. Per-instance deep config on networked blueprints is not achievable
from VEXT at all -- not with better override plumbing, not with registration, not with a clone pool.

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
