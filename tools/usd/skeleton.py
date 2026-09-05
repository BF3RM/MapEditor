#!/usr/bin/env python3
"""BF3 SkeletonAsset -> the pieces UsdSkel needs.

A skinned MeshSet does NOT name its skeleton. Per LOD it carries two parallel
uint32 arrays of length PartCount:

    tail_blobs[0]  BoneIndexArray      index of the bone in the skeleton
    tail_blobs[1]  BoneShortNameArray  fb::hashQuickLowerCase of the bone's name

and per subset a ushort[] palette (`Subset.bone_indices`) of skeleton indices;
the vertex BoneIndices element indexes THAT palette, not the skeleton.

The skeleton itself is an EBX `SkeletonAsset` partition. Rime's `dump_skeleton`
command emits it with the name hashes already computed (the hash is a Frostbite
detail and is never reimplemented here) -- this module only consumes that JSON.

MEASURED, weapons/{ak74m,sv98,xp1_l96} x {1p,3p}, 18 LODs:
  * 64/64 BoneShortNameArray hashes resolve against
    animations/skeletons/weapon/weaponske01, and every BoneIndexArray entry
    equals the skeleton index of the name whose hash sits beside it.
  * dump_skeleton reports modelPoseWorstError == 0 on that skeleton and on
    animations/skeletons/venice1pske01 (179 bones): ModelPose is exactly
    LocalPose accumulated down Hierarchy, so either can regenerate the other.
"""

import json
import re
import struct

_SAFE = re.compile(r"[^A-Za-z0-9_]")


def load_dump(path):
    """Read a Rime `dump_skeleton` JSON file."""
    with open(path) as f:
        return json.load(f)


def joint_paths(bones):
    """USD joint tokens: the bone's ancestry joined by '/'.

    BF3 stores parents as indices that are always LOWER than the child's (checked
    on every skeleton this reads, and asserted here), which is the ordering
    UsdSkel requires, so the BF3 bone index and the USD joint index are the same
    number. That is what lets `Subset.bone_indices` be written straight into
    primvars:skel:jointIndices with no remapping table.
    """
    out = []
    for i, b in enumerate(bones):
        parent = b["parent"]
        if parent >= i:
            raise ValueError("bone %d (%s) has parent %d at or after it; UsdSkel needs "
                             "parents first" % (i, b["name"], parent))
        name = _SAFE.sub("_", b["name"]) or "bone%d" % i
        out.append((out[parent] + "/" + name) if parent >= 0 else name)
    return out


def lod_bones(lod):
    """(skeleton_index, name_hash) for each part of a skinned LOD."""
    n = lod.part_count
    if lod.type != 1 or n == 0 or not lod.tail_present[0]:
        return []
    idx = struct.unpack("<%dI" % n, lod.tail_blobs[0])
    names = (struct.unpack("<%dI" % n, lod.tail_blobs[1])
             if lod.tail_present[1] else (0,) * n)
    return list(zip(idx, names))


def resolve(ms, dump):
    """How many of `ms`'s bone-name hashes this skeleton accounts for.

    Returns (matched, total, mismatched) where `mismatched` lists the parts whose
    hash resolved to a DIFFERENT skeleton index than BoneIndexArray claims -- the
    case that means the mesh belongs to another skeleton entirely, which a bare
    match count would hide.
    """
    by_hash = {b["nameHashLowerCase"]: b for b in dump["bones"]}
    matched = total = 0
    bad = []
    for li, lod in enumerate(ms.lods):
        for slot, (index, name_hash) in enumerate(lod_bones(lod)):
            total += 1
            b = by_hash.get(name_hash)
            if b is None:
                bad.append((li, slot, "unresolved hash 0x%08x" % name_hash))
            elif b["index"] != index:
                bad.append((li, slot, "%s is bone %d, BoneIndexArray says %d"
                            % (b["name"], b["index"], index)))
            else:
                matched += 1
    return matched, total, bad


def synthesise(ms):
    """A skeleton for a mesh whose SkeletonAsset was not supplied.

    Every bone the mesh references becomes a root joint named after its hash. The
    rig is flat and the rest pose is identity, so it will not animate correctly --
    but the weights survive the trip and a DCC can still see the binding, which is
    strictly better than dropping the skinning on the floor.
    """
    seen = {}
    for lod in ms.lods:
        for index, name_hash in lod_bones(lod):
            seen.setdefault(index, name_hash)
    if not seen:
        return None
    top = max(seen) + 1
    ident = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
    return {
        "partition": None,
        "synthesised": True,
        "boneCount": top,
        "bones": [{"index": i, "name": ("bone_%08x" % seen[i]) if i in seen else "unused_%d" % i,
                   "parent": -1, "nameHash": 0, "nameHashLowerCase": seen.get(i, 0),
                   "localPose": list(ident), "modelPose": list(ident)}
                  for i in range(top)],
    }
