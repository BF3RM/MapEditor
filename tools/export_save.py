#!/usr/bin/env python3
"""Export a MapEditor project from mod.db into the JSON file LevelLoaderGen bakes.

MapEditor stores a project across two tables — `project_header` (name, map, gamemode,
requiredBundles) and `project_data` (the object list as JSON). LevelLoaderGen wants one file
shaped `{"header": {...}, "data": [...]}` in its `in/map_saves/` folder. This bridges the two;
nothing about the save format itself has to change.

Field names matter and are not all the same as the column names — the generator reads
`header.mapName` and `header.gameModeName` (capital M), and iterates `data` as a LIST.

Usage:
    export_save.py --list
    export_save.py --project PH394 --out ./in/map_saves/MP_001_PH394.json
    export_save.py --id 15 --out -            # '-' writes to stdout
"""
import argparse
import json
import os
import sqlite3
import sys

DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mod.db')


def connect(db_path):
    if not os.path.exists(db_path):
        sys.exit(f"error: no database at {db_path}")
    # Read-only: the server may well have this file open, and an exporter has no business
    # writing to it.
    return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)


def list_projects(con):
    rows = con.execute(
        "SELECT id, project_name, map_name, gamemode_name, save_version, timestamp "
        "FROM project_header ORDER BY id DESC"
    ).fetchall()
    if not rows:
        print("no saved projects")
        return
    print(f"{'id':>4}  {'project':<28} {'map':<12} {'gamemode':<16} {'ver':<8} objects")
    for pid, name, map_name, gm, ver, _ts in rows:
        n = con.execute(
            "SELECT COUNT(*) FROM project_data WHERE project_header_id=?", (pid,)
        ).fetchone()[0]
        print(f"{pid:>4}  {str(name):<28} {str(map_name):<12} {str(gm):<16} {str(ver):<8} {n} blob(s)")


def load_project(con, pid):
    row = con.execute(
        "SELECT id, project_name, map_name, gamemode_name, required_bundles, timestamp, save_version "
        "FROM project_header WHERE id=?", (pid,)
    ).fetchone()
    if row is None:
        sys.exit(f"error: no project with id {pid}")

    _id, name, map_name, gamemode, required_bundles, timestamp, save_version = row

    blobs = con.execute(
        "SELECT save_file_json FROM project_data WHERE project_header_id=? ORDER BY id", (pid,)
    ).fetchall()

    # A project's objects may be split across several rows; the generator wants one flat list.
    objects = []
    for (blob,) in blobs:
        parsed = json.loads(blob)
        if isinstance(parsed, list):
            objects.extend(parsed)
        elif isinstance(parsed, dict):
            # Older/alternate shape: a guid-keyed map. Values are the objects.
            objects.extend(parsed.values())
        else:
            sys.exit(f"error: unexpected save_file_json shape: {type(parsed).__name__}")

    try:
        bundles = json.loads(required_bundles) if required_bundles else {}
    except (TypeError, ValueError):
        bundles = {}

    header = {
        "projectName": name,
        "timeStamp": timestamp,
        "mapName": map_name,
        # Capital M: LevelLoaderGen reads header['gameModeName'].
        "gameModeName": gamemode,
        "requiredBundles": bundles,
        "saveVersion": save_version,
    }
    return {"header": header, "data": objects}


def resolve_id(con, args):
    if args.id is not None:
        return args.id
    row = con.execute(
        "SELECT id FROM project_header WHERE project_name=? ORDER BY id DESC LIMIT 1",
        (args.project,)
    ).fetchone()
    if row is None:
        sys.exit(f"error: no project named {args.project!r} (try --list)")
    return row[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB, help="path to mod.db")
    ap.add_argument("--list", action="store_true", help="list saved projects and exit")
    ap.add_argument("--project", help="project name (newest match wins)")
    ap.add_argument("--id", type=int, help="project_header id")
    ap.add_argument("--out", help="output file, or '-' for stdout")
    args = ap.parse_args()

    con = connect(os.path.abspath(args.db))

    if args.list:
        list_projects(con)
        return

    if args.project is None and args.id is None:
        sys.exit("error: give --project NAME or --id N (or --list)")

    payload = load_project(con, resolve_id(con, args))
    con.close()

    text = json.dumps(payload, indent=1)

    if args.out is None or args.out == '-':
        print(text)
    else:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w') as f:
            f.write(text)
        h = payload["header"]
        print(f"wrote {args.out}: {len(payload['data'])} object(s), "
              f"map={h['mapName']} gamemode={h['gameModeName']} "
              f"bundles={len(h['requiredBundles'])}")


if __name__ == "__main__":
    main()
