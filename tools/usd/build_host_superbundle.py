#!/usr/bin/env python3
"""Emit the Rime recipe that builds an exported level into the REALITYMOD host WITH ITS GAME MODE.

Why this exists
---------------
`Admin/Mods/Blank_Level_Test/RimeCommands.txt` is STALE. It predates the mod's own
`mod.json` (v0.0.110) and rebuilds only 6 of the 8 bundles the shipped `REALITYMOD.sb`
carries -- it drops `Win32/Levels/REALITYMOD/teamdeathmatch` and `.../tdm2`, which are the
game-mode sub-level. Measured 2026-09-06: a superbundle rebuilt from that recipe (with or
without any USD content) registers ZERO teams, so no player can ever enter, the client hangs
on a black loading screen, and every headless check still passes.

Nothing reproduces those two bundles from source: `levels/realitymod/teamdeathmatch` is
mp_subway's TDM sub-level renamed, and its closure is 6,318 partitions carried as CAS refs.
Authoring the five `levels/realitymod/*` partitions as JSON is NOT enough -- that build boots
as far as "Creating physics manager" and the process exits.

What works, and what this script emits
--------------------------------------
Mount the SHIPPED `.sb` as a standalone superbundle, then CLONE it bundle for bundle into a
CAS superbundle, overriding only the LevelData partition so our sub-level is referenced:

    mount_game <bf3> Frostbite2_0 true
    select_game 1
    mount_standalone_sb Win32/Levels/REALITYMOD/REALITYMOD <shipped .sb> true
    exit
    build_sb Win32/Levels/REALITYMOD/REALITYMOD Frostbite2_0 <sb dir> true   <-- CAS, or 780 MB
    clone_sb_chunks Win32/Levels/REALITYMOD/REALITYMOD
    build_bundle <each of the 8> ; clone_bundle <same> ; build
      (on the main REALITYMOD bundle, add_json_partition the patched LevelData after the clone)
    <the emitted level's own build.cmds bundle>
    build

Baseline output is 5,950,017 bytes against the shipped 5,933,667, and it boots with
`Registering team 0/1/2`. With mp_001's content it is 61,924,317 bytes, loads
comp=4 teamdeathmatch / comp=5 tdm2 / comp=6 usdlevel, and reports 6200 static entities.

The LevelData to patch is `ext/Shared/TestJson1_nowater.json`, NOT `TestJson1.json`:
dumped out of the shipped `.sb`, `levels/realitymod/realitymod` matches nowater on all 11
instances (only engine-assigned IndexInBlueprint/IsEventConnectionTarget ints differ), and it
is the one that wires both SubWorldReferenceObjectData gated on the shared GameMode criterion
(`8553f314-.../8b89e816-...`, EnabledOptions ["TeamDeathMatch0", "TeamDeathMatchC0"]).

STILL BROKEN, and this script does not fix it: with the game mode restored the SERVER is
healthy but the CLIENT still cannot finish loading a level that contains the emitted
`usdlevel` bundle -- even at 60 placements. See docs/usd-parity.md.

Usage
-----
    build_host_superbundle.py --level mp_001 > /tmp/build.cmds
    build_host_superbundle.py --level NONE   > /tmp/baseline.cmds     # no USD content
    RimeREPL /tmp/build.cmds
"""
import argparse
import json
import os
import sys

BF3 = "/home/powos/.local/share/Steam/steamapps/common/Battlefield 3"
SB_NAME = "Win32/Levels/REALITYMOD/REALITYMOD"
HOST_LEVEL_PARTITION = "levels/realitymod/realitymod"

# The shipped superbundle's 8 bundles. The first is handled separately (its LevelData is
# overridden); the rest are cloned verbatim.
CLONED_BUNDLES = [
    "Win32/Levels/REALITYMOD/REALITYMOD_Settings_Win32",
    "Win32/Levels/REALITYMOD/REALITYMOD_GameConfigLight_Win32",
    "Win32/Levels/REALITYMOD/REALITYMOD_loading_music",
    "Win32/Levels/REALITYMOD/REALITYMOD_UiLoadingMp",
    "Win32/Levels/REALITYMOD/REALITYMOD_UiPlaying",
    "Win32/Levels/REALITYMOD/teamdeathmatch",   # the game mode: 102 spawns, combat area, friend zones
    "Win32/Levels/REALITYMOD/tdm2",
]

LEVEL_DATA_GUID = "ceb62353-85bc-67bb-eb82-311402be77ad"
REGISTRY_GUID = "eebc7d5f-b8ba-a2c8-7c14-ce53212537ee"
SUBLEVEL_GUID = "7d500001-0000-4000-8000-0000000000f1"


def patched_level_data(nowater_path, out_path, bundle_name):
    """TestJson1_nowater.json plus one ungated SubWorldReferenceObjectData for our bundle.

    Ungated on purpose: the two shipped ones carry a SubWorldInclusionSetting keyed to the
    GameMode criterion so they only load under TeamDeathMatch0/C0. Ours must load under every
    mode, so it gets InclusionSettings = null.
    """
    d = json.load(open(nowater_path))
    host = d["PartitionGuid"]

    if bundle_name is None:
        json.dump(d, open(out_path, "w"), indent=1)
        return out_path

    ref = {
        "$type": "SubWorldReferenceObjectData",
        "IndexInBlueprint": 113,
        "IsEventConnectionTarget": 27,
        "IsPropertyConnectionTarget": 0,
        "BlueprintTransform": {
            "right": {"x": 1.0, "y": 0.0, "z": 0.0},
            "up": {"x": 0.0, "y": 1.0, "z": 0.0},
            "forward": {"x": 0.0, "y": 0.0, "z": 1.0},
            "trans": {"x": 0.0, "y": 0.0, "z": 0.0},
        },
        "Blueprint": None,
        "ObjectVariation": None,
        "StreamRealm": "StreamRealm_Both",
        "CastSunShadowEnable": True,
        "Excluded": False,
        "BundleName": bundle_name,
        "InclusionSettings": None,
        "AutoLoad": True,
        "IsWin32SubLevel": True,
        "IsXenonSubLevel": True,
        "IsPs3SubLevel": True,
    }
    d["Instances"][SUBLEVEL_GUID] = ref
    d["Instances"][LEVEL_DATA_GUID]["Objects"].append(
        {"PartitionGuid": host, "InstanceGuid": SUBLEVEL_GUID})
    d["Instances"][REGISTRY_GUID]["ReferenceObjectRegistry"].append(
        {"PartitionGuid": host, "InstanceGuid": SUBLEVEL_GUID})
    json.dump(d, open(out_path, "w"), indent=1)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", required=True,
                    help="emitted level name under --emit-dir, or NONE for the bare baseline")
    ap.add_argument("--emit-dir", default="/tmp/lvemit")
    ap.add_argument("--mod-dir",
                    default=os.path.expanduser(
                        "~/Games/VeniceUnleashed/shot-instance/Admin/Mods/Blank_Level_Test"))
    ap.add_argument("--shipped-sb", required=True,
                    help="the SHIPPED REALITYMOD.sb (eg. the mod's REALITYMOD.sb.bak_v0104)")
    ap.add_argument("--level-data-out", default="/tmp/LevelData_host.json")
    ap.add_argument("--bf3", default=BF3)
    ap.add_argument("--sub-bundle", default="levels/realitymod/usdlevel")
    ap.add_argument("--mvdb-source", default=None,
                    help="source MVDB partition to build the sub-level's own MVDB from "
                         "(eg. levels/mp_001/mp_001/meshvariationdb_win32)")
    a = ap.parse_args()

    shared = os.path.join(a.mod_dir, "ext", "Shared")
    nowater = os.path.join(shared, "TestJson1_nowater.json")
    if not os.path.exists(nowater):
        sys.exit("no TestJson1_nowater.json under %s" % shared)

    lvl = patched_level_data(nowater, a.level_data_out,
                             None if a.level == "NONE" else a.sub_bundle)

    out = [
        'mount_game "%s" Frostbite2_0 true' % a.bf3,
        "select_game 1",
        'mount_standalone_sb %s "%s" true' % (SB_NAME, a.shipped_sb),
        "exit",
        'build_sb %s Frostbite2_0 "%s" true' % (SB_NAME, os.path.join(a.mod_dir, "sb")),
        "clone_sb_chunks %s" % SB_NAME,
        "build_bundle %s" % SB_NAME,
        "clone_bundle %s" % SB_NAME,
        'add_json_partition %s "%s"' % (HOST_LEVEL_PARTITION, lvl),
        "build",
    ]
    for b in CLONED_BUNDLES:
        out += ["build_bundle %s" % b, "clone_bundle %s" % b, "build"]

    if a.level != "NONE":
        cmds = os.path.join(a.emit_dir, a.level, "build.cmds")
        em = [l for l in open(cmds).read().splitlines() if l.strip()]
        # em[0] mount_game, em[1] build_sb, em[2] build_bundle <ours>; the trailing `build`s are
        # ours to place, because build_sb NESTS and needs one `build` per open context.
        out += [em[2]] + [l for l in em[3:] if l.strip() != "build"]
        if a.mvdb_source:
            out += ["mesh_variation_db_add_all %s %s/meshvariationdb_win32 1 false \"\""
                    % (a.mvdb_source, a.sub_bundle)]
        out += ["build"]

    out += ["build"]
    print("\n".join(out))


if __name__ == "__main__":
    main()
