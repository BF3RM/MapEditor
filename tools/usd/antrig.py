#!/usr/bin/env python3
"""What an Ant clip's channels actually drive: the rig's DOF-name tables.

A clip stores a flat array of channels and nothing else. The names live three hops away, in the
STATIC Ant package (`animations/antanimations/s_basicassets` -- the only one of BF3's 322 that
holds any rig at all: 5 RigAssets, 5 ant::SkeletonAssets, 97 LayoutHierarchyAssets, 59
LayoutAssets, 47 ChannelToDofAssets):

    AnimationAsset.ChannelToDofAsset -> IndexData[channel] = slot index in a DOF set
    LayoutHierarchyAsset             -> the DOF set: an ordered list of LayoutAssets
    LayoutAsset.Slots                -> ("<JointName>.q" | ".t" | ".s" | "<scalar>", type)

so channel -> slot -> `LeftHandThumb2.q`. Type 14 is a quaternion, 2049856663 a translation,
2049856454 a scale, 10 a float and 6 an int, and the channels of a clip run quaternions first,
then the vector DOFs, then the scalars -- which is what makes a candidate DOF set checkable
rather than merely plausible.

WHAT IS MEASURED, over all 8,972 clips in BF3's 322 Ant packages:

  * IndexData is big-endian for StorageType 2 (uint16). Little-endian puts the largest index at
    65280, which no DOF set could hold; big-endian tops out at 411 against a 746-slot rig.
  * A DOF set's table is the concatenation of its LayoutAssets' slots, EXCEPT for sets that
    begin with the Trajectory block, where the table repeats that block's first 8 slots at the
    head. That is not a guess: of the 43 distinct (map, DOF set) pairs BF3 itself states via
    ClipControllerAsset.Target, 18 address indices past the end of the plain concatenation --
    every one of them by exactly 8 -- and all 18 then validate with zero type violations.
  * Against BF3's 57 distinct stated bindings (448 clips) the resolver returns the game's own
    answer 46 times, leaves 11 undecided, and is WRONG 0 times. Preferring the smallest matching
    table instead would name 8,920 of 8,972 clips but disagrees with BF3 on 3 of the 57 -- so
    this module refuses to guess: a channel is named only when EVERY DOF set that can admit the
    clip's map agrees on the name. That names 6,428 of 8,972 clips, 1,018,205 channels, and
    leaves 203,680 indexed.

That leaves clips whose map several unrelated DOF sets can read the same way -- small maps
mostly, where the type signature is too short to discriminate. Those keep indexed names, and
`resolve` returns None rather than picking one.
"""

import json
import os

QUAT = 14
VEC3 = 2049856663
SCALE = 2049856454
FLOAT = 10
INT = 6

# Quaternion channels come first, then the vector DOFs, then the scalars. Rank, not type, is what
# a candidate table is checked against, because .t and .s share a slot group in the clip.
_RANK = {QUAT: 0, VEC3: 1, SCALE: 1, FLOAT: 2, INT: 2}

# The repeated head of a trajectory-led DOF set: Trajectory (4) + the Connect block (4).
_PREAMBLE = 8


def joint_of(slot):
    """Slot name -> (joint name, is a rotation).

    `Hips.q` and `Hips.t` are the same bone; `LeftFoot.vel` is not a bone at all, so it keeps its
    own name rather than quietly writing a velocity into LeftFoot's translation.
    """
    if slot.endswith(".q"):
        return slot[:-2], True

    if slot.endswith(".t"):
        return slot[:-2], False

    if slot.endswith(".s"):
        return slot[:-2] + "_scale", False

    return slot, False


class Rig:
    """The DOF-name tables of one Ant static package."""

    def __init__(self, bank):
        objects = bank.get("objects") or []
        by_id = {o["id"]: o for o in objects if o.get("id")}

        self.hierarchies = [o for o in objects if o["type"] == "LayoutHierarchyAsset"]
        self.maps = {o["id"]: _indices(o) for o in objects
                     if o["type"] == "ChannelToDofAsset"}
        self.skeletons = {o["objectName"]: [j["name"] for j in o["joints"]]
                          for o in objects if o["type"] == "SkeletonAsset"}

        self.tables = []          # plain concatenation, one per DOF set
        self.preamble_tables = [] # ... with the trajectory block repeated at the head

        for h in self.hierarchies:
            slots = []

            for layout in h["layoutAssets"]:
                o = by_id.get(layout)

                if o:
                    slots.extend((s["name"], s["type"]) for s in (o.get("slots") or []))

            if not slots:
                continue

            self.tables.append(slots)
            self.preamble_tables.append(slots[:_PREAMBLE] + slots)

        self._cache = {}

    def resolve(self, indices, quats=None):
        """Channel map -> the slot name each channel drives, or None if it is not decided.

        `quats` is the clip's own declared quaternion count. Where it is known it is used as a
        filter, not a hint: a table that would put a different number of rotations at the head of
        the clip is not describing this clip.
        """
        if not indices:
            return None

        key = (tuple(indices), quats)

        if key in self._cache:
            return self._cache[key]

        readings = _readings(self.tables, indices, quats)

        # The repeated trajectory block is a fallback, never a competitor: where the plain
        # concatenation can read the map, that is what the map was written against.
        if not readings:
            readings = _readings(self.preamble_tables, indices, quats)

        self._cache[key] = list(next(iter(readings))) if len(readings) == 1 else None
        return self._cache[key]


def _indices(obj):
    """ChannelToDofAsset.IndexData -> one index per channel."""
    data = obj["indexData"]

    if obj["storageType"] == 2:
        return [(data[i] << 8) | data[i + 1] for i in range(0, len(data), 2)]

    return list(data)


def _readings(tables, indices, quats):
    """Every distinct name vector the given DOF tables produce for this map."""
    top = max(indices)
    out = set()

    for table in tables:
        if top >= len(table):
            continue

        ranks = [_RANK.get(table[d][1], 9) for d in indices]

        if any(ranks[i] > ranks[i + 1] for i in range(len(ranks) - 1)):
            continue

        if quats is not None and ranks.count(0) != quats:
            continue

        out.add(tuple(table[d][0] for d in indices))

    return out


def channel_map(rig, bank, clip):
    """The clip's map, resolved against its own bank first and the static package second.

    Bank-local ids are bundle references and collide across packages, so a local hit has to win
    or a clip picks up another weapon's channel map.
    """
    ref = clip.get("channelToDof")

    if not ref:
        return None

    for o in (bank.get("objects") or ()):
        if o["type"] == "ChannelToDofAsset" and o.get("id") == ref:
            return _indices(o)

    return rig.maps.get(ref) if rig else None


def load(path):
    """A Rime dump_animation_bank JSON of the static package -> Rig."""
    with open(path) as f:
        return Rig(json.load(f))


def find(where):
    """The Rig behind a dump file or a directory of bank dumps, or None.

    Only one of BF3's 322 Ant packages holds any layout, and it is named `s_basicassets`, so that
    name is tried first -- scanning the directory means parsing 85 multi-megabyte dumps to find
    the one that matters.
    """
    if not where:
        return None

    if os.path.isfile(where):
        return load(where)

    if not os.path.isdir(where):
        return None

    names = sorted(n for n in os.listdir(where) if n.endswith(".json"))

    for name in sorted(names, key=lambda n: "basicassets" not in n):
        try:
            bank = json.load(open(os.path.join(where, name)))
        except Exception:                                    # noqa: BLE001
            continue

        if (bank.get("byType") or {}).get("LayoutHierarchyAsset"):
            return Rig(bank)

    return None
