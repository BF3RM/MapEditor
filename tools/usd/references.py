#!/usr/bin/env python3
"""Turn BF3's guid pointers into real USD relationships.

A reference -- `{PartitionGuid, InstanceGuid}` -- is how BF3 says "this emitter uses that texture",
"this weapon fires that projectile", "this sound plays through that pool". 256,460 of them in
mp_001's closure alone, and every one was carried in customData: readable, and not editable in any
way a DCC understands. You could move an object but not re-point it.

They are authored as `rel bf3<Field>` targeting the prim the guid names. USD relationships are the
exact fit -- a typed, editable pointer between prims -- and a DCC shows them as connections rather
than as an opaque blob of hex.

MEASURED before building this: 256,459 of 256,460 references in the closure resolve to an instance
that is also in the closure. So this is not a partial mapping with a long tail; it is essentially
total, and the one exception is reported rather than hidden.
"""
import json
import os

from pxr import Usd

BF3 = "bf3"


def _index(stage, dirs):
    """(partition guid, instance guid) -> prim path, for everything authored in the stage.

    Two hops, because a prim records the partition it came FROM by name while a reference names it
    by guid: name -> guid comes from the partition files, guid -> prim from the stage.
    """
    name_to_guid = {}

    for d in dirs:
        if not d or not os.path.isdir(d):
            continue

        for root, _sub, files in os.walk(d):
            for fn in files:
                if not fn.endswith(".json"):
                    continue

                path = os.path.join(root, fn)

                try:
                    doc = json.load(open(path))
                except Exception:                                    # noqa: BLE001
                    continue

                if doc.get("PartitionGuid"):
                    key = os.path.relpath(path, d)[:-5]
                    name_to_guid[key] = str(doc["PartitionGuid"]).lower()

    out = {}

    for prim in stage.Traverse():
        blob = prim.GetCustomDataByKey(BF3 + "Entity")

        if not blob:
            continue

        try:
            rec = json.loads(blob)
        except Exception:                                            # noqa: BLE001
            continue

        pg = name_to_guid.get(str(rec.get("partition")))

        if pg:
            out[(pg, str(rec.get("instance")).lower())] = prim.GetPath()

    return out


def _refs(v):
    """The references a field holds: one, a list of them, or none."""
    items = v if isinstance(v, list) else [v]
    out = []

    for x in items:
        if (isinstance(x, dict) and x.get("PartitionGuid")
                and set(x.keys()) <= {"PartitionGuid", "InstanceGuid", "$type", "Name"}):
            out.append((str(x["PartitionGuid"]).lower(), str(x.get("InstanceGuid", "")).lower()))

    return out


def link(stage, dirs):
    """Author a relationship for every reference whose target is in the stage.

    -> (linked, unresolved). Unresolved is REPORTED, never silently dropped: a reference that
    cannot be pointed at is exactly the kind of thing that looks like success.
    """
    index = _index(stage, dirs)
    linked = unresolved = 0

    for prim in stage.Traverse():
        blob = prim.GetCustomDataByKey(BF3 + "Entity")

        if not blob:
            continue

        try:
            record = json.loads(blob).get("record") or {}
        except Exception:                                            # noqa: BLE001
            continue

        for k, v in record.items():
            targets = _refs(v)

            if not targets:
                continue

            paths = []

            for key in targets:
                p = index.get(key)

                if p is None:
                    unresolved += 1
                    continue

                paths.append(p)

            if paths:
                prim.CreateRelationship(BF3 + k).SetTargets(paths)
                linked += len(paths)

    return linked, unresolved


def read(stage, dirs):
    """Relationships that were RE-POINTED in a DCC, as {(partition, instance): {field: [guids]}}.

    Only differences are returned: a relationship that still points where it was authored is not an
    edit, and rewriting it would touch every partition on every trip.
    """
    index = _index(stage, dirs)
    back = {p: k for k, p in index.items()}
    out = {}

    for prim in stage.Traverse():
        blob = prim.GetCustomDataByKey(BF3 + "Entity")

        if not blob:
            continue

        try:
            rec = json.loads(blob)
        except Exception:                                            # noqa: BLE001
            continue

        record = rec.get("record") or {}

        for r in prim.GetRelationships():
            name = r.GetName()

            if not name.startswith(BF3):
                continue

            field = name[len(BF3):]
            # Compare against what was actually AUTHORED, not against every guid the record holds.
            # A field whose targets were not all in the stage authored a shorter list, and comparing
            # the two lengths reported a re-point that never happened -- measured: 9 false edits on
            # an untouched 400-partition slice.
            was = [t for t in _refs(record.get(field)) if t in index]
            now = [back.get(t) for t in r.GetTargets()]
            now = [t for t in now if t]

            if now and now != was:
                out.setdefault((rec.get("partition"), rec.get("instance")), {})[field] = now

    return out
