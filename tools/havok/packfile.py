#!/usr/bin/env python3
"""Read the Havok packfiles BF3 stores as HavokPhysicsData resources.

Layout, established by measurement against shipped resources:

    [0, 128)   Frostbite wrapper -- "HavokPhysicsContainer"
    128        first Havok packfile   (magic 0x57E0E057 / 0x10C0C010)
    ...        FURTHER packfiles, back to back

That last point is the one that made the format look inconsistent: a resource holds SEVERAL
packfiles. CharacterCollision_01_Physics_0 has magics at 128 and 1664, and the first packfile's
sections end at exactly 128 + 448 + 1088 = 1664 -- so nothing is missing, the file simply
continues with another packfile.

Within a packfile:

    header   64 bytes -- magic, version, layout rules, section count, contents version
    table    one 48-byte entry per section:
                 char tag[19]; byte nullByte(0xFF); int32 absolute, local, global,
                 virtual, exports, imports, end
             `absolute` is the section start relative to the packfile base and `end` its
             length -- verified by __classnames__ abs=208 (exactly the table end) + end=240
             landing on 448, which is __types__'s abs.
    sections __classnames__, __types__, __data__ at those offsets

Sections are carried verbatim, so a parse/serialise round trip is byte-exact without needing to
interpret the fixup tables -- the same discipline the MeshSet codec uses.
"""
import struct
from dataclasses import dataclass, field
from typing import List

MAGIC = struct.pack("<II", 0x57E0E057, 0x10C0C010)
HEADER = 64
ENTRY = 48


@dataclass
class Section:
    tag: str
    null_byte: int
    absolute: int
    fields: tuple            # local, global, virtual, exports, imports, end
    data: bytes

    @property
    def length(self):
        return self.fields[-1]


@dataclass
class Packfile:
    raw: bytes
    file_version: int
    layout: bytes
    contents_version: str
    contents_section_index: int
    contents_section_offset: int
    class_name_section_index: int
    class_name_section_offset: int
    sections: List[Section] = field(default_factory=list)

    @staticmethod
    def parse(blob: bytes, base: int, limit: int) -> "Packfile":
        user_tag, file_version = struct.unpack_from("<ii", blob, base + 8)
        layout = blob[base + 16:base + 20]
        n, csi, cso = struct.unpack_from("<iii", blob, base + 20)
        cnsi, cnso = struct.unpack_from("<ii", blob, base + 32)
        version = blob[base + 40:base + 56].split(b"\0")[0].decode("latin1")

        pf = Packfile(raw=blob[base:limit], file_version=file_version, layout=layout,
                      contents_version=version, contents_section_index=csi,
                      contents_section_offset=cso, class_name_section_index=cnsi,
                      class_name_section_offset=cnso)

        table = base + HEADER

        for i in range(n):
            o = table + i * ENTRY
            tag = blob[o:o + 19].split(b"\0")[0].decode("latin1")
            null_byte = blob[o + 19]
            vals = struct.unpack_from("<7i", blob, o + 20)
            absolute, rest = vals[0], vals[1:]
            start = base + absolute
            pf.sections.append(Section(tag, null_byte, absolute, rest,
                                       blob[start:start + rest[-1]]))

        return pf


@dataclass
class Container:
    """A HavokPhysicsData resource: a Frostbite wrapper plus one or more packfiles."""
    wrapper: bytes
    packfiles: List[Packfile]

    @staticmethod
    def parse(blob: bytes) -> "Container":
        offsets = []
        i = blob.find(MAGIC)

        while i >= 0:
            offsets.append(i)
            i = blob.find(MAGIC, i + 4)

        if not offsets:
            raise ValueError("no Havok packfile in this resource")

        bounds = offsets + [len(blob)]
        return Container(wrapper=blob[:offsets[0]],
                         packfiles=[Packfile.parse(blob, bounds[k], bounds[k + 1])
                                    for k in range(len(offsets))])

    def serialize(self) -> bytes:
        return self.wrapper + b"".join(p.raw for p in self.packfiles)


if __name__ == "__main__":
    import sys

    for path in sys.argv[1:]:
        raw = open(path, "rb").read()
        c = Container.parse(raw)
        out = c.serialize()
        print("%s  %d bytes  wrapper=%d  packfiles=%d"
              % (path.split("/")[-1], len(raw), len(c.wrapper), len(c.packfiles)))

        for k, pf in enumerate(c.packfiles):
            print("  packfile %d  %s  layout=%s  %d bytes"
                  % (k, pf.contents_version, list(pf.layout), len(pf.raw)))

            for s in pf.sections:
                print("     %-15s abs=%-5d len=%-5d data=%d"
                      % (s.tag, s.absolute, s.length, len(s.data)))

        print("  ROUND TRIP: %s\n" % ("BYTE-IDENTICAL" if out == raw else "MISMATCH"))
