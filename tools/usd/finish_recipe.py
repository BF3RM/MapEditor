#!/usr/bin/env python3
"""Apply the post-emit steps a level's build recipe needs, in the one order that works.

`level_to_bf3.emit` writes a recipe that builds the level's own bundle. Three more things have to
go in before it will actually load, and each lives in its own tool:

    registry_assets.py    the 1688 weapon/persistence partitions the RegistryContainer declares
    (this file)           the 5 skeleton partitions the animation system resolves, as closure
    gamemode_sublevel.py  the per-gamemode sub-level that carries teams and spawns

Running them by hand is a trap, and the trap is silent. BOTH of the other two tools regenerate the
recipe from `build.cmds.orig`, a pristine copy they make on first run -- so whichever runs second
reads the copy the FIRST one made, which is the bare emitter output, and throws the first one's work
away. The recipe then builds cleanly, reports the same bundle count, and the server hangs at
"Loading terrain" with nothing to say about why.

The fix is to hand each tool a `.orig` that IS the previous step's output: this removes it between
steps, so "pristine" means "what the recipe looked like before THIS step".

MEASURED on MP_001, full mesh set: 2959 emitter lines -> 4675 after all three, and the server goes
from hanging to `Level:Loaded` with ENTITY static=5864, weapons resolved=60 missing=0, 22 character
spawns. Without the sequencing, the same inputs produce a recipe that hangs.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# The animation system resolves these eagerly, so they need their dependency CLOSURE, not a raw
# copy -- see skeleton_db.py, which measured both. Closure costs 1.18 MB here; the same command on
# the gamemode level setup cost 1.4 GB, which is why this is a hand-picked list and not a rule.
SKELETON_PARTITIONS = (
    'animations/skeletons/parachuteske01',
    'animations/skeletons/veniceantske01',
    'characters/soldiers/defaultsoldierbonecollision',
    'animations/skeletons/venice1pske01',
    'animations/settings/ragdolls/ragdoll01',
)


def _lines(path):
    return [l for l in open(path).read().split('\n') if l.strip()]


def _write(path, lines):
    open(path, 'w').write('\n'.join(lines) + '\n')


def _drop_pristine(emit_dir):
    """So the NEXT tool treats the current recipe as its starting point."""
    pristine = os.path.join(emit_dir, 'build.cmds.orig')

    if os.path.exists(pristine):
        os.remove(pristine)


def add_skeletons(emit_dir):
    """The skeleton partitions, referenced with their closure, before the trailing build pair.

    build_sb NESTS: the first `build` closes the bundle and the second writes the superbundle, so a
    line appended after them runs in a context that is already finished and is silently discarded.
    """
    path = os.path.join(emit_dir, 'build.cmds')
    lines = _lines(path)

    while lines and lines[-1].strip() == 'build':
        lines.pop()

    lines += ['reference_existing_partition %s 1' % n for n in SKELETON_PARTITIONS]
    lines += ['build', 'build']
    _write(path, lines)

    return len(SKELETON_PARTITIONS)


def _run(script, args, label):
    result = subprocess.run([sys.executable, os.path.join(HERE, script)] + args,
                            capture_output=True, text=True)

    for line in (result.stdout or '').rstrip().split('\n'):
        if line.strip():
            print('  [%s] %s' % (label, line))

    if result.returncode != 0:
        print('  [%s] FAILED rc=%d\n%s' % (label, result.returncode, result.stderr[-2000:]))

    return result.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('emit_dir', help='the directory level_to_bf3.emit wrote build.cmds into')
    ap.add_argument('--closure', default='/tmp/closure',
                    help='closure dump keyed by partition guid, for resolving registry names')
    ap.add_argument('--dump-dir', default='/tmp/regparts',
                    help='where the registry partitions are dumped as raw .bin')
    ap.add_argument('--skip-registry', action='store_true')
    ap.add_argument('--skip-skeletons', action='store_true')
    ap.add_argument('--skip-gamemode', action='store_true')
    args = ap.parse_args()

    path = os.path.join(args.emit_dir, 'build.cmds')

    if not os.path.exists(path):
        print('no build.cmds under %s -- run the emitter first' % args.emit_dir)
        return 1

    print('recipe %d line(s) from the emitter' % len(_lines(path)))

    # ORDER MATTERS, and it is the order the bundle needs them in, not a preference: the registry's
    # raw partitions and the skeleton references belong to the level's own bundle, and the gamemode
    # sub-level opens a SECOND bundle after that one is closed.
    if not args.skip_registry:
        _drop_pristine(args.emit_dir)

        if not _run('registry_assets.py', [args.emit_dir, args.closure,
                                           '--dump-dir', args.dump_dir], 'registry'):
            return 1

    if not args.skip_skeletons:
        print('  [skeletons] referenced %d partition(s) with closure' % add_skeletons(args.emit_dir))

    if not args.skip_gamemode:
        _drop_pristine(args.emit_dir)

        if not _run('gamemode_sublevel.py', [args.emit_dir], 'gamemode'):
            return 1

    lines = _lines(path)
    kinds = {}

    for line in lines:
        kinds[line.split(' ')[0]] = kinds.get(line.split(' ')[0], 0) + 1

    print('recipe %d line(s) final: %s' % (
        len(lines), ', '.join('%s %d' % kv for kv in
                              sorted(kinds.items(), key=lambda kv: -kv[1])[:6])))

    # A recipe that lost a step still builds and still reports the same bundle count, so check the
    # SHAPE rather than trusting the build: two bundles, and the registry and skeleton carries both
    # present. Each of these has silently gone missing at least once.
    problems = []

    if kinds.get('build_bundle', 0) < 2:
        problems.append('no gamemode bundle (build_bundle x%d)' % kinds.get('build_bundle', 0))

    if not args.skip_registry and kinds.get('add_raw_partition', 0) < 100:
        problems.append('registry carry missing (add_raw_partition x%d)'
                        % kinds.get('add_raw_partition', 0))

    if not args.skip_skeletons and kinds.get('reference_existing_partition', 0) < len(SKELETON_PARTITIONS):
        problems.append('skeleton closure missing (reference_existing_partition x%d)'
                        % kinds.get('reference_existing_partition', 0))

    for problem in problems:
        print('  PROBLEM: %s' % problem)

    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
