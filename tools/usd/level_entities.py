#!/usr/bin/env python3
"""A level's EBX instances as USD prims, so they can be edited in a DCC and written back.

Meshes were the obvious half of a level; they are not the level. MP_001 also carries 411 spawn
points, 348 decal entities, 139 effect placements, 124 shape volumes and 105 light probes -- and
every one of them is EBX with a Transform, which is exactly what a USD Xform is. Carrying them as
opaque referenced data means a level can be rebuilt but not authored: you could not move a spawn.

EVERY instance is authored, not a list of interesting types. An earlier version enumerated the
types worth exposing, which meant coverage was however long that list happened to be, and every
answer to "is X supported?" was "no, but I can add it". The question a level poses is structural
rather than nominal: an instance either carries a LinearTransform, in which case it is placed
somewhere and becomes an Xform, or it does not, in which case it is a setting, a lookup table or a
relation and becomes a plain prim. Both carry their whole EBX record, so an edit to any field of
any instance survives the trip, including for types nobody has thought about yet.

That is what makes material relations, shader graphs and the rest "supported": not code that knows
what a MaterialRelationPropertyData is, but the absence of anywhere for one to fall through.

WHERE each instance goes is the level's own ownership graph, not the partition tree it is filed
under. A partition is a file; a world part is a container, and BF3 says in the EBX which objects
are in it. So a WorldPartData prim owns the objects its `Objects` list names, a sub-world owns its
world parts, and the whole thing hangs off the LevelData at /World/Level -- which means selecting
a layer in a DCC selects the layer, and moving it moves what is in it. Measured on mp_001: 3566 of
its 14033 instances have an owner, five levels deep; on mp_003, 4276 of 13393.

The other 10467 are the contents of shared object blueprints -- a prop used sixty times -- which
nothing in the level owns and which are therefore still filed by partition path under
/World/Entities. Descending into them would author one blueprint's instances sixty times, sixty
prims writing back to one EBX record, and fifty-nine edits would vanish with nothing reported.
"""
import json
import os

from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdMedia, UsdPhysics, Vt   # noqa: F401

BF3 = 'bf3'

# The four vectors a fb::LinearTransform is made of. An instance holding one of these is placed in
# the world; this is the test, rather than a list of type names.
TRANSFORM_KEYS = ('right', 'up', 'forward', 'trans')

# Which field is the instance's own placement, when it has several. MEASURED on MP_001: six
# different field names hold a LinearTransform, and one instance can hold five at once -- a vehicle
# spawner carries its own BlueprintTransform plus where the airdrop arrives, where the carrier
# flies and where its controllable ends up. Transform and BlueprintTransform never appear together,
# which is what makes "whichever of the two is present" a placement rather than a guess.
#
# The others are settings that happen to be shaped like a transform. They are still authored, as
# children of the instance, because a spawn you cannot see is a spawn you cannot move -- but they
# are not the thing the instance IS, so they do not become its Xform.
PLACEMENT_FIELDS = ('Transform', 'BlueprintTransform')


def is_transform(value):
    """Is `value` a LinearTransform, rather than some other field that happens to be named one?"""
    if not isinstance(value, dict):
        return False

    return all(isinstance(value.get(k), dict) for k in TRANSFORM_KEYS)


def _matrix(t):
    """BF3 LinearTransform -> USD row-major 4x4."""
    r, u, f, tr = (t.get('right') or {}), (t.get('up') or {}), \
        (t.get('forward') or {}), (t.get('trans') or {})
    return Gf.Matrix4d(r.get('x', 1.0), r.get('y', 0.0), r.get('z', 0.0), 0.0,
                       u.get('x', 0.0), u.get('y', 1.0), u.get('z', 0.0), 0.0,
                       f.get('x', 0.0), f.get('y', 0.0), f.get('z', 1.0), 0.0,
                       tr.get('x', 0.0), tr.get('y', 0.0), tr.get('z', 0.0), 1.0)


def _linear_transform(m):
    """USD 4x4 -> BF3 LinearTransform."""
    r = [list(row) for row in m]
    return {'right': {'x': r[0][0], 'y': r[0][1], 'z': r[0][2]},
            'up': {'x': r[1][0], 'y': r[1][1], 'z': r[1][2]},
            'forward': {'x': r[2][0], 'y': r[2][1], 'z': r[2][2]},
            'trans': {'x': r[3][0], 'y': r[3][1], 'z': r[3][2]}}


# Instance types that have a real USD equivalent, rather than only a transform. Carrying a light
# as an Xform with its record in customData round-trips perfectly and is still useless in a DCC:
# you can move it and you cannot change its colour. These get authored as the USD type they ARE,
# with the fields that have a USD meaning mapped onto it and written back on read.
#
# Everything not listed keeps the plain-prim treatment -- lossless, just not editable as anything
# but a record.
LIGHTS = {
    'OutdoorLightComponentData': 'distant',
    'LightComponentData': 'sphere',
    'PointLightEntityData': 'sphere',
    'SpotLightEntityData': 'spot',
}


def _author_light(stage, path, kind, inst):
    """A BF3 light as its UsdLux equivalent. Returns the prim."""
    if kind == 'distant':
        # The sun. Directional, so UsdLux.DistantLight is the exact fit; it has no radius.
        light = UsdLux.DistantLight.Define(stage, path)
    elif kind == 'sphere':
        light = UsdLux.SphereLight.Define(stage, path)
        light.CreateRadiusAttr(float(inst.get('Radius') or 0.0))
    else:
        # A cone spot is a disk with a shaping cone -- UsdLux has no spot type of its own.
        light = UsdLux.DiskLight.Define(stage, path)
        light.CreateRadiusAttr(float(inst.get('Width') or 0.0) or 0.1)
        shaping = UsdLux.ShapingAPI.Apply(light.GetPrim())
        # BF3 stores the FULL cone angle in degrees; UsdLux wants the half-angle.
        shaping.CreateShapingConeAngleAttr(float(inst.get('ConeOuterAngle') or 0.0) / 2.0)
        shaping.CreateShapingConeSoftnessAttr(_cone_softness(inst))

    c = inst.get('Color') or {}
    light.CreateColorAttr(Gf.Vec3f(float(c.get('x', 1.0)), float(c.get('y', 1.0)),
                                   float(c.get('z', 1.0))))
    light.CreateIntensityAttr(float(inst.get('Intensity') or 0.0))
    # Visible is BF3's own enable flag, not USD visibility, but a light the level turns off should
    # not light up a DCC either.
    if inst.get('Visible') is False:
        UsdGeom.Imageable(light.GetPrim()).CreateVisibilityAttr(UsdGeom.Tokens.invisible)

    return light.GetPrim()


def _cone_softness(inst):
    """Inner/outer cone as a 0..1 softness. 0 inner means a fully soft edge."""
    outer = float(inst.get('ConeOuterAngle') or 0.0)
    inner = float(inst.get('ConeInnerAngle') or 0.0)

    if outer <= 0.0:
        return 0.0

    return max(0.0, min(1.0, 1.0 - (inner / outer)))


def _read_light(prim, kind, record):
    """Write a DCC's edits to the light back into the EBX record.

    ONLY fields the record already has. A field that is merely plausible for "a light" is not
    necessarily on THIS type: OutdoorLightComponentData (the sun) carries SunColor/SkyColor/
    GroundColor and no `Color` at all, and writing one produced EBX that Rime refused to
    deserialize -- "Could not find member 'Color' on object of type 'OutdoorLightComponentData'" --
    which aborted the whole bundle build.
    """
    if kind == 'distant':
        light = UsdLux.DistantLight(prim)
    elif kind == 'sphere':
        light = UsdLux.SphereLight(prim)
    else:
        light = UsdLux.DiskLight(prim)

    c = light.GetColorAttr().Get()

    if c is not None and 'Color' in record:
        record['Color'] = {'x': float(c[0]), 'y': float(c[1]), 'z': float(c[2])}

    i = light.GetIntensityAttr().Get()

    if i is not None and 'Intensity' in record:
        record['Intensity'] = float(i)

    r = light.GetRadiusAttr().Get() if kind != 'distant' else None

    if r is not None and kind == 'sphere' and 'Radius' in record:
        record['Radius'] = float(r)

    if kind == 'spot' and prim.HasAPI(UsdLux.ShapingAPI):
        a = UsdLux.ShapingAPI(prim).GetShapingConeAngleAttr().Get()

        if a is not None:
            record['ConeOuterAngle'] = float(a) * 2.0

    return record


# Volumes. 319 of MP_001's instances describe a REGION -- a shape to keep emitters out of, a box
# to gather light probes in, an occluder -- and as bare Xforms they are invisible: a DCC shows a
# pivot with no indication of what it encloses.
#
# The geometry goes on a CHILD prim, never on the entity itself. read() writes the entity's own
# transform back from its local-to-world, so putting a scale on it to size a box would fold that
# scale into the EBX record and the volume would grow on every round trip.
VOLUMES = ('VolumeVectorShapeData', 'LightProbeVolumeData', 'OccluderVolumeEntityData',
           'EmitterExclusionVolumeData',
           # Every other AREA/TRIGGER in the game is the same thing: a box whose size lives in its
           # transform. They were carried as records only, so ~2000 spatial objects per game were
           # invisible in a DCC -- you could not see a combat boundary, a sound area or a death
           # trigger, let alone move one. Census across 49 levels: SoundArea 928, UICombatArea 459,
           # PathfindingExclusion 418, AreaProximity 131, DamageAreaTrigger 48, UIMinimapVolume 14,
           # DestructionVolume 12, ClearAreaTrigger 9, DeathAreaTrigger 5, AreaTrigger 2,
           # CameraEnterAreaTrigger 2.
           'SoundAreaEntityData', 'UICombatAreaEntityData', 'PathfindingExclusionVolumeData',
           'AreaProximityEntityData', 'DamageAreaTriggerEntityData', 'UIMinimapVolumeEntityData',
           'DestructionVolumeData', 'ClearAreaTriggerEntityData', 'DeathAreaTriggerEntityData',
           'AreaTriggerEntityData', 'CameraEnterAreaTriggerEntityData',
           # A decal is a PROJECTOR: a box that stamps its texture on whatever it encloses. It
           # carries no size of its own because the size is in its transform, so the same unit box
           # that draws the other volumes draws this one correctly.
           'DecalEntityData')

# Bodies. Mass, friction and restitution are exactly what UsdPhysics models, so they become real
# attributes a DCC can show and edit rather than numbers buried in a JSON record.
#
# A negative value is BF3's "inherit from the asset", not a real quantity -- writing -1 kg into
# USD would be a lie, so only non-negative values are mapped.
PHYSICS = ('RigidBodyData', 'PhysicsEntityData')

# USD models positional audio natively, so a BF3 sound becomes a real UsdMedia.SpatialAudio prim
# rather than an untyped Xform with a JSON blob: a DCC can see it, move it and hear where it sits.
AUDIO = ('SoundEntityData', 'SoundAreaEntityData', 'SoundEffectEntityData')


def _author_physics(prim, inst):
    UsdPhysics.RigidBodyAPI.Apply(prim)
    mass = inst.get('Mass')

    if isinstance(mass, (int, float)) and mass >= 0:
        UsdPhysics.MassAPI.Apply(prim).CreateMassAttr(float(mass))

    material = None

    for field, make in (('Friction', 'CreateDynamicFrictionAttr'),
                        ('Restitution', 'CreateRestitutionAttr')):
        v = inst.get(field)

        if not isinstance(v, (int, float)) or v < 0:
            continue

        material = material or UsdPhysics.MaterialAPI.Apply(prim)
        getattr(material, make)(float(v))


def _read_physics(prim, record):
    if prim.HasAPI(UsdPhysics.MassAPI):
        m = UsdPhysics.MassAPI(prim).GetMassAttr().Get()

        if m is not None:
            record['Mass'] = float(m)

    if prim.HasAPI(UsdPhysics.MaterialAPI):
        mat = UsdPhysics.MaterialAPI(prim)
        f = mat.GetDynamicFrictionAttr().Get()
        r = mat.GetRestitutionAttr().Get()

        if f is not None:
            record['Friction'] = float(f)

        if r is not None:
            record['Restitution'] = float(r)

    return record


def _author_volume(stage, prim, kind, inst):
    """Draw what the volume encloses, as a guide-purpose child."""
    path = prim.GetPath().AppendChild('shape')

    if kind == 'VolumeVectorShapeData':
        pts = inst.get('Points') or []

        if not pts:
            return

        # These points are WORLD space, and the prim they hang under is already placed, so the
        # child resets the transform stack rather than being placed twice.
        curve = UsdGeom.BasisCurves.Define(stage, path)
        closed = bool(inst.get('IsClosed'))
        verts = [Gf.Vec3f(float(q.get('x', 0.0)), float(q.get('y', 0.0)), float(q.get('z', 0.0)))
                 for q in pts]

        if closed:
            verts.append(verts[0])

        curve.CreatePointsAttr(verts)
        curve.CreateCurveVertexCountsAttr([len(verts)])
        curve.CreateTypeAttr(UsdGeom.Tokens.linear)
        curve.CreateWidthsAttr([0.15] * len(verts))
        curve.SetWidthsInterpolation(UsdGeom.Tokens.constant)
        curve.CreatePurposeAttr(UsdGeom.Tokens.guide)
        UsdGeom.Xformable(curve).SetResetXformStack(True)
        return

    box = UsdGeom.Cube.Define(stage, path)
    box.CreateSizeAttr(2.0)                      # a unit cube is +/-1, i.e. half extents of 1
    box.CreatePurposeAttr(UsdGeom.Tokens.guide)

    half = inst.get('HalfExtents')

    if isinstance(half, dict):
        UsdGeom.Xformable(box).AddScaleOp().Set(
            Gf.Vec3f(float(half.get('x', 1.0)), float(half.get('y', 1.0)),
                     float(half.get('z', 1.0))))


def transform_fields(inst):
    """-> (placement field or None, other transform-bearing fields) for one instance."""
    found = [k for k, v in inst.items() if is_transform(v)]

    for field in PLACEMENT_FIELDS:
        if field in found:
            return field, sorted(k for k in found if k != field)

    # No recognised placement field, but transforms all the same: take the first by name so the
    # result does not depend on dictionary order, and treat the rest as secondary.
    found.sort()
    return (found[0], found[1:]) if found else (None, [])


def _safe(name):
    out = ''.join(c if (c.isalnum() or c == '_') else '_' for c in name)
    return ('_' + out) if (not out or out[0].isdigit()) else out


import struct as _struct


# Structural bookkeeping -- an index, a wiring flag or the transform we already author as a real
# xform. Writing these as editable attributes would invite a DCC to change something that is not
# authorable.
_SKIP_FIELDS = {'$type', 'Components', 'IndexInBlueprint', 'IsEventConnectionTarget',
                'IsPropertyConnectionTarget', 'Transform', 'BlueprintTransform'}


def _f32(x):
    """What a float64 becomes after a trip through a 32-bit USD attribute."""
    try:
        return _struct.unpack('f', _struct.pack('f', x))[0]
    except Exception:                                        # noqa: BLE001
        return x


def _vec_key(v):
    """('x','y','z') -> a component tuple, or None if this dict is not a vector."""
    if not isinstance(v, dict):
        return None

    keys = set(v)

    for cand in (('x', 'y'), ('x', 'y', 'z'), ('x', 'y', 'z', 'w')):
        if keys == set(cand):
            return cand

    return None


def _is_ref(v):
    """A guid pointer to another instance, rather than a record with fields of its own."""
    return isinstance(v, dict) and set(v.keys()) <= {'PartitionGuid', 'InstanceGuid', '$type',
                                                     'Name'}


def _author_array(prim, name, v):
    """A list of scalars as a native USD array, typed by what it holds."""
    if all(isinstance(x, bool) for x in v):
        prim.CreateAttribute(name, Sdf.ValueTypeNames.BoolArray).Set(Vt.BoolArray(list(v)))
    elif all(isinstance(x, str) for x in v):
        prim.CreateAttribute(name, Sdf.ValueTypeNames.StringArray).Set(Vt.StringArray(list(v)))
    elif all(isinstance(x, int) and not isinstance(x, bool) for x in v):
        # Int64: BF3 lookup tables hold values well past 2^31 and a 32-bit array would wrap them.
        prim.CreateAttribute(name, Sdf.ValueTypeNames.Int64Array).Set(Vt.Int64Array(list(v)))
    else:
        prim.CreateAttribute(name, Sdf.ValueTypeNames.DoubleArray).Set(
            Vt.DoubleArray([float(x) for x in v]))


def _read_extra(prim, record):
    """Put edited arrays and nested-record leaves back, keeping each field's original shape."""
    for k, old in list(record.items()):
        if k in _SKIP_FIELDS:
            continue

        name = BF3 + k

        if isinstance(old, list) and old and not any(isinstance(x, (dict, list)) for x in old):
            attr = prim.GetAttribute(name)

            if attr and attr.HasAuthoredValue() and attr.Get() is not None:
                got = list(attr.Get())

                # Keep the element type the record had: a float array read back onto a list of ints
                # would rewrite every entry as a float and the partition stops matching its type.
                if all(isinstance(x, bool) for x in old):
                    record[k] = [bool(x) for x in got]
                elif all(isinstance(x, int) and not isinstance(x, bool) for x in old):
                    record[k] = [int(x) for x in got]
                elif all(isinstance(x, str) for x in old):
                    record[k] = [str(x) for x in got]
                else:
                    record[k] = [float(x) for x in got]

        elif isinstance(old, dict) and not _vec_key(old) and not _is_ref(old):
            for _sk, _sv in list(old.items()):
                attr = prim.GetAttribute('%s:%s' % (name, _sk))

                if not attr or not attr.HasAuthoredValue() or attr.Get() is None:
                    continue

                got = attr.Get()

                if isinstance(_sv, bool):
                    old[_sk] = bool(got)
                elif isinstance(_sv, int):
                    old[_sk] = int(got)
                elif isinstance(_sv, float):
                    old[_sk] = float(got)
                elif isinstance(_sv, str):
                    old[_sk] = str(got)


def _author_fields(prim, inst):
    """Author each editable field as a real, typed USD attribute.

    Only 9 of BF3's 440 level types had a native USD form, so everything else -- fog, sky, wind,
    sun, water, destruction, AI settings -- arrived in a DCC as an opaque JSON blob in customData:
    carried losslessly, but not editable. These attributes are the editable surface; the customData
    record stays authoritative for SHAPE, so read() knows how to put a value back.

    DOUBLE precision throughout, deliberately: BF3 fields are float64 in the JSON, and authoring
    them through USD's 32-bit Float/Color3f would quietly change every value it round-tripped.
    """
    for k, v in inst.items():
        if k in _SKIP_FIELDS:
            continue

        name = BF3 + k

        try:
            if isinstance(v, bool):
                prim.CreateAttribute(name, Sdf.ValueTypeNames.Bool).Set(v)
            elif isinstance(v, int):
                prim.CreateAttribute(name, Sdf.ValueTypeNames.Int64).Set(v)
            elif isinstance(v, float):
                prim.CreateAttribute(name, Sdf.ValueTypeNames.Double).Set(v)
            elif isinstance(v, str):
                prim.CreateAttribute(name, Sdf.ValueTypeNames.String).Set(v)
            elif isinstance(v, list) and v and not any(isinstance(x, (dict, list)) for x in v):
                # A list of scalars is a native USD array. 4,992 of these were reachable only
                # through customData, which meant a lookup table or a name list could be read and
                # never edited.
                _author_array(prim, name, v)
            elif isinstance(v, dict) and not _vec_key(v) and not _is_ref(v):
                # A nested record: one attribute per scalar leaf, namespaced under its field. This
                # is the single largest carried-only group -- 134,081 fields, things like an
                # emitter's TextureInfo -- and namespacing keeps them editable without inventing a
                # child prim for every struct.
                for _sk, _sv in v.items():
                    if isinstance(_sv, bool):
                        prim.CreateAttribute('%s:%s' % (name, _sk),
                                             Sdf.ValueTypeNames.Bool).Set(_sv)
                    elif isinstance(_sv, (int, float)):
                        prim.CreateAttribute('%s:%s' % (name, _sk),
                                             Sdf.ValueTypeNames.Double).Set(float(_sv))
                    elif isinstance(_sv, str):
                        prim.CreateAttribute('%s:%s' % (name, _sk),
                                             Sdf.ValueTypeNames.String).Set(_sv)
            else:
                comps = _vec_key(v)

                if not comps:
                    continue                      # refs and record arrays stay in customData

                vals = [float(v.get(c, 0.0)) for c in comps]

                if len(comps) == 3 and k.endswith('Color'):
                    prim.CreateAttribute(name, Sdf.ValueTypeNames.Color3d).Set(Gf.Vec3d(*vals))
                elif len(comps) == 2:
                    prim.CreateAttribute(name, Sdf.ValueTypeNames.Double2).Set(Gf.Vec2d(*vals))
                elif len(comps) == 3:
                    prim.CreateAttribute(name, Sdf.ValueTypeNames.Double3).Set(Gf.Vec3d(*vals))
                else:
                    prim.CreateAttribute(name, Sdf.ValueTypeNames.Double4).Set(Gf.Vec4d(*vals))
        except Exception:                                    # noqa: BLE001
            continue                                         # never let one odd field kill a level


def _read_fields(prim, record, orig=None):
    """Put edited attribute values back, keeping each field's ORIGINAL shape.

    `orig` is the record as EXPORTED. It is needed to tell a real edit from 32-bit noise: USD's
    UsdPhysics/UsdLux schemas are float32 by definition, so a value that merely passed through one
    of them comes back as 0.4 -> 0.4000000059604645. Measured on mp_003 before this existed: 4 of
    2418 fields changed that way with nobody having edited anything.

    So: if a specific reader's value is just the float32 image of what we exported, it is noise and
    the exact double wins. If it differs by more than that, a human moved it in a DCC and it wins.
    """
    for k, old in list(record.items()):
        if k in _SKIP_FIELDS:
            continue

        attr = prim.GetAttribute(BF3 + k)

        if not attr or not attr.HasAuthoredValue():
            continue

        val = attr.Get()

        if val is None:
            continue

        was = (orig or {}).get(k)

        if isinstance(was, float) and isinstance(old, float) and old != was:
            # A specific reader already wrote this field. Keep it only if it is a real edit.
            if old != _f32(was):
                continue

        comps = _vec_key(old)

        if comps:
            record[k] = dict(old, **{c: float(val[i]) for i, c in enumerate(comps)})
        elif isinstance(old, bool):
            record[k] = bool(val)
        elif isinstance(old, int):
            record[k] = int(val)
        elif isinstance(old, float):
            record[k] = float(val)
        elif isinstance(old, str):
            record[k] = str(val)


# ---------------------------------------------------------------------------
# The level graph.
#
# Nesting by partition path made a level BROWSABLE -- you could find layer0_default in an outliner
# -- but a partition tree is a filing system, not the graph the engine descends. BF3 spells the
# real one out in the EBX, as ownership:
#
#     LevelData.Objects
#       WorldPartReferenceObjectData -> Blueprint -> a partition whose primary instance is a
#                                       WorldPartData, whose OWN Objects are that layer's contents
#       SubWorldReferenceObjectData  -> the same, one world down (conquest, rush, tdm ...)
#         ReferenceObjectData        -> an object blueprint, placed by BlueprintTransform
#
# So a WorldPartData prim CAN own its objects: BF3 says which ones they are. Measured over
# mp_001's 490 partitions: 3754 `Objects` references, every single one naming an instance in its
# own partition, and 72 structural blueprint edges, every one resolving to a dumped partition.
# There is nothing here to guess at.
#
# Only the STRUCTURAL reference objects are followed into their blueprint. A ReferenceObjectData
# points at a SHARED object blueprint -- a prop used 60 times -- and descending into it would
# author that blueprint's instances 60 times over, 60 prims writing back to one EBX instance. The
# structural ones are singletons: measured on mp_001, 0 of its 72 world-part/sub-world blueprint
# partitions is referenced more than once.
STRUCTURAL = ('WorldPartReferenceObjectData', 'SubWorldReferenceObjectData')


def _short(kind):
    """`SoundAreaEntityData` -> `SoundArea`, for a prim name a person can read."""
    return kind.replace('EntityData', '').replace('Data', '') or kind


def _index(ebx_dir, partitions):
    """Load every partition once, indexed the three ways a reference can name one."""
    docs, by_partition, by_primary = {}, {}, {}

    for part in partitions:
        f = os.path.join(ebx_dir, part + '.json')

        if not os.path.exists(f):
            continue

        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        docs[part] = doc
        pg = str(doc.get('PartitionGuid') or '').lower()
        pi = str(doc.get('PrimaryInstanceGuid') or '').lower()

        if pg:
            by_partition.setdefault(pg, part)

        if pi:
            by_primary.setdefault(pi, part)

    return docs, by_partition, by_primary


def _blueprint_partition(inst, docs, by_partition, by_primary):
    """Which partition a reference object points at, by whichever link it happens to use.

    A WorldPartReferenceObjectData carries a real Blueprint reference. A SubWorldReferenceObjectData
    usually does NOT: its Blueprint is null and the sub-level is named by BUNDLE, which the engine
    resolves at load time. Measured on mp_001, 8 of its 8 sub-worlds are named that way, so a
    resolver that only followed Blueprint found the world parts and none of the worlds.
    """
    bp = inst.get('Blueprint') or {}
    part = by_partition.get(str(bp.get('PartitionGuid') or '').lower())

    if part is None:
        part = by_primary.get(str(bp.get('InstanceGuid') or '').lower())

    if part is None and isinstance(inst.get('BundleName'), str):
        # The bundle name IS the partition path, in the game's own capitalisation.
        cand = inst['BundleName'].lower()
        part = cand if cand in docs else None

    return part


def _graph(docs, by_partition, by_primary):
    """-> ({node: [child node]}, {child node: index in its owner's Objects, or None}).

    A node is (partition path, instance guid) -- the same pair the round trip writes back with, so
    a prim's place in the tree and its identity in the EBX are the same fact.
    """
    kids, ordinal = {}, {}

    for part, doc in docs.items():
        instances = doc.get('Instances') or {}

        for guid, inst in instances.items():
            node = (part, guid)

            # What the instance OWNS, in the order BF3 stored it -- which is the order the level
            # editor showed, so an outliner sorted by name still reads like the layer did.
            for i, ref in enumerate(inst.get('Objects') or []):
                child = str(ref.get('InstanceGuid') or '')

                if child in instances and (part, child) not in ordinal:
                    kids.setdefault(node, []).append((part, child))
                    ordinal[(part, child)] = i

            if inst.get('$type') not in STRUCTURAL:
                continue

            target = _blueprint_partition(inst, docs, by_partition, by_primary)

            if target is None:
                continue

            primary = str(docs[target].get('PrimaryInstanceGuid') or '')

            if primary not in (docs[target].get('Instances') or {}):
                continue

            kids.setdefault(node, []).append((target, primary))
            # A blueprint root is its reference object's only child, so it needs no ordinal to be
            # unique -- and its TYPE is the useful name: .../000_layer0_default/WorldPartData.
            ordinal.setdefault((target, primary), None)

    return kids, ordinal


def _root(docs, level):
    """The LevelData instance the whole graph hangs from."""
    if level and level in docs:
        primary = str(docs[level].get('PrimaryInstanceGuid') or '')

        if primary in (docs[level].get('Instances') or {}):
            return (level, primary)

    # No level path given, or it was not dumped: take the partition whose primary instance IS a
    # LevelData. Sorted, so a corpus holding two of them picks the same one every run.
    for part in sorted(docs):
        primary = str(docs[part].get('PrimaryInstanceGuid') or '')
        inst = (docs[part].get('Instances') or {}).get(primary)

        if inst and inst.get('$type') == 'LevelData':
            return (part, primary)

    return None


def _reachable(kids, root):
    """Depth first from the level root -> (nodes parent-before-child, parent map, deepest)."""
    order, parent, depth = [root], {}, {root: 0}
    stack = [root]

    while stack:
        node = stack.pop()

        for child in kids.get(node, ()):
            # An instance its owner names twice, or a blueprint two reference objects share. The
            # first owner keeps it: two prims writing back to one EBX instance means the loser's
            # edits vanish with no error anywhere.
            if child in depth:
                continue

            parent[child] = node
            depth[child] = depth[node] + 1
            order.append(child)
            stack.append(child)

    return order, parent, max(depth.values())


def _transform_key(t):
    """A LinearTransform as the same 12 floats a placement dump carries, or None."""
    if not is_transform(t):
        return None

    return tuple(float((t.get(k) or {}).get(c, 0.0))
                 for k in ('right', 'up', 'forward') for c in 'xyz') + \
        tuple(float((t.get('trans') or {}).get(c, 0.0)) for c in 'xyz')


def _anchor(docs, nodes, placements):
    """Which reference object PLACES each mesh -> ({node: mesh name}, {(name, index): node}).

    placements.json is the ENGINE's flattened list: every mesh the level draws, including the ones
    that live inside an object blueprint and therefore belong to that blueprint rather than to the
    level. The level's own EBX holds only the reference objects it places directly, so this can
    only ever claim the placements the level itself owns -- measured on mp_001, 1297 of 6525
    (19.9%), out of 1840 reference objects in the level's partitions.

    The match is on EXACTLY equal floats. Matching to 1e-9 instead found 71 more, and every one of
    them would have parked a mesh on a transform that is not bit-identical to the one it was
    dumped with -- which is the only thing the placement round trip measures. Of the 1297, just 8
    land on a transform more than one reference object shares.
    """
    pool = {}

    for node in nodes:
        part, guid = node
        inst = docs[part]['Instances'][guid]

        if inst.get('$type') != 'ReferenceObjectData':
            continue

        key = _transform_key(inst.get('BlueprintTransform'))

        if key is not None:
            pool.setdefault(key, []).append(node)

    mesh_of, anchor = {}, {}

    for name in sorted(placements or {}):
        for i, t in enumerate(placements[name]):
            if len(t) < 12:
                continue

            here = pool.get(tuple(float(x) for x in t[:12]))

            if not here:
                continue

            node = here.pop(0)
            mesh_of[node] = name
            anchor[(name, i)] = node

    return mesh_of, anchor


def _label(node, docs, ordinal, mesh, by_partition, by_primary):
    """The prim name for one graph node."""
    part, guid = node
    inst = docs[part]['Instances'][guid]
    kind = inst.get('$type') or 'Unknown'

    if ordinal is None:
        return _safe(kind)                    # a blueprint root: its type IS the name

    if mesh:
        leaf = mesh.rsplit('/', 1)[-1]        # the mesh it turned out to place
    else:
        target = _blueprint_partition(inst, docs, by_partition, by_primary)
        leaf = target.rsplit('/', 1)[-1] if target else _short(kind)

    # `o` first: a USD prim name is an identifier, so it cannot START with the index, and a path
    # built from one comes back as the empty path with no error until something tries to use it.
    return 'o%03d_%s' % (ordinal, _safe(leaf))


def _assign(docs, order, parent, ordinal, mesh_of, root_path, by_partition, by_primary):
    """-> {node: prim path}, unique among siblings."""
    paths = {order[0]: root_path}
    used = {}

    for node in order[1:]:
        base = _label(node, docs, ordinal.get(node), mesh_of.get(node), by_partition, by_primary)
        here = used.setdefault(parent[node], set())
        name = base
        n = 1

        # Two siblings cannot share a name: USD would hand back the SAME prim for both, and the
        # second record would overwrite the first with nothing reported.
        while name in here:
            name = '%s_%d' % (base, n)
            n += 1

        here.add(name)
        paths[node] = paths[parent[node]].AppendChild(name)

    return paths


def _place(stage, path, part, guid, inst, counts, placed):
    """Author one EBX instance at `path` -- the USD type it IS, its record, its editable fields."""
    kind = inst.get('$type') or 'Unknown'
    field, extra = transform_fields(inst)

    counts[kind] = counts.get(kind, 0) + 1

    if field:
        placed[kind] = placed.get(kind, 0) + 1

    if field and kind in AUDIO:
        prim = UsdMedia.SpatialAudio.Define(stage, path).GetPrim()
        UsdGeom.Xformable(prim).AddTransformOp().Set(_matrix(inst[field]))
    elif field and kind in LIGHTS:
        prim = _author_light(stage, path, LIGHTS[kind], inst)
        UsdGeom.Xformable(prim).AddTransformOp().Set(_matrix(inst[field]))
    elif field:
        prim = UsdGeom.Xform.Define(stage, path).GetPrim()
        UsdGeom.Xformable(prim).AddTransformOp().Set(_matrix(inst[field]))
    else:
        # A prim with no type rather than a Scope: an unplaced instance is a record, and giving it
        # a geometric type would put a settings object into a DCC's outliner as though it were
        # somewhere in the world.
        prim = stage.DefinePrim(path)

    prim.SetCustomDataByKey(BF3 + 'Entity', json.dumps(
        {'partition': part, 'instance': guid, 'type': kind,
         'field': field, 'record': inst}))
    _author_fields(prim, inst)

    if kind in VOLUMES:
        _author_volume(stage, prim, kind, inst)

    if kind in PHYSICS:
        _author_physics(prim, inst)

    # The instance's other transforms, as children. Their values are in the instance's own space,
    # so they hang off it and are read back LOCAL -- composing them with the parent would move an
    # airdrop point by wherever its spawner happens to be.
    for other in extra:
        child = UsdGeom.Xform.Define(stage, path.AppendChild(_safe(other))).GetPrim()
        UsdGeom.Xformable(child).AddTransformOp().Set(_matrix(inst[other]))
        child.SetCustomDataByKey(BF3 + 'EntityField', json.dumps(
            {'partition': part, 'instance': guid, 'field': other}))

    return prim


def author(stage, root, ebx_dir, partitions, level=None, placements=None):
    """Write every instance of every partition in `partitions` under `root`.

    Whatever the level REACHES goes under <root>/Level, in BF3's own ownership order: the LevelData
    is the root prim, each world-part reference object owns the WorldPartData it points at, and
    that WorldPartData owns the objects its `Objects` list names. Selecting a world part in a DCC
    now selects the layer, and moving it moves the layer -- which is the thing a partition-path
    tree could not do, because a partition is a file and a world part is a container.

    Everything the graph does NOT reach still goes under <root>/Entities, nested by partition path
    exactly as before. That is not a fallback so much as an admission: an instance nothing owns has
    no place in an ownership tree, and hiding it inside one would be an invented parent.

    `placements` is the level's mesh placement dump. Where a placement's transform IS a reference
    object's BlueprintTransform, the caller is told the prim path of that reference object, so the
    geometry can be authored as its child instead of in a flat per-mesh list.

    Returns (counts, placed, graph): {type: count} for what was carried and what was placed, and
    the graph's own numbers -- including `anchors`, {mesh name: {placement index: prim path}}.
    """
    docs, by_partition, by_primary = _index(ebx_dir, partitions)
    kids, ordinal = _graph(docs, by_partition, by_primary)
    start = _root(docs, level)

    counts, placed = {}, {}
    graph = {'nodes': 0, 'depth': 0, 'loose': 0, 'anchors': {}}
    done = set()

    if start is not None:
        order, parent, depth = _reachable(kids, start)
        mesh_of, anchor = _anchor(docs, order, placements)
        paths = _assign(docs, order, parent, ordinal, mesh_of,
                        root.GetPath().AppendChild('Level'), by_partition, by_primary)

        for node in order:
            part, guid = node
            _place(stage, paths[node], part, guid, docs[part]['Instances'][guid], counts, placed)
            done.add(node)

        for (name, i), node in anchor.items():
            graph['anchors'].setdefault(name, {})[i] = str(paths[node])

        graph['nodes'] = len(order)
        graph['depth'] = depth

    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Entities'))

    for part in partitions:
        doc = docs.get(part)

        if doc is None:
            continue

        for guid, inst in (doc.get('Instances') or {}).items():
            if (part, guid) in done:
                continue

            kind = inst.get('$type') or 'Unknown'

            # Nested by partition path, not bucketed by $type. Grouping by type put SubWorldData
            # and WorldPartData in the stage as rows of a table, so a DCC could not see which layer
            # an object belonged to; the partition tree at least says which FILE it came from.
            here = scope
            for seg in part.split('/'):
                here = UsdGeom.Scope.Define(stage, here.GetPath().AppendChild(_safe(seg)))

            group = UsdGeom.Scope.Define(stage, here.GetPath().AppendChild(_safe(kind)))
            _place(stage, group.GetPath().AppendChild('e%05d' % counts.get(kind, 0)),
                   part, guid, inst, counts, placed)
            graph['loose'] += 1

    return counts, placed, graph


def read(stage_path):
    """-> {partition: {instance guid: updated record}} for everything authored above."""
    stage = Usd.Stage.Open(stage_path)
    edits, fields = {}, []

    for prim in stage.Traverse():
        raw = prim.GetCustomDataByKey(BF3 + 'Entity')

        if raw:
            try:
                meta = json.loads(raw)
            except Exception:                                # noqa: BLE001
                continue

            record = dict(meta['record'])

            # Only the field the prim WAS gets written back. Writing a Transform onto an instance
            # that never had one adds a field to the EBX record, and the partition stops matching
            # the type it declares.
            if meta.get('field'):
                # LOCAL, not local-to-world. BF3 stores an object's transform relative to whatever
                # owns it, and now that a world part's prim really is its objects' parent, the two
                # are different numbers -- writing the world transform back would fold the owner's
                # placement into every child on every trip. It happens to be a no-op today: all
                # 4103 world-part and sub-world reference objects across the 70 dumped levels carry
                # an identity BlueprintTransform, so local == world for everything under them. The
                # reason to read local anyway is that a DCC user who moves the world part is then
                # editing the world part, which is what the hierarchy is FOR.
                xf = UsdGeom.Xformable(prim).GetLocalTransformation(Usd.TimeCode.Default())
                record[meta['field']] = _linear_transform(xf)

            if meta.get('type') in LIGHTS:
                _read_light(prim, LIGHTS[meta['type']], record)

            if meta.get('type') in PHYSICS:
                _read_physics(prim, record)

            # Generic fields last: an explicit typed attribute (a light's colour, a body's mass)
            # is authored by the specific reader above, and this must not undo it.
            _read_fields(prim, record, meta.get('record'))
            _read_extra(prim, record)

            edits.setdefault(meta['partition'], {})[meta['instance']] = record
            continue

        raw = prim.GetCustomDataByKey(BF3 + 'EntityField')

        if raw:
            try:
                fields.append((json.loads(raw), prim))
            except Exception:                                # noqa: BLE001
                pass

    # Second pass: a secondary transform patches the record its parent already put in place, so it
    # cannot be applied until every instance has been seen.
    for meta, prim in fields:
        record = edits.get(meta['partition'], {}).get(meta['instance'])

        if record is None:
            continue

        local = UsdGeom.Xformable(prim).GetLocalTransformation(Usd.TimeCode.Default())
        record[meta['field']] = _linear_transform(local)

    return edits
