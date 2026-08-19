#!/usr/bin/env bash
# Stage 2 of the bake pipeline: export a saved project and run LevelLoaderGen over it.
#
#   tools/bake_run.sh BAKETEST [modname]
#
# Stage 1 is tools/e2e/bake_save_e2e.py (in game: edit + save).
# Stage 3 is tools/e2e/bake_verify_e2e.py (load the generated mod and read the values back).
set -euo pipefail

PROJECT="${1:?usage: bake_run.sh <projectName> [modName]}"
MODNAME="${2:-rm-levelloader-test}"

ME="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${BAKE_WORKDIR:-$HOME/Projects/mapeditor-bake}"
GEN="${LEVELLOADERGEN:-$HOME/Projects/LevelLoaderGen}"
RIME_SHIM="$WORK/rime"

export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"

[ -x "$RIME_SHIM/RimeREPL.exe" ] || { echo "no Rime shim at $RIME_SHIM/RimeREPL.exe — see docs/bake-pipeline.md"; exit 2; }

mkdir -p "$WORK/in/map_saves"
python3 "$ME/tools/export_save.py" --db "$ME/mod.db" --project "$PROJECT" \
        --out "$WORK/in/map_saves/MP_001_${PROJECT}.json"

rm -rf "$WORK/mods/$MODNAME" "$WORK/intermediate"

# --rimepath must be ABSOLUTE: bundles.py runs Rime with cwd=rime_path, so a relative path is
# resolved against Rime's own directory and the run dies with FileNotFoundError.
cd "$WORK" && python3 "$GEN/generate.py" "$MODNAME" 0.1.0 -i ./in -o ./mods --rimepath "$RIME_SHIM"

SB=$(find "$WORK/mods/$MODNAME/sb" -name '*.sb' 2>/dev/null | head -1)
[ -n "$SB" ] || { echo "FAIL: generated mod has an EMPTY sb/ — superbundle went somewhere else"; exit 1; }
echo "superbundle: $SB ($(du -h "$SB" | cut -f1))"
echo "generated: $WORK/mods/$MODNAME"
