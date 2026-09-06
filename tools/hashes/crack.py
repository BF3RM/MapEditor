#!/usr/bin/env python3
"""Recover names for hashes that BF3 references but does not spell out anywhere.

A hash match is self-verifying -- `hashQuickLowerCase(candidate) == target` is a proof that the
candidate IS a preimage -- so searching is legitimate in a way that guessing is not. What is NOT
free is the false-positive rate: over a 32-bit hash, a search of N candidates against T targets
yields N*T/2^32 spurious preimages on average, and a large enough search produces a
plausible-looking wrong name for every target. So every generator here is small, corpus-derived,
and its exact candidate count is printed with the result. If the expected number of false hits is
not far below 1, the hits are not evidence and the report says so.

Both generators build candidates only out of strings BF3 already contains:

  digits     every corpus name with one of its digit runs replaced by another number of the same
             width. This is the generator that finds a sibling asset: the MVDB of
             `..._windows_iraq01_wet_mesh` references a variation named `..._iraq02_wet`, which is
             a real name the shipped data happens not to store anywhere.
  context    for a target that comes with a related name (an MVDB variation hash comes with the
             mesh that references it), the names sharing that mesh's directory or stem, with their
             final `_token` replaced by every final token the corpus uses.

Usage:
    python3 crack.py --targets <file of 8-hex-digit hashes, or hash<tab>context...>
                     --sources <dump dir from dump_name_sources>
                     [--fn lower|quick] [--generator digits,context]
"""

import argparse
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_hash_table import hash_quick, invariant_lower, read_names, unescape, NAME_SOURCES

FNV_PRIME = 0x21
DIGITS = re.compile(r"\d+")


def corpus(source_dir):
    names = set()

    for filename, _tag in NAME_SOURCES:
        names.update(read_names(os.path.join(source_dir, filename)))

    return names


def prefix_hashes(name):
    """h after each character, so a mutation at position i can start from h[i] instead of 0."""
    out = [0x1505]
    h = 0x1505

    for c in name.encode("utf-8"):
        h = ((h * FNV_PRIME) & 0xFFFFFFFF) ^ c
        out.append(h)

    return out


def extend(h, data):
    for c in data:
        h = ((h * FNV_PRIME) & 0xFFFFFFFF) ^ c

    return h


def gen_digits(names, targets, hits, width_cap=3):
    """Every digit run of every name replaced by another number of the same width.

    Returns (candidates, tests). TESTS is what sets the false-positive rate, and here every
    candidate is checked against the WHOLE target set, so tests = candidates * targets. That is
    what makes the wide search expensive in evidence: 6.8e7 candidates against 126 targets is
    8.5e9 chances for a 32-bit coincidence, i.e. about two wrong names for free.
    """
    tried = 0

    for name in names:
        runs = [(m.start(), m.end()) for m in DIGITS.finditer(name)]

        if not runs:
            continue

        raw = name.encode("utf-8")

        if len(raw) != len(name):
            continue

        prefix = prefix_hashes(name)

        for (start, stop) in runs:
            width = stop - start

            if width > width_cap:
                continue

            tail = raw[stop:]
            head = prefix[start]
            original = raw[start:stop]

            for value in range(10 ** width):
                digits = b"%0*d" % (width, value)

                if digits == original:
                    continue

                tried += 1
                h = extend(extend(head, digits), tail)

                if h in targets:
                    hits.setdefault(h, set()).add(
                        (name[:start] + digits.decode() + name[stop:], "digits<-" + name))

    return tried, tried * len(targets)


def gen_context_digits(names, targets_with_context, hits):
    """Digit mutation restricted to the target's own directory.

    This is the run whose hits are evidence. The wide search over the whole corpus is 6.8e7
    candidates, which against ~126 targets expects TWO spurious preimages -- enough to hand every
    target a plausible-looking wrong name. Restricting the donors to names sitting in the same
    directory as the name BF3 stores beside the hash cuts the space by four orders of magnitude,
    and a hit is then a sibling of the very asset that references it.
    """
    by_dir = {}

    for name in names:
        by_dir.setdefault(name.rsplit("/", 1)[0] if "/" in name else "", []).append(name)

    tried = 0

    for target, context in targets_with_context:
        if not context or context == "?":
            continue

        directory = context.rsplit("/", 1)[0] if "/" in context else ""
        donors = by_dir.get(directory, ())

        for name in donors:
            raw = name.encode("utf-8")

            if len(raw) != len(name):
                continue

            prefix = prefix_hashes(name)

            for m in DIGITS.finditer(name):
                width = m.end() - m.start()

                if width > 3:
                    continue

                tail = raw[m.end():]
                head = prefix[m.start()]
                original = raw[m.start():m.end()]

                for value in range(10 ** width):
                    digits = b"%0*d" % (width, value)

                    if digits == original:
                        continue

                    tried += 1

                    if extend(extend(head, digits), tail) == target:
                        hits.setdefault(target, set()).add(
                            (name[:m.start()] + digits.decode() + name[m.end():],
                             "sibling-of<-" + name))

    # Each candidate is checked against ONE target, its own, so tests == candidates.
    return tried, tried


def gen_context(names, targets_with_context, hits):
    """Names near the target's context, with their final _token swapped for every final token."""
    final_tokens = set()

    for name in names:
        if "_" in name:
            final_tokens.add(name.rsplit("_", 1)[1])

    by_dir = {}

    for name in names:
        by_dir.setdefault(name.rsplit("/", 1)[0] if "/" in name else "", []).append(name)

    tried = 0

    for target, context in targets_with_context:
        if not context or context == "?":
            continue

        directory = context.rsplit("/", 1)[0] if "/" in context else ""
        stem = context.rsplit("/", 1)[-1]
        stem = stem[:-5] if stem.endswith("_mesh") else stem

        bases = set(by_dir.get(directory, ()))
        bases.add(context[:-5] if context.endswith("_mesh") else context)

        # Also the parent directory's siblings: a variation often lives one level up.
        parent = directory.rsplit("/", 1)[0] if "/" in directory else ""
        bases.update(n for n in by_dir.get(parent, ()) if stem.split("_")[0] in n)

        # By ROOT, not by base. Several bases in a directory share a root, and root+token is then
        # the same candidate string reached twice -- counting those separately overstated the
        # candidate space by 25% and the false-positive expectation with it.
        roots = {}

        for base in bases:
            roots.setdefault(base.rsplit("_", 1)[0] if "_" in base else base, base)

        for root, base in roots.items():
            root_bytes = (root + "_").encode("utf-8")

            if len(root_bytes) != len(root) + 1:
                continue

            head = extend(0x1505, root_bytes)

            for token in final_tokens:
                raw = token.encode("utf-8")

                if len(raw) != len(token):
                    continue

                tried += 1

                if extend(head, raw) == target:
                    hits.setdefault(target, set()).add((root + "_" + token, "context<-" + base))

    return tried, tried


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--targets", required=True)
    parser.add_argument("--sources", required=True)
    parser.add_argument("--fn", default="lower", choices=("lower", "quick"))
    parser.add_argument("--generator", default="digits,context",
                        help="digits (wide), context-digits (siblings of the target's own "
                             "context, the run whose hits are evidence), context (token swap)")
    parser.add_argument("--control", type=int, default=0,
                        help="also run against this many RANDOM hashes, to measure the "
                             "false-positive rate instead of only predicting it")
    args = parser.parse_args()

    targets = []

    with open(args.targets, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\n")

            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            targets.append((int(parts[0], 16), unescape(parts[1]) if len(parts) > 1 else ""))

    names = corpus(args.sources)

    # The lowercase function is case-blind, so the corpus collapses to its lowercased forms and a
    # candidate only has to be generated once.
    if args.fn == "lower":
        names = {invariant_lower(n) for n in names}

    target_set = {t for t, _ in targets}
    hits = {}
    tried = 0
    tests = 0
    wanted = args.generator.split(",")

    if "context-digits" in wanted:
        n, t = gen_context_digits(names, targets, hits)
        print("generator context-digits: %d candidates, %d tests" % (n, t))
        tried += n
        tests += t

    if "digits" in wanted:
        n, t = gen_digits(names, target_set, hits)
        print("generator digits:         %d candidates, %d tests" % (n, t))
        tried += n
        tests += t

    if "context" in wanted:
        n, t = gen_context(names, targets, hits)
        print("generator context:        %d candidates, %d tests" % (n, t))
        tried += n
        tests += t

    expected = tests / 2 ** 32
    print("corpus %d names, %d targets, %d candidates, %d tests, expected FALSE hits %.4f"
          % (len(names), len(target_set), tried, tests, expected))

    verify = hash_quick if args.fn == "quick" else (lambda s: hash_quick(invariant_lower(s)))

    for target, _ in targets:
        for (name, origin) in sorted(hits.get(target, ())):
            assert verify(name) == target, "generator produced a non-matching candidate"
            print("HIT %08X\t%s\t%s" % (target, name, origin))

    print("cracked %d of %d targets" % (len(hits), len(target_set)))

    # The predicted false-positive rate is arithmetic; this measures it. Random targets have no
    # true preimage in the corpus, so every hit against them is a false one.
    if args.control:
        rng = random.Random(20260906)
        control = {rng.getrandbits(32) for _ in range(args.control)}
        control -= target_set
        control_hits = {}
        control_tried = 0

        control_tests = 0

        if "context-digits" in wanted:
            _, t = gen_context_digits(
                names, [(t, c) for t, (_, c) in zip(sorted(control), targets)], control_hits)
            control_tests += t

        if "context" in wanted:
            _, t = gen_context(
                names, [(t, c) for t, (_, c) in zip(sorted(control), targets)], control_hits)
            control_tests += t

        if "digits" in wanted:
            _, t = gen_digits(names, control, control_hits)
            control_tests += t

        print("control: %d random targets, %d tests, expected %.4f false hits, observed %d"
              % (len(control), control_tests, control_tests / 2 ** 32, len(control_hits)))

    return 0


if __name__ == "__main__":
    sys.exit(main())
