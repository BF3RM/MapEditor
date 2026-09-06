#!/usr/bin/env python3
"""Author a level's whole dependency closure into USD, not just its own partitions.

A level export that stops at the level's own partitions is exporting a fraction of what the level
IS. MP_001 owns 490 partitions; the closure it actually pulls in is 10,396 -- the weapons, soldiers,
vehicles, sounds, voice-over and effect graphs that the level references and cannot run without.
Those already SHIP in the bundle, so they travel with a mod either way; what they could not do was
be edited, because nothing wrote them into the stage.

They round trip: 211,765 instances across 802 types, 776,004 fields compared, 0 changed
(tools/usd/partition_coverage_test.py). This module is what puts them in front of a DCC.

Kept separate from export_level_usd on purpose: the level's own partitions are authored under the
world it builds, while the closure is a flat library of assets the level draws on. Mixing them would
put a soldier blueprint into the level's spatial hierarchy as though it were placed somewhere.
"""
import json
import os

from pxr import Usd, UsdGeom

import level_entities

SCOPE = "/World/Library"


def names(closure_dir, parts=None):
    """Partition names for `parts` (default: all), keyed by the file that holds each.

    The files are named by GUID, but a partition is addressed by NAME when it goes back into a
    bundle, so the mapping has to travel with the stage. Restricted to what was actually authored --
    a map covering partitions that are not in the stage would describe a stage that does not exist.
    """
    out = {}
    want = set(parts) if parts is not None else None

    for f in sorted(os.listdir(closure_dir)):
        if not f.endswith(".json") or (want is not None and f[:-5] not in want):
            continue

        try:
            doc = json.load(open(os.path.join(closure_dir, f)))
        except Exception:                                            # noqa: BLE001
            continue

        n = doc.get("Name")

        if n:
            out[f[:-5]] = n

    return out


def author(stage, closure_dir, limit=0):
    """Author every closure partition under /World/Library. -> (partitions, {type: count}).

    Authoring goes through level_entities so the closure gets exactly the treatment the level's own
    entities get -- typed attributes for scalars, the whole record in customData -- rather than a
    second, subtly different representation of the same data.
    """
    if not closure_dir or not os.path.isdir(closure_dir):
        return 0, {}

    parts = sorted(n[:-5] for n in os.listdir(closure_dir) if n.endswith(".json"))

    if limit:
        parts = parts[:limit]

    if not parts:
        return 0, {}

    root = UsdGeom.Scope.Define(stage, SCOPE)
    # Tolerant unpack: author() has grown a third return value once already, and this module has no
    # stake in anything past the counts.
    result = level_entities.author(stage, root, closure_dir, parts)
    counts = result[0] if isinstance(result, tuple) else result

    # The map from guid-named file to real partition name, so an importer can put edits back where
    # they came from without re-reading the whole closure.
    root.GetPrim().SetCustomDataByKey("bf3:closureNames",
                                      json.dumps(names(closure_dir, parts)))

    return len(parts), counts
