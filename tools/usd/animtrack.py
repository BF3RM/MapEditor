#!/usr/bin/env python3
"""BF3 AnimTrackData <-> USD time samples.

AnimTrackData is the only Frostbite 2 animation format Rime can both read and WRITE (the Ant
bank codecs decode, but RimeLib.Animation's DCT Header.Serialize and DofTable.Serialize both
throw NotImplementedException, so nothing that goes through them can be shipped back). It is a
flat array of 24-byte Bezier keys driving ONE scalar:

    float Time, Value, InTanX, InTanY, OutTanX, OutTanY

and the resource name says which scalar: "<partition>/animtrackdata/<guid>_<property>", e.g.
levels/xp2_office/animtrackdata/60aa2b96-74ac-4b10-8d7b-69c955adf035_gun_transform.

MEASURED over every AnimTrackData in BF3 (Rime `dump_anim_track_data`): 1484/1484 re-encode
byte-exactly through Rime's own writer, 434891 keys, every payload an exact multiple of 24 bytes.

In USD a track becomes a time-sampled float attribute on a prim named after the property, with the
Bezier tangents kept as a customData sidecar -- USD's own attributes are sampled, not splined, so
writing only the samples would quietly flatten every curve in the game on the way back.
"""

import json
import os
import struct

from pxr import Usd, UsdGeom, Sdf, Vt

KEY = struct.Struct("<6f")
KEY_SIZE = KEY.size          # 24
BF3 = "bf3"


def parse(payload):
    """Raw AnimTrackData bytes -> [{time, value, inTanX, inTanY, outTanX, outTanY}]."""
    if len(payload) % KEY_SIZE:
        raise ValueError("AnimTrackData is %d bytes, not a multiple of %d"
                         % (len(payload), KEY_SIZE))
    out = []
    for off in range(0, len(payload), KEY_SIZE):
        t, v, ix, iy, ox, oy = KEY.unpack_from(payload, off)
        out.append({"time": t, "value": v, "inTanX": ix, "inTanY": iy,
                    "outTanX": ox, "outTanY": oy})
    return out


def serialise(keys):
    """Inverse of parse. float32 in and float32 out, so an untouched key is bit-identical."""
    buf = bytearray()
    for k in keys:
        buf += KEY.pack(k["time"], k["value"], k["inTanX"], k["inTanY"],
                        k["outTanX"], k["outTanY"])
    return bytes(buf)


def property_name(resource):
    """The scalar a track drives, from its resource name; None when the name does not say."""
    leaf = resource.rsplit("/", 1)[-1]
    # "<8-4-4-4-12 guid>_<property>". Split on the first '_' past the guid rather than the last,
    # because property names contain underscores ("gun_transform", "flattiremovement").
    return leaf[37:] if len(leaf) > 37 and leaf[36] == "_" else None


def author(stage, path, resource, keys):
    """Write one track under `path` as a time-sampled float attribute."""
    prim = UsdGeom.Scope.Define(stage, path).GetPrim()
    attr = prim.CreateAttribute("bf3:trackValue", Sdf.ValueTypeNames.Float)
    for k in keys:
        attr.Set(float(k["value"]), Usd.TimeCode(float(k["time"])))
    prim.SetCustomDataByKey(BF3 + "AnimTrack", json.dumps({
        "resource": resource,
        "property": property_name(resource),
        # Times and tangents. USD samples a value at a time; it has no Bezier tangent on a plain
        # attribute, so keeping them here is what makes the trip lossless rather than a resample.
        "keys": keys,
    }))
    return prim


def read(prim):
    """Inverse of author: the keys exactly as they were authored.

    The time samples are authored too, and a DCC that moves one changes the VALUE at that time --
    so the sampled value wins over the stored one, and the tangents (which USD cannot express)
    come from customData. Same rule the mesh codec uses for points versus bf3_Pos.
    """
    stored = json.loads(prim.GetCustomDataByKey(BF3 + "AnimTrack"))
    keys = stored["keys"]
    attr = prim.GetAttribute("bf3:trackValue")
    if attr and attr.GetNumTimeSamples() == len(keys):
        for k in keys:
            sampled = attr.Get(Usd.TimeCode(float(k["time"])))
            if sampled is not None:
                k["value"] = float(sampled)
    return stored["resource"], keys


def export_file(dump_path, out_path):
    """A Rime dump_anim_track_data JSON -> a .usda holding the same curve."""
    d = json.load(open(dump_path))
    if os.path.exists(out_path):
        os.remove(out_path)
    stage = Usd.Stage.CreateNew(out_path)
    root = UsdGeom.Scope.Define(stage, "/Animation")
    stage.SetDefaultPrim(root.GetPrim())
    name = (property_name(d["resource"]) or "track")
    safe = "".join(c if c.isalnum() or c == "_" else "_" for c in name) or "track"
    author(stage, "/Animation/" + safe, d["resource"], d["keys"])
    if d["keys"]:
        stage.SetStartTimeCode(min(k["time"] for k in d["keys"]))
        stage.SetEndTimeCode(max(k["time"] for k in d["keys"]))
    stage.GetRootLayer().Save()
    return out_path


def load_file(usd_path):
    """A .usda written by export_file -> (resource name, raw AnimTrackData bytes)."""
    stage = Usd.Stage.Open(usd_path)
    for prim in stage.Traverse():
        if prim.GetCustomDataByKey(BF3 + "AnimTrack"):
            resource, keys = read(prim)
            return resource, serialise(keys)
    raise ValueError("%s holds no bf3AnimTrack prim" % usd_path)
