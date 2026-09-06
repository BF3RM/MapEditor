#!/usr/bin/env python3
"""Look a Frostbite name hash up in bf3_name_hashes.tsv[.gz].

    python3 resolve.py 0x3A14AD1E 1000817354 -1000817354 3A14AD1E

Accepts hex (with or without 0x), unsigned decimal and the SIGNED int32 form the WebUI hash JSONs
use, because the same value is written all three ways across this project and guessing wrong is
how you conclude a hash is unknown when it is in the table.

Prints one line per candidate name with the function it is under (quick / lower / both) and the
sources the name came from. More than one line means a real 32-bit collision -- 17 hashes in BF3
have two names -- and the caller has to pick, so they are all printed rather than one chosen.
"""

import gzip
import os
import sys


def load(path):
    opener = gzip.open if path.endswith(".gz") else open

    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("#"):
                continue

            parts = line.rstrip("\n").split("\t")

            if len(parts) == 4:
                yield int(parts[0], 16), parts[1], parts[2], parts[3]


def parse(token):
    token = token.strip()

    if token.lower().startswith("0x"):
        return int(token, 16) & 0xFFFFFFFF

    if token.lstrip("-").isdigit():
        return int(token) & 0xFFFFFFFF

    return int(token, 16) & 0xFFFFFFFF


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    here = os.path.dirname(os.path.abspath(__file__))
    table = None

    for candidate in ("bf3_name_hashes.tsv.gz", "bf3_name_hashes.tsv"):
        if os.path.exists(os.path.join(here, candidate)):
            table = os.path.join(here, candidate)
            break

    if table is None:
        print("no bf3_name_hashes.tsv[.gz] beside %s -- run build_hash_table.py" % here,
              file=sys.stderr)
        return 2

    wanted = {parse(a) for a in sys.argv[1:]}
    found = set()

    for value, fn, name, sources in load(table):
        if value in wanted:
            found.add(value)
            print("%08X\t%s\t%s\t%s" % (value, fn, name, sources))

    for value in sorted(wanted - found):
        print("%08X\t-\t<not a name BF3 contains>\t-" % value)

    return 0


if __name__ == "__main__":
    sys.exit(main())
