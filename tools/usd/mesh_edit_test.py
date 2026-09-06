#!/usr/bin/env python3
"""An EDITED mesh must ship; an UNEDITED one must still be referenced. Both halves, on real bytes.

    tools/usd/mesh_edit_test.py [corpus dir]        (default /tmp/bf3corpus)

`roundtrip_test.py` already proves BF3 -> USD -> BF3 reproduces the resource and the chunk. It does
NOT prove the emitter can tell the two cases apart, and that is the whole of "embed if edited,
reference if not". The gap it left was real and is what this test was written against:

  the MeshSet resource does not describe the geometry. Positions, normals, UVs and tangents are all
  in the CHUNK, and the payload changes only when a count or the bounding box changes. So the
  emitter's `payload == original` called a retextured or re-normalled mesh untouched, referenced
  the game's geometry over the top of it, and the edit vanished with nothing reported.

Three ways to be wrong, all asserted against rather than assumed:

  * a test that references everything passes while every edit is lost   -> the EDITED half
  * a test that ships everything passes while the bundle carries DICE's -> the UNEDITED half
  * a test that compares nothing passes on an empty mesh                -> the CONTENT guards

The decision itself is imported from `level_to_bf3.is_referenced`, so what is measured is the rule
the emitter runs, not a restatement of it.
"""
import glob
import itertools
import os
import sys
import uuid

from pxr import Usd, UsdGeom

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bf3_usd                                                          # noqa: E402
import level_to_bf3                                                     # noqa: E402
from meshset import MeshSet                                             # noqa: E402

_SEQ = itertools.count()


def first_diff(a, b):
    """Byte offset of the first difference, or None. Numbers, not adjectives."""
    if a == b:
        return None

    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            return i

    return min(len(a), len(b))          # one is a prefix of the other


def cases(corpus):
    """(name, resource bytes, {lod: chunk bytes}) for every corpus mesh whose chunks are ALL here.

    A mesh missing one LOD's chunk cannot be byte-compared -- the rebuild would be measured against
    geometry that was never loaded -- so it is skipped rather than counted as a pass.
    """
    have = {os.path.basename(p)[:-len(".chunk")]
            for p in glob.glob(os.path.join(corpus, "chunks", "*.chunk"))}
    out = []

    for path in sorted(glob.glob(os.path.join(corpus, "res", "*.bin"))):
        if not os.path.getsize(path):
            continue

        data = open(path, "rb").read()

        try:
            ms = MeshSet.parse(data)
        except Exception:                                    # noqa: BLE001
            continue

        if not ms.lods:
            continue

        guids = [str(uuid.UUID(bytes_le=lod.data_chunk_id)) for lod in ms.lods]

        if not all(g in have for g in guids):
            continue

        chunks = {i: open(os.path.join(corpus, "chunks", g + ".chunk"), "rb").read()
                  for i, g in enumerate(guids)}
        out.append((ms.name or os.path.basename(path), data, chunks))

    return out


def _export(data, chunks):
    """A fresh stage each time: USD caches layers by identifier, so reusing one path silently
    hands back the PREVIOUS stage and every edit after the first measures the wrong file."""
    path = "/tmp/mesh_edit_%d_%d.usda" % (os.getpid(), next(_SEQ))
    bf3_usd.export(MeshSet.parse(data), chunks, path)
    return path


def _edit_uv(path):
    """Nudge one UV. Chosen because it is the edit the old rule could not see: it changes the
    chunk and leaves the resource -- counts, bbox, every field -- byte-identical.

    -> True if the stage had a UV to move.
    """
    stage = Usd.Stage.Open(path)
    prim = stage.GetPrimAtPath("/Mesh/LOD0/subset0")
    pv = UsdGeom.PrimvarsAPI(UsdGeom.Mesh(prim)).GetPrimvar("st")

    if not (pv and pv.HasValue()):
        return False

    v = list(pv.Get())
    v[0] = (v[0][0] + 0.25, v[0][1])
    pv.Set(v)
    stage.GetRootLayer().Save()
    return True


def _content(ms, chunks):
    """Non-zero AND correct. A mesh that came back with no subsets, no vertices or no geometry
    round-trips perfectly and means nothing, and every other trap in this project has been some
    version of that."""
    subsets = sum(len(l.subsets) for l in ms.lods)
    verts = sum(s.vertex_count for l in ms.lods for s in l.subsets)
    tris = sum(s.primitive_count for l in ms.lods for s in l.subsets)

    if subsets == 0 or verts == 0 or tris == 0:
        return "empty (subsets=%d verts=%d tris=%d)" % (subsets, verts, tris)

    # The header's own count, not a recount of the same list -- an independent statement of the
    # same fact, which is what makes this a check rather than a tautology.
    if ms.total_subset_count != subsets:
        return "TotalSubsetCount %d against %d subsets" % (ms.total_subset_count, subsets)

    for li, lod in enumerate(ms.lods):
        if li not in chunks:
            continue

        want = lod.vertex_data_size + lod.index_data_size

        if len(chunks[li]) < want:
            return "LOD%d chunk %d bytes for %d declared" % (li, len(chunks[li]), want)

    return None


def main(corpus="/tmp/bf3corpus"):
    todo = cases(corpus)

    if not todo:
        print("FAIL no corpus mesh has all of its chunks under %s "
              "(run tools/usd/dump_corpus.sh)" % corpus)
        return 1

    print("corpus       %d mesh(es) with every LOD chunk present" % len(todo))

    ref_ok = ship_ok = refused = 0
    res_exact = chunk_exact = 0
    bad = []

    for name, original, chunks in todo:
        # ---- UNEDITED: must rebuild to the game's bytes, and must be REFERENCED ----
        path = _export(original, chunks)
        ms, back = bf3_usd.load(path)
        payload, meta = ms.serialize()

        off = first_diff(payload, original)

        if off is None:
            res_exact += 1
        else:
            bad.append("%s: resource differs at byte %d of %d" % (name, off, len(original)))

        chunk_bad = False

        for li, want in sorted(chunks.items()):
            coff = first_diff(back.get(li, b""), want)

            if coff is not None:
                chunk_bad = True
                bad.append("%s: LOD%d chunk differs at byte %d of %d"
                           % (name, li, coff, len(want)))

        if not chunk_bad:
            chunk_exact += 1

        problem = _content(ms, back)

        if problem:
            bad.append("%s: %s" % (name, problem))

        geom_ok = bf3_usd.unedited_geometry(path, back)

        if geom_ok is not True:
            bad.append("%s: unedited stage reports geom_ok=%r" % (name, geom_ok))

        if level_to_bf3.is_referenced(payload, original, geom_ok):
            ref_ok += 1
        else:
            bad.append("%s: UNEDITED mesh would be SHIPPED -- the bundle would carry DICE's bytes"
                       % name)

        # ---- EDITED: a UV nudge must be seen, and must SHIP ----
        path2 = _export(original, chunks)

        if not _edit_uv(path2):
            continue                    # no UV on this mesh; the unedited half still counted

        try:
            ms2, back2 = bf3_usd.load(path2)
        except ValueError as exc:
            # A mesh whose subsets ALIAS one vertex block cannot represent an edit to just one of
            # them. Refusing it is the correct outcome and the point of the guard -- what must
            # never happen is the edit being dropped and the mesh referenced anyway.
            if "aliases vertex bytes" not in str(exc):
                bad.append("%s: %s" % (name, exc))
            else:
                refused += 1
            continue

        payload2, meta2 = ms2.serialize()

        geom2 = bf3_usd.unedited_geometry(path2, back2)

        if geom2 is not False:
            bad.append("%s: UV edit reports geom_ok=%r -- the edit is invisible" % (name, geom2))

        if back2.get(0) == chunks.get(0):
            bad.append("%s: UV edit did not change the chunk; the edit never reached the codec"
                       % name)

        if level_to_bf3.is_referenced(payload2, original, geom2):
            bad.append("%s: EDITED mesh would be REFERENCED -- the edit is silently dropped" % name)
        else:
            ship_ok += 1

        # The resource the game is handed has to be one it can relocate: the 16-byte meta says
        # where the struct block ends, how big the inline block is and how long the relocation
        # table is, and f0+f1+f2 must account for every byte or the engine relocates past the end.
        f0, f1, f2 = (int.from_bytes(meta2[i:i + 4], "little") for i in (0, 4, 8))

        if f0 + f1 + f2 != len(payload2):
            bad.append("%s: edited meta %d+%d+%d != payload %d"
                       % (name, f0, f1, f2, len(payload2)))

        # A UV edit moves no vertex and adds none, so the resource must be UNCHANGED. If it is
        # not, the emitter is shipping a resource that disagrees with the game's -- which is how
        # this class of bug hides.
        if payload2 != original:
            bad.append("%s: UV edit changed the resource at byte %s"
                       % (name, first_diff(payload2, original)))

        problem = _content(ms2, back2)

        if problem:
            bad.append("%s: edited %s" % (name, problem))

    print("unedited     %d/%d resource byte-identical to the game" % (res_exact, len(todo)))
    print("unedited     %d/%d chunk byte-identical to the game" % (chunk_exact, len(todo)))
    print("unedited     %d/%d REFERENCED (the game supplies the geometry)" % (ref_ok, len(todo)))
    print("uv edit      %d/%d SHIPPED (the edit reaches the bundle)" % (ship_ok, len(todo)))
    print("uv edit      %d REFUSED (subsets alias one vertex block; loud, not dropped)" % refused)

    # Guard on content, never on the verdict: a run that compared nothing would print four zeroes
    # and no failures.
    if ref_ok == 0 or ship_ok == 0:
        bad.append("nothing was measured: referenced=%d shipped=%d" % (ref_ok, ship_ok))

    for line in bad[:40]:
        print("  FAIL " + line)

    if len(bad) > 40:
        print("  ... %d more" % (len(bad) - 40))

    print("RESULT " + ("PASS" if not bad else "FAIL (%d)" % len(bad)))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
