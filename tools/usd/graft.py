#!/usr/bin/env python3
"""Build our level using the SHIPPED building's blueprint, with only its mesh swapped for ours.

Thirteen attempts at matching a working blueprint field by field all died the same way, so this
comes at it from the other end: start from a blueprint the engine demonstrably accepts, change one
thing, and see whether it still loads.

It keeps the donor's physics description entirely -- its PhysicsEntityData, its rigid body, and its
HavokAsset naming the donor's own shipped collision. If this loads, the physics description is not
what kills us and the fault is elsewhere in our blueprint. If it dies, our MESH is implicated
rather than the physics.
"""
import json
import sys


def graft(donor_path, out_path, mesh_partition, mesh_instance, name):
    donor = json.load(open(donor_path))
    donor['Name'] = name
    swapped = 0

    for inst in donor['Instances'].values():
        if inst.get('$type') != 'StaticModelEntityData':
            continue

        inst['Mesh'] = {'PartitionGuid': mesh_partition, 'InstanceGuid': mesh_instance}
        swapped += 1

    json.dump(donor, open(out_path, 'w'), indent=1)
    print('grafted %s: %d mesh reference(s) swapped, %d instances kept'
          % (name, swapped, len(donor['Instances'])))
    return donor['PartitionGuid'], donor['PrimaryInstanceGuid']


if __name__ == '__main__':
    print(graft(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]))
