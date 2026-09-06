#!/usr/bin/env python3
"""Run the rebuild round trip over many shipped resources and aggregate.

    tools/havok/rebuild_sweep.py <dir-of-dumped-resources> [limit]

One resource proves the writer can be right about one resource. This says how often, over what, and
exactly which classes it still cannot produce -- so the gap is a list of names and counts rather
than a percentage.
"""
import io
import json
import os
import random
import sys
import collections
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import rebuild_roundtrip_test as rt                                     # noqa: E402


def main(directory, limit):
    files = sorted(f for f in os.listdir(directory) if f.endswith(".bin"))
    random.Random(20260906).shuffle(files)
    files = files[:limit]

    ok = fail = skip = degraded = padded = 0
    exact = 0
    objects_game = objects_built = 0
    missing = collections.Counter()
    extra = collections.Counter()
    placements = values = 0
    failures = []

    for i, name in enumerate(files):
        path = os.path.join(directory, name)
        buf = io.StringIO()

        try:
            with contextlib.redirect_stdout(buf):
                code = rt.main(path)
        except Exception as e:                                          # noqa: BLE001
            fail += 1
            failures.append("%s: %s: %s" % (name, type(e).__name__, e))
            continue

        text = buf.getvalue()

        if "SKIP" in text:
            skip += 1
            continue

        if "degraded " in text:
            degraded += 1

        if "1 placement(s)" in text.splitlines()[0]:
            padded += 1

        if code != 0:
            fail += 1
            failures.append("%s\n%s" % (name, text.strip()))
            continue

        ok += 1

        # Re-read the two censuses from the decoded JSON the test already wrote.
        src = json.load(open(path + ".json"))
        built = json.load(open("/tmp/rebuilt_collision.bin.json"))
        objects_game += src["objects32"]
        objects_built += built["objects32"]
        placements += len(src["shapes"])

        for k in set(src["census"]) | set(built["census"]):
            # A reader artefact, not an object: the virtual-fixup region is divided by the 12-byte
            # record size and its 0xFF alignment padding reads as one more record.
            if k == "<unnamed>":
                continue

            d = src["census"].get(k, 0) - built["census"].get(k, 0)

            if d > 0:
                missing[k] += d
            elif d < 0:
                extra[k] += -d

        if src["objects32"] == built["objects32"]:
            exact += 1

        for line in text.splitlines():
            if line.startswith("round trip"):
                values += int(line.split()[2])

    print("swept        %d resource(s): %d round-tripped, %d skipped (a class the builder has no "
          "form for), %d failed" % (len(files), ok, skip, fail))
    print("degraded     %d rebuilt without their MOPP; %d padded from one shape to two" % (degraded, padded))
    print("objects      %d built against %d in the game (%.1f%%); %d of %d resources match exactly"
          % (objects_built, objects_game, 100.0 * objects_built / max(objects_game, 1), exact, ok))
    print("round trip   %d placement(s), %d value(s) compared, 0 changed" % (placements, values))
    print("still missing, by class:")

    for k, v in missing.most_common():
        print("   %8d  %s" % (v, k))

    if extra:
        print("emitted and NOT in the game, by class:")

        for k, v in extra.most_common():
            print("   %8d  %s" % (v, k))

    for f in failures[:5]:
        print("  FAIL %s" % f)

    if ok == 0 or placements == 0:
        print("RESULT       NOTHING TESTED")
        return 1

    print("RESULT       %s" % ("PASS" if fail == 0 else "FAIL"))

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 200))
