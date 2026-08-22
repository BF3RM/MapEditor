#!/usr/bin/env python3
"""Bake the blueprint SHELL POOL that makes live per-instance preview possible.

Why this exists
---------------
A per-instance edit is shown by respawning the object from a runtime clone. That works for static
objects and cannot work for networked ones: `CreateEntitiesFromBlueprint` will not build a
networked entity from a synthesized blueprint, and making it "known" (AddRegistry, the level's
blueprintRegistry, Partition:AddInstance, ReplaceInstance) crashes the realm instead --
`docs/vehicle-edit-crash.md` has the measurements.

The narrow rule that came out of it (`docs/bake-pipeline.md` §10): only the blueprint being SPAWNED
must be a genuine baked resource. Everything it REFERENCES may be synthesized. Measured: a baked
LAV25 blueprint whose object.components[1].vehicleConfig pointed at a runtime ShallowCopy carrying
gravityModifier = -1.0 spawned normally.

So we bake empty VehicleBlueprint shells. At edit time MapEditor claims one, points its `object` at
the clone it already builds, and spawns the instance from the shell. Nothing else changes.

Constraints this file obeys (each learned the hard way -- see docs/bake-pipeline.md §8)
--------------------------------------------------------------------------------------
* NEVER emit `null` for a field. Rime defaults omitted fields; an explicit null replaces a working
  default with nothing and the writer dies on a bare NullReferenceException. The shells want
  `Object` unset, so the key is OMITTED, not set to null.
* `$type` belongs on instances only, never on inline struct members.
* Superbundle and bundle names must start with `Win32/`; the runtime MountSuperBundle call omits
  that prefix (VU's custom-content guide, and Terrain_Tools_Baked does exactly this).

Guids are deterministic (uuid5 over a fixed namespace), so every realm derives the same values and
the runtime can be handed a manifest instead of discovering anything. Re-running with the same
count reproduces the same bundle.

Usage
-----
    tools/shells/generate_shells.py --count 256
    tools/shells/generate_shells.py --count 1 --keep-intermediate   # bring-up / debugging
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# Fixed namespace -> deterministic guids. Changing this invalidates every previously baked shell,
# so it must not be regenerated casually.
NAMESPACE = uuid.UUID("6f1f0c2e-7c1a-4d5e-9a3b-2f4c8d1e5a70")

SB_NAME = "Win32/mapeditor/shells"        # mod.json + Rime
BUNDLE_NAME = "Win32/mapeditor/shellsb"   # inner bundle, distinct from the superbundle name
MOUNT_NAME = "mapeditor/shells"           # what MountSuperBundle takes (no Win32/ prefix)
BUNDLE_MOUNT_NAME = "mapeditor/shellsb"   # what goes into the level's bundle list, likewise

PARTITION_PREFIX = "mapeditor/shells/shell_"


def shell_guids(index):
    """(partitionGuid, instanceGuid) for shell `index` -- stable across machines and runs."""
    partition = uuid.uuid5(NAMESPACE, "partition/%d" % index)
    instance = uuid.uuid5(NAMESPACE, "instance/%d" % index)
    return str(partition), str(instance)


def descriptor_guid(index):
    """Guid of the shell's InterfaceDescriptorData, which lives in the same partition."""
    return str(uuid.uuid5(NAMESPACE, "descriptor/%d" % index))


def shell_partition(index):
    """One shell partition, as the EBX JSON Rime compiles.

    A VehicleBlueprint with NO `object`. `needNetworkId` is true so the runtime spawn path treats it
    as the networked blueprint it is standing in for. Note `Object` is absent rather than null --
    see the module docstring.
    """
    partition_guid, instance_guid = shell_guids(index)
    desc_guid = descriptor_guid(index)
    name = "%s%03d" % (PARTITION_PREFIX, index)

    return {
        "PartitionGuid": partition_guid,
        "PrimaryInstanceGuid": instance_guid,
        "Name": name,
        "Instances": {
            # Every real blueprint carries one. A shell without it loaded fine and then produced no
            # entity bus; diffing a shell against LAV25 showed `descriptor` as the last field still
            # differing once the entity-bus flags were fixed. Empty arrays -- the shell has no
            # interface of its own.
            desc_guid: {
                "$type": "InterfaceDescriptorData",
                "Fields": [],
                "InputEvents": [],
                "OutputEvents": [],
                "InputLinks": [],
                "OutputLinks": [],
            },
            instance_guid: {
                "$type": "VehicleBlueprint",
                "Name": "MapEditor/Shells/Shell_%03d" % index,
                "PropertyConnections": [],
                "LinkConnections": [],
                "EventConnections": [],
                "NeedNetworkId": True,
                # LAV25 has this true; a shell with it false loaded fine and produced no entity
                # bus. It was the last field still differing once the flags and descriptor matched.
                "InterfaceHasConnections": True,
                # These MUST be true. They default to false in ObjectBlueprint.json, which is a
                # template for static objects a level REFERENCES -- not for a blueprint spawned
                # directly. With them false, CreateEntitiesFromBlueprint returns nil: no entity bus,
                # which is exactly what the field name says. Diffing a shell against a real
                # VehicleBlueprint (LAV25) is what surfaced it.
                "AlwaysCreateEntityBusClient": True,
                "AlwaysCreateEntityBusServer": True,
                "Descriptor": {
                    "PartitionGuid": partition_guid,
                    "InstanceGuid": desc_guid,
                },
            }
        },
    }


def write_manifest(count, path):
    """A Lua table the pool reads, so the runtime never has to discover what it mounted."""
    lines = [
        "-- GENERATED by tools/shells/generate_shells.py -- do not edit by hand.",
        "--",
        "-- The baked shell pool: empty VehicleBlueprint partitions used as per-instance spawn",
        "-- roots for live preview of networked objects. See docs/bake-pipeline.md §10.",
        "",
        "return {",
        # Mount name omits the Win32/ prefix that mod.json and Rime use; the inner bundle is a
        # separate name that has to be added to the level's bundle list to actually load.
        "\tsuperBundle = '%s'," % MOUNT_NAME,
        "\tbundle = '%s'," % BUNDLE_MOUNT_NAME,
        "\tcount = %d," % count,
        "\tshells = {",
    ]
    for i in range(count):
        partition_guid, instance_guid = shell_guids(i)
        lines.append("\t\t{ partition = '%s', instance = '%s' }," % (partition_guid, instance_guid))
    lines += ["\t},", "}", ""]

    with open(path, "w") as handle:
        handle.write("\n".join(lines))
    print("manifest -> %s (%d shells)" % (path, count))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--count", type=int, default=256, help="number of shells to bake")
    parser.add_argument("--rime", default=os.path.expanduser("~/Projects/Rime/bin/Release/RimeREPL"),
                        help="path to the RimeREPL binary (native ELF; see docs/bake-pipeline.md §2)")
    parser.add_argument("--intermediate", default=os.path.join(HERE, "intermediate"),
                        help="scratch dir for the generated EBX JSON + command file")
    parser.add_argument("--keep-intermediate", action="store_true",
                        help="do not delete the scratch dir (useful when a compile fails)")
    parser.add_argument("--manifest", default=os.path.join(MOD_ROOT, "ext", "Shared", "ShellManifest.lua"))
    parser.add_argument("--sb-out", default=os.path.join(MOD_ROOT, "sb"))
    args = parser.parse_args()

    if not os.path.isfile(args.rime):
        sys.exit("RimeREPL not found at %s\nBuild it per docs/bake-pipeline.md §2." % args.rime)

    json_dir = os.path.join(args.intermediate, "ebx_json")
    os.makedirs(json_dir, exist_ok=True)
    os.makedirs(args.sb_out, exist_ok=True)

    commands = [
        'build_sb %s Frostbite2_0 "%s"' % (SB_NAME, args.sb_out),
        "build_bundle %s" % BUNDLE_NAME,
    ]

    for i in range(args.count):
        partition = shell_partition(i)
        json_path = os.path.join(json_dir, "shell_%03d.json" % i)
        with open(json_path, "w") as handle:
            json.dump(partition, handle, indent=2)
        commands.append('add_json_partition %s "%s"' % (partition["Name"], json_path))

    # Two builds: the first closes the bundle, the second writes the superbundle.
    commands += ["build", "build", ""]

    commands_path = os.path.join(args.intermediate, "commands.txt")
    with open(commands_path, "w") as handle:
        handle.write("\n".join(commands))

    print("compiling %d shell(s) with Rime..." % args.count)
    env = dict(os.environ)
    env.setdefault("DOTNET_ROOT", os.path.expanduser("~/.dotnet"))
    result = subprocess.run([args.rime, commands_path], env=env,
                            capture_output=True, text=True)

    output = (result.stdout or "") + (result.stderr or "")
    print(output.strip()[-4000:])

    # Rime exits 0 even when a partition fails to compile, so check the output rather than the code.
    failed = result.returncode != 0 or "Exception" in output or "Could not" in output
    if failed:
        print("\nRime reported a problem -- intermediate kept at %s" % args.intermediate)
        sys.exit(1)

    write_manifest(args.count, args.manifest)

    produced = []
    for root, _dirs, files in os.walk(args.sb_out):
        for name in files:
            produced.append(os.path.relpath(os.path.join(root, name), args.sb_out))
    print("superbundle files: %s" % (sorted(produced) or "NONE -- the bake produced nothing"))
    if not produced:
        sys.exit("no superbundle written; refusing to claim success")

    if not args.keep_intermediate:
        shutil.rmtree(args.intermediate, ignore_errors=True)

    print("\nDone. Add %r to mod.json Superbundles; the runtime mounts %r." % (SB_NAME, MOUNT_NAME))


if __name__ == "__main__":
    main()
