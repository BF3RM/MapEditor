#!/usr/bin/env python3
"""A reverse table for Frostbite name hashes, built only from names BF3 itself contains.

fb::hashQuick is a 32-bit FNV variant (basis 0x1505, prime 0x21) and fb::hashQuickLowerCase is the
same function over the lowercased string. Both are one-way, so every public BF3 hash list is a
DICTIONARY ATTACK: someone guessed a name, hashed it, and published the pair if it matched
something they had seen. Guesses that never matched anything still ship in those lists, and a
wrong name in a hash table is worse than a missing one because nothing downstream can tell.

This does the opposite. Rime's `dump_name_sources` walks a full BF3 mount and writes out every
string the game itself stores -- partition and resource names, bundle and superbundle names, the
type/field name table and the value string table of all 73,371 EBX partitions, and the object,
joint and DOF-slot names inside the Ant animation banks. Hashing those cannot produce an entry
BF3 does not contain. There is nothing to guess and nothing to be wrong about; the only questions
left are COVERAGE (which hashes the table fails to resolve) and COLLISIONS (one hash, two real
names), and both are reported as numbers rather than assumed away.

Usage:
    dump the sources once, from a full mount:
        mount_game "<BF3 path>" Frostbite2_0 true
        select_game 1
        dump_name_sources /tmp/bf3_names 0

    then:
        python3 build_hash_table.py /tmp/bf3_names --out <dir>

Outputs, in --out:
    bf3_name_hashes.tsv             hash <tab> fn <tab> name <tab> sources, sorted by hash
    bf3_name_hash_collisions.tsv    every hash that two or more distinct names produce
    bf3_name_hashes_summary.json    per-source counts, collisions, ground-truth results

The `fn` column says WHICH hash function produces that hash for that name:
    quick  only fb::hashQuick          (the name has upper case, and this is its cased hash)
    lower  only fb::hashQuickLowerCase (the name has upper case, and this is its lowercased hash)
    both   the two agree               (the name is already lowercase)
A lookup for a hashQuickLowerCase value must therefore accept rows marked `lower` or `both`.
"""

import argparse
import gzip
import json
import os
import struct
import sys
from collections import defaultdict

FNV_BASIS = 0x1505
FNV_PRIME = 0x21

# file -> short source tag written into the table's `sources` column.
NAME_SOURCES = [
    ("superbundles.txt", "superbundle"),
    ("bundles.txt", "bundle"),
    ("partitions.txt", "partition"),
    ("dbx_partitions.txt", "dbx"),
    ("resources.txt", "resource"),
    ("ebx_type_strings.txt", "ebxtype"),
    ("ebx_value_strings.txt", "ebxstring"),
    ("ant_names.txt", "ant"),
]

_ASCII_LOWER = bytes.maketrans(bytes(range(65, 91)), bytes(range(97, 123)))


def hash_quick(name):
    """fb::hashQuick.

    RimeLib's HashQuick walks C# `char`s, i.e. UTF-16 code units, not bytes. For an ASCII name the
    two are the same and the byte path is several times faster, which matters at ~200k names; a
    non-ASCII name takes the exact path so the value still matches the engine's.
    """
    raw = name.encode("utf-8")

    if len(raw) != len(name):
        wide = name.encode("utf-16-le")
        units = struct.unpack("<%dH" % (len(wide) // 2), wide)
    else:
        units = raw

    h = FNV_BASIS

    for unit in units:
        h = ((h * FNV_PRIME) & 0xFFFFFFFF) ^ unit

    return h


def invariant_lower(name):
    """.NET ToLowerInvariant, for the ASCII case exactly and for the rest as closely as Python gets.

    Every BF3 name measured so far is ASCII; `non_ascii_names` in the summary is the number that
    are not, so the size of the caveat is visible rather than argued about.
    """
    raw = name.encode("utf-8")

    if len(raw) == len(name):
        return raw.translate(_ASCII_LOWER).decode("ascii")

    return name.lower()


def unescape(line):
    """Undo DumpNameSourcesCommand.Escape. Localisation strings carry newlines and tabs."""
    if "\\" not in line:
        return line

    out = []
    i = 0

    while i < len(line):
        c = line[i]

        if c == "\\" and i + 1 < len(line):
            n = line[i + 1]
            out.append({"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}.get(n, "\\" + n))
            i += 2 if n in "nrt\\" else 2
        else:
            out.append(c)
            i += 1

    return "".join(out)


def escape(value):
    return (value.replace("\\", "\\\\").replace("\n", "\\n")
                 .replace("\r", "\\r").replace("\t", "\\t"))


def read_names(path):
    if not os.path.exists(path):
        return []

    with open(path, "r", encoding="utf-8") as handle:
        return [unescape(line.rstrip("\n")) for line in handle if line.rstrip("\n") != ""]


def read_hashes(path):
    if not os.path.exists(path):
        return set()

    with open(path, "r", encoding="utf-8") as handle:
        return {int(line.strip(), 16) for line in handle if line.strip()}


def build(source_dir):
    """name -> set of source tags, plus the per-source counts, guarded against empty sources."""
    names = {}
    counts = {}

    for filename, tag in NAME_SOURCES:
        path = os.path.join(source_dir, filename)
        values = read_names(path)
        counts[tag] = len(values)

        for value in values:
            if value not in names:
                names[value] = set()

            names[value].add(tag)

    return names, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source_dir", help="directory written by Rime's dump_name_sources")
    parser.add_argument("--out", default=None, help="output directory (default: source_dir)")
    parser.add_argument("--min-sources", type=int, default=6,
                        help="fail if fewer than this many name source files carried anything")
    parser.add_argument("--gzip", action="store_true",
                        help="write bf3_name_hashes.tsv.gz instead of the 28 MB plain file")
    parser.add_argument("--compare", action="append", default=[],
                        help="a public hash list (JSON of hash -> name) to audit against this "
                             "table; may be given more than once")
    args = parser.parse_args()

    out_dir = args.out or args.source_dir
    os.makedirs(out_dir, exist_ok=True)

    names, source_counts = build(args.source_dir)

    # CONTENT GUARD. A stale RimeLib.*.Frostbite2_0 assembly returns present-but-empty results that
    # read exactly like "BF3 has none of these", and an empty table is the one failure mode that
    # looks like success all the way to the last line. Refuse instead.
    non_empty = [tag for tag, count in source_counts.items() if count > 0]

    if len(non_empty) < args.min_sources:
        print("FATAL: only %d name sources carried anything: %s"
              % (len(non_empty), source_counts), file=sys.stderr)
        return 2

    if not names:
        print("FATAL: no names at all in %s" % args.source_dir, file=sys.stderr)
        return 2

    summary_path = os.path.join(args.source_dir, "summary.json")
    dump_summary = {}

    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as handle:
            dump_summary = json.load(handle)

    # Cross-check the file lengths against what the dumper said it wrote. A truncated transfer is
    # otherwise invisible.
    mismatches = {}

    for key, tag in (("partitions", "partition"), ("resources", "resource"),
                     ("bundles", "bundle"), ("superbundles", "superbundle"),
                     ("ebx_type_strings", "ebxtype"), ("ebx_value_strings", "ebxstring"),
                     ("ant_names", "ant")):
        if key in dump_summary and dump_summary[key] != source_counts.get(tag, 0):
            mismatches[key] = {"dumped": dump_summary[key], "read": source_counts.get(tag, 0)}

    if mismatches:
        print("FATAL: source files disagree with the dumper's own counts: %s"
              % json.dumps(mismatches), file=sys.stderr)
        return 2

    # ---- hash every name under both functions ------------------------------------------------
    # rows: (hash, name) -> [fn flags, source tags]. A name whose lowercase form equals itself
    # produces one hash under both functions and gets a single row marked `both`.
    quick_of = {}
    lower_of = {}
    non_ascii = 0

    for name in names:
        raw = name.encode("utf-8")

        if len(raw) != len(name):
            non_ascii += 1

        quick_of[name] = hash_quick(name)
        lower_of[name] = hash_quick(invariant_lower(name))

    rows = defaultdict(set)  # (hash, name) -> {"quick","lower"}

    for name, value in quick_of.items():
        rows[(value, name)].add("quick")

    for name, value in lower_of.items():
        rows[(value, name)].add("lower")

    # Three indexes, because "how many names does this hash answer to" means something different
    # per function. `Foo` and `foo` are two rows of the table and two DISTINCT hashQuick inputs,
    # but they are the SAME input to hashQuickLowerCase -- counting them as a collision would
    # report 79,158 where BF3 has none, which is what the first version of this did.
    quick_names = defaultdict(set)    # hash -> {name}, for fb::hashQuick
    lower_keys = defaultdict(set)     # hash -> {lowercased name}, for fb::hashQuickLowerCase
    lower_display = defaultdict(set)  # hash -> {name as it is written}, for reporting

    table_path = os.path.join(out_dir, "bf3_name_hashes.tsv" + (".gz" if args.gzip else ""))
    written = 0

    opener = ((lambda: gzip.open(table_path, "wt", encoding="utf-8", compresslevel=9))
              if args.gzip else (lambda: open(table_path, "w", encoding="utf-8")))

    with opener() as handle:
        handle.write("# hash\tfn\tname\tsources\n")
        handle.write("# fn: quick = fb::hashQuick only, lower = fb::hashQuickLowerCase only, "
                     "both = the two agree\n")

        for (value, name) in sorted(rows.keys(), key=lambda k: (k[0], k[1])):
            flags = rows[(value, name)]
            fn = "both" if len(flags) == 2 else next(iter(flags))
            handle.write("%08X\t%s\t%s\t%s\n"
                         % (value, fn, escape(name), ",".join(sorted(names[name]))))
            written += 1

            if "quick" in flags:
                quick_names[value].add(name)

            if "lower" in flags:
                lower_keys[value].add(invariant_lower(name))
                lower_display[value].add(name)

    # ---- collisions --------------------------------------------------------------------------
    collisions = {"quick": 0, "lower": 0}
    collision_path = os.path.join(out_dir, "bf3_name_hash_collisions.tsv")

    with open(collision_path, "w", encoding="utf-8") as handle:
        handle.write("# hash\tfn\tcount\tnames (tab separated)\n")

        for value in sorted(set(quick_names) | set(lower_keys)):
            for fn, index in (("quick", quick_names), ("lower", lower_keys)):
                colliding = index.get(value, set())

                if len(colliding) < 2:
                    continue

                collisions[fn] += 1
                handle.write("%08X\t%s\t%d\t%s\n"
                             % (value, fn, len(colliding),
                                "\t".join(escape(n) for n in sorted(colliding))))

    # ---- ground truth ------------------------------------------------------------------------
    # Places where BF3 states a hash in its own data. Resolving those is the only evidence that
    # matters; a row count says nothing about whether the table answers a real question.
    ground = {}

    # fb::ObjectVariation carries Asset.Name and NameHash on the SAME instance, so this checks the
    # hash FUNCTION as well as the table.
    ov_path = os.path.join(args.source_dir, "gt_objectvariation.tsv")
    ov_rows = 0
    ov_fn_quick = 0
    ov_fn_lower = 0
    ov_resolved_exact = 0
    ov_resolved_any = 0
    ov_resolved_unique = 0

    if os.path.exists(ov_path):
        with open(ov_path, "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.rstrip("\n").split("\t")

                if len(parts) < 2:
                    continue

                value = int(parts[0], 16)
                name = unescape(parts[1])
                ov_rows += 1

                if hash_quick(name) == value:
                    ov_fn_quick += 1

                if hash_quick(invariant_lower(name)) == value:
                    ov_fn_lower += 1

                if lower_keys.get(value):
                    ov_resolved_any += 1

                    if len(lower_keys[value]) == 1:
                        ov_resolved_unique += 1

                # The strong form: the table gives back the SAME STRING, in the same case, that
                # the instance carries -- not merely something that hashes the same.
                if name in lower_display.get(value, set()):
                    ov_resolved_exact += 1

    ground["objectvariation"] = {
        "rows": ov_rows,
        "namehash_is_hashQuick": ov_fn_quick,
        "namehash_is_hashQuickLowerCase": ov_fn_lower,
        "resolved_to_the_same_name": ov_resolved_exact,
        "resolved_to_some_name": ov_resolved_any,
        "resolved_to_exactly_one_name": ov_resolved_unique,
    }

    # Hashes with no name beside them. These are the cases a reverse table exists for.
    for key, filename, fn in (
        ("ebx_descriptors", "gt_ebx_descriptor_hashes.txt", "quick"),
        ("mvdb_variations", "gt_mvdb_variation_hashes.txt", "lower"),
        ("chunk_asset_names", "gt_chunk_asset_hashes.txt", "quick"),
    ):
        index = quick_names if fn == "quick" else lower_keys
        other = lower_keys if fn == "quick" else quick_names
        hashes = read_hashes(os.path.join(args.source_dir, filename))
        resolved = sum(1 for value in hashes if index.get(value))
        unique = sum(1 for value in hashes if len(index.get(value, ())) == 1)
        resolved_other = sum(1 for value in hashes if other.get(value))
        ground[key] = {
            "distinct_hashes": len(hashes),
            "fn": fn,
            "resolved": resolved,
            "resolved_to_exactly_one_name": unique,
            "unresolved": len(hashes) - resolved,
            "resolved_under_the_other_fn": resolved_other,
        }

    # ---- audit of a public list, if one was named ---------------------------------------------
    # Not a diff for its own sake. A published pair is CHECKABLE two ways: does the name reproduce
    # its own key under either hash function, and does BF3 contain that name at all. The first
    # catches an outright wrong entry; the second separates "a name the game has" from "a name
    # someone guessed", which is the whole reason this table is built the way it is.
    comparisons = {}

    for path in args.compare:
        with open(path, "r", encoding="utf-8") as handle:
            public = json.load(handle)

        unreproducible = 0
        hash_known = 0
        agreed = 0
        disagreed = 0

        for key, name in public.items():
            value = int(key) & 0xFFFFFFFF

            if hash_quick(name) != value and hash_quick(invariant_lower(name)) != value:
                unreproducible += 1
                continue

            if value not in quick_names and value not in lower_keys:
                continue

            hash_known += 1

            if name in quick_names.get(value, ()) or \
                    invariant_lower(name) in lower_keys.get(value, ()):
                agreed += 1
            else:
                disagreed += 1

        comparisons[os.path.basename(path)] = {
            "entries": len(public),
            "name_does_not_hash_to_its_own_key": unreproducible,
            "hash_present_in_this_table": hash_known,
            "agrees_with_this_table": agreed,
            "disagrees_with_this_table": disagreed,
            "hash_absent_from_this_table": len(public) - unreproducible - hash_known,
        }

    summary = {
        "source_dir": os.path.abspath(args.source_dir),
        "comparisons": comparisons,
        "name_sources": source_counts,
        "distinct_names": len(names),
        "non_ascii_names": non_ascii,
        "table_rows": written,
        "distinct_hashes": len(set(quick_names) | set(lower_keys)),
        "distinct_hashquick_hashes": len(quick_names),
        "distinct_hashquicklowercase_hashes": len(lower_keys),
        "collisions": collisions,
        "ground_truth": ground,
        "dump_summary": dump_summary,
    }

    with open(os.path.join(out_dir, "bf3_name_hashes_summary.json"), "w", encoding="utf-8") as h:
        json.dump(summary, h, indent=2, sort_keys=True)

    print(json.dumps(summary, indent=2, sort_keys=True))

    if written == 0:
        print("FATAL: wrote an empty table", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
