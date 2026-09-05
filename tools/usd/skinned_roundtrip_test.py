#!/usr/bin/env python3
"""Skinned MeshSet -> USD (with UsdSkel) -> MeshSet, measured.

    skinned_roundtrip_test.py <workdir>

<workdir> holds res/<name>.bin (dump_resource), chunks/<guid>.chunk (dump_chunk) and
skel/<skeleton>.json (Rime dump_skeleton). Writes usd/<name>.usda and emits
compare_manifest.json for Rime's `compare_resources`, which is the only verdict that counts:
it asks the MOUNT whether the re-emitted bytes are the shipped ones, payload AND meta.

Three separate things are checked, because passing one of them proves nothing about the others:

  1. resource/chunk bytes survive the trip
  2. the USD file actually CONTAINS a rig -- Skeleton prim, joints, and a jointIndices primvar on
     every skinned subset (a "green" round trip whose USD had no skeleton in it was the failure
     mode to guard against)
  3. UsdSkel's own skinning, evaluated at the rest pose, reproduces the exported points
"""

import glob
import json
import os
import sys
import uuid

import numpy as np
from pxr import Usd, UsdGeom, UsdSkel, Vt, Gf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bf3_usd
import meshset as MS
import skeleton as SK


def chunks_for(ms, chunk_dir):
    out = {}
    for i, l in enumerate(ms.lods):
        if l.data_chunk_id == b"\0" * 16:
            continue
        p = os.path.join(chunk_dir, "%s.chunk" % uuid.UUID(bytes_le=l.data_chunk_id))
        if os.path.exists(p):
            out[i] = open(p, "rb").read()
    return out


def check_rig(path, ms):
    """Does the written stage hold a usable rig? Returns (ok, note)."""
    stage = Usd.Stage.Open(path)
    skels = [p for p in stage.Traverse() if p.IsA(UsdSkel.Skeleton)]
    if not skels:
        return False, "no Skeleton prim"
    joints = UsdSkel.Skeleton(skels[0]).GetJointsAttr().Get()
    if not joints:
        return False, "Skeleton has no joints"
    bound = 0
    expect = 0
    for li, lod in enumerate(ms.lods):
        for si, sub in enumerate(lod.subsets):
            prim = stage.GetPrimAtPath("/Mesh/LOD%d/subset%d" % (li, si))
            if not prim or not prim.GetAttribute("points").HasValue():
                continue
            expect += 1
            b = UsdSkel.BindingAPI(prim)
            ip = b.GetJointIndicesPrimvar()
            if ip and ip.HasValue() and b.GetSkeletonRel().GetTargets():
                bound += 1
    if bound != expect:
        return False, "%d/%d subsets bound" % (bound, expect)
    return True, "%d joints, %d/%d subsets bound" % (len(joints), bound, expect)


def check_rest_skinning(path):
    """Skin every bound mesh at the skeleton's rest pose and compare with its own points.

    At rest the skinning transform is jointWorld * inverse(bind) == identity for every joint, so a
    correct rig moves nothing. Any drift means the bind transforms and the vertex space disagree.
    """
    stage = Usd.Stage.Open(path)
    cache = UsdSkel.Cache()
    root = UsdSkel.Root.Get(stage, "/Mesh")
    if not root:
        return None
    cache.Populate(root, Usd.TraverseInstanceProxies())
    worst = 0.0
    n = 0
    for binding in cache.ComputeSkelBindings(root, Usd.TraverseInstanceProxies()):
        skel_q = cache.GetSkelQuery(binding.GetSkeleton())
        xforms = skel_q.ComputeSkinningTransforms(Usd.TimeCode.Default())
        if xforms is None:
            continue
        for sq in binding.GetSkinningTargets():
            mesh = UsdGeom.Mesh(sq.GetPrim())
            pts = mesh.GetPointsAttr().Get()
            if not pts:
                continue
            work = Vt.Vec3fArray(list(pts))
            if not sq.ComputeSkinnedPoints(xforms, work, Usd.TimeCode.Default()):
                continue
            a = np.array(pts, dtype=np.float64)
            b = np.array(work, dtype=np.float64)
            worst = max(worst, float(np.abs(a - b).max()))
            n += 1
    return worst, n


def main():
    work = sys.argv[1]
    usd_dir = os.path.join(work, "usd")
    out_dir = os.path.join(work, "out")
    os.makedirs(usd_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    dumps = [SK.load_dump(p) for p in sorted(glob.glob(os.path.join(work, "skel", "*.json")))]
    names = {}
    nm = os.path.join(work, "names.json")
    if os.path.exists(nm):
        names = json.load(open(nm))

    manifest = {}
    rows = []
    res_ok = res_tot = ck_ok = ck_tot = 0

    for f in sorted(glob.glob(os.path.join(work, "res", "*.bin"))):
        base = os.path.basename(f)[:-4]
        raw = open(f, "rb").read()
        ms = MS.MeshSet.parse(raw)
        chunks = chunks_for(ms, os.path.join(work, "chunks"))

        # Pick the skeleton that accounts for the most of this mesh's bone-name hashes, and only
        # if it accounts for ANY. Accepting a zero-match skeleton looked fine -- the bytes still
        # round-tripped, because the palette is applied on the way out and undone on the way in --
        # but the rig written into the USD named the wrong bones entirely. (Measured before the
        # guard: 408 of 535 meshes were handed a skeleton that resolved 0 of their hashes.)
        best, best_dump = (0, 0, []), None
        for d in dumps:
            m, t, bad = SK.resolve(ms, d)
            if t and m > best[0]:
                best, best_dump = (m, t, bad), d
        if best_dump is None:
            best = (0, sum(len(SK.lod_bones(l)) for l in ms.lods), [])

        usd_path = os.path.join(usd_dir, base + ".usda")
        if os.path.exists(usd_path):
            os.remove(usd_path)
        bf3_usd.export(ms, chunks, usd_path, skeleton=best_dump)

        back, back_chunks = bf3_usd.load(usd_path)
        payload, meta = back.serialize()

        res_tot += 1
        same_res = payload == raw
        res_ok += same_res

        ck_same = 0
        for i, c in chunks.items():
            ck_tot += 1
            if back_chunks.get(i) == c:
                ck_ok += 1
                ck_same += 1

        rig_ok, rig_note = check_rig(usd_path, ms)
        rest = check_rest_skinning(usd_path)

        cand = os.path.join(out_dir, base + ".bin")
        open(cand, "wb").write(payload)
        # The 16-byte resource meta rides in a sidecar compare_resource looks for. Without it the
        # verdict reads metaIdentical=false, which is not "the meta is wrong" but "no meta was
        # asserted" -- and the meta is what tells the engine where the relocation table starts.
        open(cand + ".meta", "wb").write(meta)
        if base in names:
            manifest[names[base]] = cand

        rows.append(dict(name=names.get(base, base), resourceIdentical=same_res,
                         chunks="%d/%d" % (ck_same, len(chunks)),
                         boneHashes="%d/%d" % (best[0], best[1]),
                         skeleton=(best_dump or {}).get("partition"),
                         rig=rig_note if rig_ok else "FAIL: " + rig_note,
                         restSkinDrift=(None if rest is None else rest[0]),
                         restSkinMeshes=(None if rest is None else rest[1]),
                         mismatches=best[2][:4]))

    json.dump(manifest, open(os.path.join(work, "compare_manifest.json"), "w"), indent=1)
    for r in rows:
        print(json.dumps(r))
    resolved = sum(1 for r in rows if r["skeleton"])
    full = sum(1 for r in rows if r["boneHashes"].split("/")[0] == r["boneHashes"].split("/")[1]
               and r["boneHashes"] != "0/0")
    drift = max((r["restSkinDrift"] or 0.0) for r in rows) if rows else 0.0
    print("\nskeleton identified     : %d / %d" % (resolved, len(rows)))
    print("all bone hashes resolved: %d / %d" % (full, len(rows)))
    print("worst rest-pose skin drift: %g" % drift)
    print("resource byte-identical : %d / %d" % (res_ok, res_tot))
    print("chunk    byte-identical : %d / %d" % (ck_ok, ck_tot))
    print("manifest written        : %s (%d entries)"
          % (os.path.join(work, "compare_manifest.json"), len(manifest)))


if __name__ == "__main__":
    main()
