#!/usr/bin/env python3
"""Round-trip verifier: BF3 -> USD -> BF3, byte-compared.

Takes a directory of MeshSet resource payloads (and optionally their geometry
chunks) dumped out of the game with Rime, and checks that parsing, exporting to
USD, reading back and re-serializing reproduces the original bytes exactly.

  tools/usd/dump_corpus.sh /tmp/bf3corpus 1200      # dump resources + chunks
  tools/usd/roundtrip_test.py /tmp/bf3corpus

Exit status is non-zero if anything failed to reproduce.
"""

import glob
import os
import sys
import tempfile
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meshset import MeshSet          # noqa: E402


def main(corpus, with_usd=True):
    res_dir = os.path.join(corpus, "res")
    chunk_dir = os.path.join(corpus, "chunks")
    files = sorted(glob.glob(os.path.join(res_dir, "*.bin")))
    if not files:
        print("no resources in %s" % res_dir)
        return 1

    n = ok_res = ok_usd = 0
    n_chunks = ok_chunks = 0
    fails = []
    tmp = tempfile.mkdtemp()
    bf3_usd = None
    if with_usd:
        import bf3_usd as _u
        bf3_usd = _u

    for f in files:
        data = open(f, "rb").read()
        if not data:
            continue
        n += 1
        name = os.path.basename(f)
        try:
            ms = MeshSet.parse(data)
            out, meta = ms.serialize()
        except Exception as e:                       # noqa: BLE001
            fails.append((name, "parse/serialize: %s" % e))
            continue

        import struct
        f0, f1, f2, f3 = struct.unpack("<IIII", meta)
        if out != data:
            fails.append((name, "resource not reproduced"))
        elif f0 + f1 + f2 != len(data) or f3 != 0x00940070:
            fails.append((name, "meta invariant violated"))
        else:
            ok_res += 1

        if not bf3_usd:
            continue
        chunks = {}
        for i, lod in enumerate(ms.lods):
            p = os.path.join(chunk_dir, "%s.chunk" % uuid.UUID(bytes_le=lod.data_chunk_id))
            if os.path.exists(p):
                chunks[i] = open(p, "rb").read()
        usd = os.path.join(tmp, name + ".usda")
        try:
            bf3_usd.export(ms, chunks, usd)
            ms2, ch2 = bf3_usd.load(usd)
            res2, _ = ms2.serialize()
        except Exception as e:                       # noqa: BLE001
            fails.append((name, "usd: %s" % e))
            continue
        if res2 == data:
            ok_usd += 1
        else:
            fails.append((name, "resource differs after USD"))
        for i, c in chunks.items():
            n_chunks += 1
            if ch2.get(i) == c:
                ok_chunks += 1
            else:
                fails.append((name, "chunk lod%d differs after USD" % i))
        os.remove(usd)

    print("MeshSet parse -> serialize, byte-identical : %d / %d" % (ok_res, n))
    if bf3_usd:
        print("BF3 -> USD -> BF3, resource identical      : %d / %d" % (ok_usd, n))
        print("BF3 -> USD -> BF3, chunk identical         : %d / %d" % (ok_chunks, n_chunks))
    if fails:
        print("\n%d failure(s):" % len(fails))
        for a, b in fails[:25]:
            print("  %-40s %s" % (a, b))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/bf3corpus",
                  "--no-usd" not in sys.argv))
