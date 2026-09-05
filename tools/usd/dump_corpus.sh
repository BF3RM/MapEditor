#!/usr/bin/env bash
# Dump a random sample of BF3 MeshSet resources and their geometry chunks.
#   tools/usd/dump_corpus.sh /tmp/bf3corpus 1200 [chunk_sample]
# Needs RimeREPL built (see docs/bake-pipeline.md §2) and BF3 installed.
set -euo pipefail
OUT="${1:-/tmp/bf3corpus}"; COUNT="${2:-1200}"; CHUNKS="${3:-60}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GAME="${BF3_PATH:-$HOME/.local/share/Steam/steamapps/common/Battlefield 3}"
RIME="${RIMEREPL:-$HOME/Projects/Rime/bin/Release/RimeREPL}"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
mkdir -p "$OUT/res" "$OUT/chunks"

# The REPL is interactive; wrap it in a PTY or it produces no output.
run() { script -qfec "$RIME $1" "$OUT/rime.log" >/dev/null 2>&1; }

printf 'mount_game "%s" Frostbite2_0 true\nselect_game 1\nlist_resources_of_type MeshSet\n' "$GAME" > "$OUT/list.cmds"
run "$OUT/list.cmds"
grep '^- ' "$OUT/rime.log" | sed 's/^- //' | tr -d '\r' > "$OUT/all_meshsets.txt"
echo "$(wc -l < "$OUT/all_meshsets.txt") MeshSets in the game"

python3 - "$OUT" "$COUNT" "$CHUNKS" "$GAME" <<'PY'
import random, sys
out, count, nchunks, game = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
names = [l.strip() for l in open(out + "/all_meshsets.txt") if l.strip()]
random.seed(7)
sample = random.sample(names, min(count, len(names)))
cmds = ['mount_game "%s" Frostbite2_0 true' % game, "select_game 1"]
for i, p in enumerate(sample):
    cmds.append('dump_resource %s "%s/res/%05d.bin"' % (p, out, i))
open(out + "/dump.cmds", "w").write("\n".join(cmds) + "\n")
open(out + "/names.txt", "w").write("\n".join(sample) + "\n")
PY
run "$OUT/dump.cmds"
echo "dumped $(ls "$OUT/res" | wc -l) resources"

# Second pass: chunk ids are only known after parsing the resources.
python3 - "$OUT" "$CHUNKS" "$GAME" "$HERE" <<'PY'
import glob, os, random, sys, uuid
out, nchunks, game, here = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
sys.path.insert(0, here)
from meshset import MeshSet
files = [f for f in sorted(glob.glob(out + "/res/*.bin")) if os.path.getsize(f)]
usable = []
for f in files:
    ms = MeshSet.parse(open(f, "rb").read())
    if ms.lods and all(l.data_chunk_id != b"\0" * 16 for l in ms.lods):
        usable.append(f)
random.seed(3)
cmds = ['mount_game "%s" Frostbite2_0 true' % game, "select_game 1"]
for f in random.sample(usable, min(nchunks, len(usable))):
    for l in MeshSet.parse(open(f, "rb").read()).lods:
        g = uuid.UUID(bytes_le=l.data_chunk_id)
        cmds.append('dump_chunk %s "%s/chunks/%s.chunk"' % (g, out, g))
open(out + "/chunks.cmds", "w").write("\n".join(cmds) + "\n")
PY
run "$OUT/chunks.cmds"
echo "dumped $(ls "$OUT/chunks" | wc -l) chunks into $OUT"
