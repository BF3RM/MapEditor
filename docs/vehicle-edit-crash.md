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
