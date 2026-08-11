#!/usr/bin/env python3
"""Translate PartitionSerializer JSON into the EBX JSON Rime compiles.

Two different JSON shapes are involved and they are not interchangeable:

  PartitionSerializer (inspector-facing, ext/Server/PartitionSerializer.lua)
      {"$guid", "$name", "$primaryInstance",
       "$instances": [ {"$guid", "$type", "$baseClass", "$fields": {"<Field>": <field>}} ]}

  Rime (LevelLoaderGen/templates/*.json, compiled by add_json_partition)
      {"PartitionGuid", "PrimaryInstanceGuid", "Name",
       "Instances": {"<guid>": {"$type": "T", "Field": value, ...}}}

Note the instance container is a LIST in one and a GUID-KEYED MAP in the other.

The conversion is mostly "unwrap the {$type,$value} envelope". The one piece of real logic is
reference rewriting: a runtime clone's members belong to no partition, so their references carry
the zero partition guid. Those are internal and must be repointed at the new partition; references
that carry a real partition guid are stock content and must stay external, or we would be copying
the game's own data into our bundle.

See docs/bake-pipeline.md §7 for the full field-shape table.
"""
import json

ZERO_GUID = "00000000-0000-0000-0000-000000000000"
# The serializer used to emit tostring(nil) here. Tolerated so partitions stored by an older
# build still convert.
_LOCAL_PARTITION_MARKERS = {ZERO_GUID, "", "nil", "null", "none"}


def _is_local_partition(guid) -> bool:
    return str(guid).strip().lower() in _LOCAL_PARTITION_MARKERS


def _convert_ref(value, partition_guid):
    """{"$instanceGuid","$partitionGuid"} -> {"PartitionGuid","InstanceGuid"}."""
    if not isinstance(value, dict) or value.get("$instanceGuid") is None:
        return None

    ref_partition = value.get("$partitionGuid")
    if _is_local_partition(ref_partition):
        ref_partition = partition_guid

    return {
        "PartitionGuid": str(ref_partition),
        "InstanceGuid": str(value["$instanceGuid"]),
    }


def _convert_element(element, element_type, partition_guid):
    """One member of an array field."""
    if isinstance(element, dict):
        if element.get("$instanceGuid") is not None:
            return _convert_ref(element, partition_guid)

        # Inline struct member: _SerializeFields emits the bare field map, with no envelope, and
        # that is exactly what Rime wants. Do NOT add a "$type" here — it resolves the element
        # type from the field's declared array type and rejects the key outright:
        #   Could not find member '$type' on object of type 'EventConnection'
        # ($type belongs on instances, per LevelLoaderGen/templates/*.json, not on struct members.)
        return {k: convert_field(v, partition_guid) for k, v in element.items()}

    return element


def convert_field(field, partition_guid):
    """Unwrap one PartitionSerializer field into a plain Rime value."""
    if field is None:
        return None

    if not isinstance(field, dict):
        return field

    if field.get("$array"):
        return [
            _convert_element(e, field.get("$type"), partition_guid)
            for e in (field.get("$value") or [])
        ]

    if field.get("$enum"):
        # Numeric form: always present, and unambiguous where an enum name might not be.
        return field.get("$value")

    if field.get("$ref"):
        # A null reference omits $value entirely.
        return _convert_ref(field.get("$value"), partition_guid)

    value = field.get("$value")

    # Vec2/3/4, LinearTransform and inline structs are all "map of name -> field", so one
    # recursive rule covers them: Vec3's x/y/z are themselves Single fields, and unwrapping them
    # yields {"x": 1.0, ...} exactly as Rime wants.
    if isinstance(value, dict):
        return _drop_nulls({k: convert_field(v, partition_guid) for k, v in value.items()})

    return value


def _drop_nulls(mapping):
    """Remove keys whose value is None.

    Rime's generated types default their struct-valued fields to `new()`, so an explicit null
    REPLACES a usable default with nothing and the writer dereferences it:

        NullReferenceException at fb.OutputNodeData.Serialize   (In.Serialize(...))

    PartitionSerializer emits `{"$type":T,"$ref":true}` with no `$value` both for genuinely null
    references AND as its fallback for any field it could not read — audio graph ports being the
    case that bites. The two are indistinguishable downstream, so omit the key and let Rime supply
    its own default, which is correct for both.
    """
    return {k: v for k, v in mapping.items() if v is not None}


def convert_instance(instance, partition_guid):
    out = {"$type": instance.get("$type")}
    for name, field in (instance.get("$fields") or {}).items():
        converted = convert_field(field, partition_guid)
        if converted is not None:
            out[name] = converted
    return out


def convert_partition(serialized, partition_guid, name, primary_instance_guid=None):
    """Full partition translation.

    partition_guid is the guid the partition will have in OUR bundle; internal references are
    rewritten to it.
    """
    instances = {}
    for instance in serialized.get("$instances") or []:
        guid = instance.get("$guid")
        if guid is None:
            continue
        instances[str(guid).lower()] = convert_instance(instance, partition_guid)

    primary = primary_instance_guid or serialized.get("$primaryInstance") or ""

    return {
        "PartitionGuid": partition_guid,
        "PrimaryInstanceGuid": str(primary).lower(),
        "Name": name,
        "Instances": instances,
    }


def dangling_references(converted):
    """Internal references that point at an instance the partition does not contain.

    A dangling pointer compiles fine and fails at load, so it is worth checking before shipping a
    bundle rather than after.
    """
    guids = {g.lower() for g in converted["Instances"]}
    partition_guid = str(converted["PartitionGuid"]).lower()
    missing = []

    def walk(node, path):
        if isinstance(node, dict):
            if "InstanceGuid" in node and "PartitionGuid" in node:
                if str(node["PartitionGuid"]).lower() == partition_guid \
                        and str(node["InstanceGuid"]).lower() not in guids:
                    missing.append((path, node["InstanceGuid"]))
                return
            for k, v in node.items():
                walk(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]")

    walk(converted["Instances"], "")
    return missing


if __name__ == "__main__":
    import argparse
    import sys

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="PartitionSerializer JSON file ('-' for stdin)")
    ap.add_argument("--partition-guid", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", help="output file (default stdout)")
    ap.add_argument("--check", action="store_true", help="report dangling internal references")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == '-' else open(args.input).read()
    converted = convert_partition(json.loads(raw), args.partition_guid, args.name)

    if args.check:
        missing = dangling_references(converted)
        print(f"instances: {len(converted['Instances'])}, dangling refs: {len(missing)}",
              file=sys.stderr)
        for path, guid in missing[:10]:
            print(f"  {path} -> {guid}", file=sys.stderr)

    text = json.dumps(converted, indent=1)
    if args.out:
        with open(args.out, 'w') as f:
            f.write(text)
    else:
        print(text)
