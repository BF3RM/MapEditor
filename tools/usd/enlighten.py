#!/usr/bin/env python3
"""The level's Enlighten bake: probe sets, the databases that place them, and the light itself.

A level's global illumination is not in EBX. It is a set of resources -- one `EnlightenDatabase`
naming its systems and probe sets, one `EnlightenProbeSet` per set (159 of them on mp_001), a
`StaticEnlightenDatabase` holding the baked spherical-harmonic coefficients, an
`EnlightenShaderDatabase` of per-material colours, and on some levels `EnlightenSystem` resources
holding Enlighten's own radiosity data. Until now a USD level named none of it, so the export said
"referenced" and the bake stayed behind in the game's bundles.

Every resource is carried as its shipped bytes, base64, exactly the way `terrain_trees` carries a
raster node. That is the point rather than a shortcut: an Enlighten bake describes light for the
geometry that was there when it was computed, so nothing downstream can regenerate one, and a tool
that re-derived it would be inventing lighting the game never had. Rime reads and rewrites all four
parsed types byte-for-byte (7288/7288 across BF3), so the bytes are known-good to carry.

What rides alongside the payload is for looking at, not for rebuilding from:

- the parsed header per resource, whole, in `customData` -- system and probe-set name lists,
  lightmap instances, material colours, the indirection grid. Those are lists and dicts, not
  scalars, and inventing a typed attribute per field would be a hundred attributes that no longer
  match the day Rime learns one more field.
- probe positions as a `UsdGeom.Points` at `guide` purpose, so the probe grid is VISIBLE in a DCC
  instead of being a number in a header.
- lightmap instances as points at their transforms' translation, which is the record that ties one
  baked lightmap to one placed object. Move that object and the instance still points where it
  used to be; seeing them is what makes "a bake cannot survive an edit" concrete.

Note what positions are NOT: on mp_001 only 38 of 159 probe sets store any, 573 positions against
the database's 2707 probes. Most sets ship the indirection grid alone. So the points are a view of
the sets that have one, never a count of the level's probes -- and a check that compared the two
would be measuring the wrong thing.
"""
import base64
import json

from pxr import Gf, Sdf, Usd, UsdGeom, Vt

BF3 = "bf3"
SCOPE = "/World/Enlighten"

# Resource type -> the scope it is authored under. A LIST so traversal order is dump order, and so
# a type BF3 does not use on a given level simply produces an empty count rather than a missing key.
KINDS = [
    ("EnlightenDatabase", "databases"),
    ("EnlightenProbeSet", "probeSets"),
    ("StaticEnlightenDatabase", "staticDatabases"),
    ("EnlightenShaderDatabase", "shaderDatabases"),
    ("EnlightenSystem", "systems"),
    # A distinct resource type from StaticEnlightenDatabase despite the name; BF3 ships none, but
    # dropping it silently is exactly how a level comes back missing something.
    ("EnlightenStaticDatabase", "staticData"),
]

# Scalars worth having as typed attributes: the ones you sort and filter a level by. Everything else
# stays in the header blob.
META = [
    ("length", Sdf.ValueTypeNames.Int),
    ("probeCount", Sdf.ValueTypeNames.Int),
    ("priority", Sdf.ValueTypeNames.Int),
    ("globalOffset", Sdf.ValueTypeNames.Int),
    ("outputAtlasWidth", Sdf.ValueTypeNames.Int),
    ("outputAtlasHeight", Sdf.ValueTypeNames.Int),
    ("blendDistance", Sdf.ValueTypeNames.Float),
    ("enabled", Sdf.ValueTypeNames.Bool),
    ("dynamicDataEnable", Sdf.ValueTypeNames.Bool),
    ("reencodesExactly", Sdf.ValueTypeNames.Bool),
]

# Level-wide fields that belong to no single resource.
DOC_META = ["level", "prefix", "counts", "resourceCount", "payloadBytes", "reencodeChecked",
            "reencodeExact"]


def _vec(v):
    """One Vec3 from the dump, as a flat list. The dump writes them as {x, y, z} objects."""
    return [float(v["x"]), float(v["y"]), float(v["z"])]


def _matrix(t):
    """A LinearTransform ({right, up, forward, trans}) as a USD row-major Gf.Matrix4d."""
    rows = [t["right"], t["up"], t["forward"], t["trans"]]
    return Gf.Matrix4d(*[c for i, r in enumerate(rows)
                         for c in _vec(r) + [1.0 if i == 3 else 0.0]])


def _points(stage, path, positions):
    """A guide-purpose Points prim, or None when there is nothing to draw."""
    if not positions:
        return None

    points = UsdGeom.Points.Define(stage, path)
    points.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*_vec(p)) for p in positions]))
    # guide, not render: these mark where light was sampled. They are not level geometry and must
    # never end up in a render or a bounds computation.
    points.CreatePurposeAttr(UsdGeom.Tokens.guide)
    return points


def author(stage, enlighten_json):
    """Author every Enlighten resource the dump holds. -> {scope: count}."""
    doc = enlighten_json

    if isinstance(doc, str):
        doc = json.load(open(doc))

    root = UsdGeom.Scope.Define(stage, SCOPE)
    made = {short: 0 for _, short in KINDS}
    by_type = {kind: short for kind, short in KINDS}

    # The level-wide numbers, so the stage says what the bundle has to carry and not merely what it
    # happens to hold.
    root.GetPrim().SetCustomDataByKey(BF3 + ":enlighten", json.dumps(
        {k: doc.get(k) for k in DOC_META if doc.get(k) is not None}))

    for short in set(by_type.values()):
        UsdGeom.Scope.Define(stage, "%s/%s" % (SCOPE, short))

    for ordinal, entry in enumerate(doc.get("resources") or []):
        short = by_type.get(entry.get("type"))

        if short is None or not entry.get("payload"):
            continue

        # ORDINAL over the whole dump, not per kind: the ordinal is the dump's own order and a
        # resource keeps it whatever else changes. The resource NAME is the real identity but it is
        # a path -- levels/mp_001/lighting/enlighten_mp_001 -- and slashes cannot be a prim name, so
        # it travels as an attribute.
        path = "%s/%s/res_%05d" % (SCOPE, short, ordinal)
        prim = stage.DefinePrim(path, "Scope")
        prim.CreateAttribute(BF3 + ":kind", Sdf.ValueTypeNames.String).Set(entry["type"])
        prim.CreateAttribute(BF3 + ":resource", Sdf.ValueTypeNames.String).Set(entry["name"])
        prim.CreateAttribute(BF3 + ":payload", Sdf.ValueTypeNames.String).Set(entry["payload"])

        if entry.get("meta"):
            # The 16-byte resource meta is not in the payload and a bundle entry needs it, so
            # dropping it would carry bytes that cannot be put back.
            prim.CreateAttribute(BF3 + ":meta", Sdf.ValueTypeNames.String).Set(entry["meta"])

        data = entry.get("data") or {}
        flat = dict(data)
        flat["length"] = entry.get("length")
        flat["reencodesExactly"] = entry.get("reencodesExactly")

        for field, vtype in META:
            if flat.get(field) is None:
                continue

            v = flat[field]

            if vtype == Sdf.ValueTypeNames.Bool:
                prim.CreateAttribute("%s:%s" % (BF3, field), vtype).Set(bool(v))
            elif vtype == Sdf.ValueTypeNames.Float:
                prim.CreateAttribute("%s:%s" % (BF3, field), vtype).Set(float(v))
            else:
                prim.CreateAttribute("%s:%s" % (BF3, field), vtype).Set(int(v))

        if data:
            # The header WHOLE, not field by field. Its shape is the reader's, and a per-field
            # translation would need updating every time Rime names one more thing -- silently
            # dropping whatever it had not been taught yet.
            prim.SetCustomDataByKey(BF3 + ":enlightenResource", json.dumps(data))

        for field in ("min", "max"):
            if isinstance(data.get(field), dict):
                # A float ARRAY for the same reason the raster trees use one: arity is the dump's
                # to state, not ours to assume.
                prim.CreateAttribute("%s:%s" % (BF3, field),
                                     Sdf.ValueTypeNames.FloatArray).Set(
                    Vt.FloatArray(_vec(data[field])))

        if data.get("dim"):
            prim.CreateAttribute(BF3 + ":dim", Sdf.ValueTypeNames.IntArray).Set(
                Vt.IntArray([int(x) for x in data["dim"]]))

        if isinstance(data.get("transform"), dict):
            prim.CreateAttribute(BF3 + ":transform", Sdf.ValueTypeNames.Matrix4d).Set(
                _matrix(data["transform"]))

        _points(stage, path + "/probes", data.get("positions"))

        instances = data.get("lightMapInstances")

        if instances:
            # Each instance binds one baked lightmap to one placed object by guid and transform.
            # Carried as parallel arrays rather than a prim each: mp_001 has 1458 and they are a
            # table, not scene graph.
            prim.CreateAttribute(BF3 + ":lightMapInstanceGuids",
                                 Sdf.ValueTypeNames.StringArray).Set(
                [str(i["guid"]) for i in instances])
            prim.CreateAttribute(BF3 + ":lightMapInstanceTransforms",
                                 Sdf.ValueTypeNames.Matrix4dArray).Set(
                [_matrix(i["transform"]) for i in instances])
            _points(stage, path + "/lightMapInstances",
                    [i["transform"]["trans"] for i in instances])

        made[short] += 1

    return made


def read_back(stage):
    """Every authored resource, in the dump's own shape. -> [entry, ...] in dump order."""
    out = []
    scope = stage.GetPrimAtPath(SCOPE)

    if not scope or not scope.IsValid():
        return out

    # Zero-padded ordinals, so traversal order within a scope is dump order -- but the scopes
    # themselves interleave, so the result is sorted by ordinal at the end.
    for prim in Usd.PrimRange(scope):
        kind = prim.GetAttribute(BF3 + ":kind")

        if not kind or not kind.IsValid():
            continue

        entry = {
            "type": kind.Get(),
            "name": prim.GetAttribute(BF3 + ":resource").Get(),
            "payload": prim.GetAttribute(BF3 + ":payload").Get(),
        }

        meta = prim.GetAttribute(BF3 + ":meta")
        entry["meta"] = meta.Get() if meta and meta.IsValid() else None

        for field, _ in META:
            a = prim.GetAttribute("%s:%s" % (BF3, field))

            if a and a.IsValid() and a.Get() is not None:
                entry[field] = a.Get()

        header = prim.GetCustomDataByKey(BF3 + ":enlightenResource")
        entry["data"] = json.loads(header) if header else None
        out.append((int(prim.GetName().rsplit("_", 1)[1]), entry))

    return [entry for _, entry in sorted(out, key=lambda p: p[0])]


def payload_bytes(entry):
    """The resource's shipped bytes, decoded."""
    return base64.b64decode(entry["payload"])
