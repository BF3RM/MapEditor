#!/usr/bin/env python3
"""Take a level's Enlighten bake through USD, EDIT it there, and emit it for a bundle build.

    tools/usd/enlighten_inject_test.py <enlighten.json> <out_dir> [--rename levels/mp_001/=levels/realitymod/]

`enlighten_roundtrip_test.py` proves the bake survives USD unchanged (162/162 on mp_001, 0 changed).
That is a different claim from this one. Here the payload is CHANGED in the stage -- one material
colour in the `EnlightenShaderDatabase` -- and every resource is written out as a file plus the
`add_resource` line that puts it into a bundle, meta included. The edit is what makes the run
falsifiable: if the writer silently handed back the source bytes, the "changed" count would be 0 and
this refuses.

Guards, in the order they run, all on CONTENT rather than on a verdict:

1. the dump holds resources at all, and USD authored the same number,
2. every resource reads back with a payload,
3. exactly ONE payload differs from the source, by exactly the 12 bytes of one Vec3,
4. that resource's first material colour decodes to the value asked for,
5. every OTHER payload is byte-identical to the game's,
6. every resource has a meta, because a bundle entry without one cannot be read back.

The stage is written to disk and REOPENED before the readback, so what is measured is a USD file
and not a Python object that never left memory.
"""
import base64
import json
import os
import struct
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import enlighten

# The edit. An EnlightenShaderDatabase is a count followed by 37 bytes per material -- colour (3
# floats), guid (16 bytes), shader id (8), emissive (1) -- so the first material's colour is at
# offset 4 and is the smallest edit that a reader can be asked to confirm.
EDIT_COLOUR = (0.125, 0.25, 0.375)
COLOUR_OFFSET = 4
MATERIAL_STRIDE = 37


def sanitise(name):
    return name.replace("/", "_").replace(":", "_")


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2

    dump_path, out_dir = argv[1], argv[2]
    rename = None

    for arg in argv[3:]:
        if arg.startswith("--rename"):
            rename = arg.split("=", 1)[1] if "=" in arg else None

    src_from, src_to = (rename.split("=", 1) if rename and "=" in rename
                        else (rename.split("=")[0], "") if rename else (None, None))

    doc = json.load(open(dump_path))
    src = [r for r in (doc.get("resources") or []) if r.get("payload")]

    if not src:
        print("FAIL         the dump holds no Enlighten resources at all")
        return 1

    os.makedirs(out_dir, exist_ok=True)
    stage_path = os.path.join(out_dir, "enlighten.usda")
    stage = Usd.Stage.CreateNew(stage_path) if not os.path.exists(stage_path) \
        else Usd.Stage.Open(stage_path)
    made = enlighten.author(stage, doc)
    authored = sum(made.values())

    print("level        %s" % doc.get("level"))
    print("source       %d resource(s), %d payload byte(s)" % (len(src), doc.get("payloadBytes", 0)))
    print("authored     %d resource(s), %s" % (authored, {k: v for k, v in made.items() if v}))

    if authored != len(src):
        print("FAIL         authored %d of %d" % (authored, len(src)))
        return 1

    # THE EDIT, made in USD on the stage's own attribute -- not on the JSON and not on a file.
    target = None

    for prim in stage.Traverse():
        kind = prim.GetAttribute(enlighten.BF3 + ":kind")

        if kind and kind.IsValid() and kind.Get() == "EnlightenShaderDatabase":
            target = prim
            break

    if target is None:
        print("FAIL         the level ships no EnlightenShaderDatabase to edit")
        return 1

    attr = target.GetAttribute(enlighten.BF3 + ":payload")
    edited = bytearray(base64.b64decode(attr.Get()))
    count = struct.unpack_from("<I", edited, 0)[0]

    if 4 + count * MATERIAL_STRIDE != len(edited):
        print("FAIL         shader database is %d bytes, not 4 + %d * %d"
              % (len(edited), count, MATERIAL_STRIDE))
        return 1

    before = struct.unpack_from("<3f", edited, COLOUR_OFFSET)
    struct.pack_into("<3f", edited, COLOUR_OFFSET, *EDIT_COLOUR)
    attr.Set(base64.b64encode(bytes(edited)).decode("ascii"))
    edited_name = target.GetAttribute(enlighten.BF3 + ":resource").Get()

    print("edit         %s" % edited_name)
    print("             %d material(s); material 0 colour %s -> %s"
          % (count, tuple(round(v, 4) for v in before), EDIT_COLOUR))

    stage.GetRootLayer().Save()

    # REOPEN. Anything that only lived in memory does not survive this.
    stage = Usd.Stage.Open(stage_path)
    back = enlighten.read_back(stage)

    if len(back) != len(src):
        print("FAIL         read back %d of %d" % (len(back), len(src)))
        return 1

    by_name = {r["name"]: r for r in src}
    changed, identical, no_meta, mismatched = [], 0, [], []
    total = 0
    lines, files = [], {}

    for entry in back:
        name = entry["name"]
        payload = enlighten.payload_bytes(entry)
        total += len(payload)
        origin = by_name.get(name)

        if origin is None:
            print("FAIL         read back a resource the dump does not have: %s" % name)
            return 1

        if payload != base64.b64decode(origin["payload"]):
            diff = [i for i in range(min(len(payload), len(base64.b64decode(origin["payload"]))))
                    if payload[i] != base64.b64decode(origin["payload"])[i]]
            changed.append((name, len(diff), diff[0] if diff else -1, diff[-1] if diff else -1))
        else:
            identical += 1

        if not entry.get("meta"):
            no_meta.append(name)

        out_name = sanitise(name) + ".bin"
        open(os.path.join(out_dir, out_name), "wb").write(payload)
        files[name] = out_name
        built = name

        if src_from and name.startswith(src_from):
            built = src_to + name[len(src_from):]

        lines.append('add_resource %s %s "%s" %s'
                     % (built, entry["type"], os.path.join(out_dir, out_name), entry["meta"]))

    print("readback     %d resource(s), %d payload byte(s)" % (len(back), total))
    print("identical    %d of %d" % (identical, len(back)))
    print("changed      %d: %s" % (len(changed), changed))
    print("meta         %d of %d carry one" % (len(back) - len(no_meta), len(back)))

    if len(changed) != 1:
        print("FAIL         expected exactly 1 changed payload, got %d" % len(changed))
        return 1

    name, ndiff, first, last = changed[0]

    if name != edited_name or ndiff != 12 or first != COLOUR_OFFSET:
        print("FAIL         the change is not the edit: %s" % (changed[0],))
        return 1

    got = struct.unpack_from("<3f", open(os.path.join(out_dir, files[name]), "rb").read(),
                             COLOUR_OFFSET)

    if got != EDIT_COLOUR:
        print("FAIL         the emitted file decodes to %s, not %s" % (got, EDIT_COLOUR))
        return 1

    if no_meta:
        print("FAIL         %d resource(s) carry no meta: %s" % (len(no_meta), no_meta[:5]))
        return 1

    cmds = os.path.join(out_dir, "enlighten.cmds")
    open(cmds, "w").write("\n".join(lines) + "\n")
    print("emitted      %d file(s) + %s" % (len(files), cmds))
    print("verified     material 0 colour reads back %s from the emitted bytes" % (got,))
    print("RESULT       PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
