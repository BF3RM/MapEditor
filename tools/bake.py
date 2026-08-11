#!/usr/bin/env python3
"""Bake a MapEditor project into a loadable level mod, overrides included.

Wraps LevelLoaderGen rather than forking it. The generator carries placement only; this adds the
piece it has no concept of — per-instance EBX overrides — by:

  1. exporting the project from mod.db (header + objects, and the cloned-blueprint partitions
     stored in project_ebx),
  2. running the generator's own save -> EBX step unchanged,
  3. writing each cloned blueprint into the same intermediate folder as an extra partition, and
     repointing that object's ReferenceObjectData at it,
  4. running the generator's bundle + mod steps unchanged.

Step 3 needs no upstream patch: bundles.py adds *every* file in the map's intermediate folder to
the bundle, so dropping partitions there is enough to get them compiled in.

Isolation is structural. Each overridden instance gets its own partition and only that object's ROD
is repointed, so sibling instances of the same prefab keep resolving the stock blueprint.

See docs/bake-pipeline.md.
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ebx_to_rime import convert_partition, dangling_references  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(HERE, '..', 'mod.db')
BUNDLE_PREFIX = 'CustomLevels'
# Stable namespace so re-baking the same project yields the same partition guids.
PARTITION_NS = uuid.UUID('6f9619ff-8b86-d011-b42d-00c04fc964ff')


def load_project(db_path, project=None, project_id=None):
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    if project_id is None:
        row = con.execute(
            "SELECT id FROM project_header WHERE project_name=? ORDER BY id DESC LIMIT 1",
            (project,)).fetchone()
        if row is None:
            sys.exit(f"error: no project named {project!r}")
        project_id = row[0]

    hdr = con.execute(
        "SELECT project_name, map_name, gamemode_name, required_bundles, timestamp, save_version "
        "FROM project_header WHERE id=?", (project_id,)).fetchone()
    if hdr is None:
        sys.exit(f"error: no project with id {project_id}")

    objects = []
    for (blob,) in con.execute(
            "SELECT save_file_json FROM project_data WHERE project_header_id=? ORDER BY id",
            (project_id,)):
        parsed = json.loads(blob)
        objects.extend(parsed if isinstance(parsed, list) else parsed.values())

    ebx = []
    try:
        rows = con.execute(
            "SELECT object_guid, partition_name, partition_json FROM project_ebx "
            "WHERE project_header_id=? ORDER BY id", (project_id,)).fetchall()
        ebx = [{"object_guid": g, "name": n, "partition": json.loads(j)} for g, n, j in rows]
    except sqlite3.OperationalError:
        # Saves written before project_ebx existed.
        pass

    con.close()

    name, map_name, gamemode, bundles, timestamp, save_version = hdr
    try:
        bundles = json.loads(bundles) if bundles else {}
    except (TypeError, ValueError):
        bundles = {}

    save = {
        "header": {
            "projectName": name,
            "timeStamp": timestamp,
            "mapName": map_name,
            "gameModeName": gamemode,
            "requiredBundles": bundles,
            "saveVersion": save_version,
        },
        "data": objects,
    }
    return save, ebx


def inject_overrides(intermediate_dir, map_name, gamemode, ebx_rows, verbose=True):
    """Write cloned-blueprint partitions and repoint the RODs that should use them.

    Returns (injected, skipped_shadow, dangling_total).
    """
    level_path = os.path.join(intermediate_dir, 'ebx_json', map_name)
    generated = os.path.join(level_path, gamemode + '.json')

    if not os.path.exists(generated):
        sys.exit(f"error: generator produced no {generated}")

    with open(generated) as f:
        level = json.load(f)

    injected, skipped_shadow, dangling_total = 0, 0, 0

    for row in ebx_rows:
        object_guid = (row["object_guid"] or "").strip()

        if not object_guid:
            # Apply-to-blueprint: must SHADOW the stock partition under its original name, which
            # bundles.py cannot express (it names every partition CustomLevels/<map>/<file>).
            # Emitting it here under a custom name would be worse than skipping: the modified
            # blueprint would sit in the bundle while every ROD still resolved the stock one.
            skipped_shadow += 1
            continue

        rod_guid = object_guid.lower()
        rod = level["Instances"].get(rod_guid)

        if rod is None:
            if verbose:
                print(f"  ! no ReferenceObjectData for {rod_guid}; override not applied")
            continue

        file_stem = rod_guid
        partition_guid = str(uuid.uuid5(PARTITION_NS, rod_guid))
        partition_name = f"{BUNDLE_PREFIX}/{map_name}/{file_stem}"

        converted = convert_partition(row["partition"], partition_guid, partition_name)

        missing = dangling_references(converted)
        dangling_total += len(missing)
        if missing and verbose:
            print(f"  ! {len(missing)} dangling internal ref(s) in {rod_guid}"
                  f" (first: {missing[0][1]})")

        with open(os.path.join(level_path, file_stem + '.json'), 'w') as f:
            json.dump(converted, f, indent=1)

        # Point THIS object at its own blueprint. Siblings are untouched and keep the stock one.
        rod["Blueprint"] = {
            "PartitionGuid": partition_guid,
            "InstanceGuid": converted["PrimaryInstanceGuid"],
        }
        injected += 1

        if verbose:
            print(f"  + {rod_guid} -> own blueprint ({len(converted['Instances'])} instances)")

    with open(generated, 'w') as f:
        json.dump(level, f, indent=2)

    return injected, skipped_shadow, dangling_total


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--project", help="project name (newest match)")
    ap.add_argument("--id", type=int, help="project_header id")
    ap.add_argument("--generator", required=True, help="path to the LevelLoaderGen checkout")
    ap.add_argument("--rimepath", required=True, help="dir containing RimeREPL.exe (may be a shim)")
    ap.add_argument("--workdir", default=os.path.join(os.getcwd(), 'bake'))
    ap.add_argument("--out", help="where to place the generated mod (default <workdir>/mods)")
    ap.add_argument("--mod-name", default="rm-levelloader")
    ap.add_argument("--mod-version", default="0.1.0")
    ap.add_argument("--gamemode-map", help="optional gamemode_map.json to copy into the input dir")
    args = ap.parse_args()

    if not args.project and args.id is None:
        sys.exit("error: give --project NAME or --id N")

    save, ebx_rows = load_project(os.path.abspath(args.db), args.project, args.id)
    header = save["header"]
    map_name, gamemode = header["mapName"], header["gameModeName"]

    workdir = os.path.abspath(args.workdir)
    in_dir = os.path.join(workdir, 'in')
    saves_dir = os.path.join(in_dir, 'map_saves')
    out_dir = args.out or os.path.join(workdir, 'mods')
    os.makedirs(saves_dir, exist_ok=True)

    save_path = os.path.join(saves_dir, f"{map_name}_{header['projectName']}.json")
    with open(save_path, 'w') as f:
        json.dump(save, f, indent=1)

    if args.gamemode_map:
        shutil.copy(args.gamemode_map, os.path.join(in_dir, 'gamemode_map.json'))

    print(f"project {header['projectName']}: {len(save['data'])} object(s), "
          f"{len(ebx_rows)} stored blueprint partition(s)")
    print(f"map={map_name} gamemode={gamemode}")

    generator = os.path.abspath(args.generator)
    sys.path.insert(0, generator)
    import ebx_json      # noqa: E402
    import bundles       # noqa: E402
    import mod_generator  # noqa: E402

    mod_out = os.path.join(out_dir, args.mod_name)

    # The generator resolves 'intermediate' relative to CWD.
    previous_cwd = os.getcwd()
    os.chdir(workdir)
    try:
        ebx_json.generate_ebx_json(in_dir, mod_out)

        print("injecting overrides:")
        injected, skipped, dangling = inject_overrides(
            os.path.join(workdir, 'intermediate'), map_name, gamemode, ebx_rows)

        superbundles = bundles.generate_bundles(os.path.abspath(args.rimepath), mod_out)
        mod_generator.generate_mod(args.mod_name, args.mod_version, superbundles, mod_out)
    finally:
        os.chdir(previous_cwd)

    print(f"\noverrides injected: {injected}")
    if skipped:
        print(f"apply-to-blueprint partitions SKIPPED: {skipped} "
              f"(needs partition shadowing — see docs/bake-pipeline.md §5)")
    if dangling:
        print(f"WARNING: {dangling} dangling internal reference(s); these fail at load, not compile")
    print(f"mod: {mod_out}")


if __name__ == "__main__":
    main()
