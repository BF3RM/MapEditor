#!/usr/bin/env python3
"""Emit a BF3 bundle from a USD level stage -- carrying only what CHANGED.

The other direction from export_level_usd.py, and the reason it is worth having in this shape: a
level built from a stage does not need to contain the game's own assets. Every prototype is
re-serialised and compared against the resource it came from; one that matches byte for byte is
REFERENCED rather than shipped, so a custom level's bundle holds the author's meshes and nothing of
DICE's. It also keeps the bundle small -- an unmodified level emits no geometry at all.

    level_to_bf3.py <stage.usdc> <corpus dir> <out dir> [--host mp001]

What it writes is a Rime command list, the same shape build_dust2 produces.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'havok'))

import json                                                                # noqa: E402
import bf3_usd                                                             # noqa: E402
import level_from_usd                                                      # noqa: E402
from meshset import MeshSet                                                # noqa: E402


def _safe(name):
    out = ''.join(c if (c.isalnum() or c == '_') else '_' for c in name)
    return ('_' + out) if (not out or out[0].isdigit()) else out


def _has_fourcc(path):
    """Whether a DDS is block-compressed.

    Rime's texture importer reads the format from the FourCC and throws "The provided DDS had no
    FourCC code" on an uncompressed one -- which aborts the whole build, not just that texture. The
    game ships both kinds, so the uncompressed ones are skipped rather than allowed to take the
    build down; they would need re-encoding to travel.
    """
    import struct

    try:
        with open(path, 'rb') as fh:
            head = fh.read(88)
    except Exception:                                        # noqa: BLE001
        return False

    if len(head) < 88 or head[:4] != b'DDS ':
        return False

    flags = struct.unpack_from('<I', head, 80)[0]
    return bool(flags & 0x4) and head[84:88] not in (b'\x00\x00\x00\x00',)


def _bindings_for(stage_path, mesh_name):
    """material_index -> {slot: texture resource}, read back off the stage's material prims."""
    from pxr import Usd, UsdShade

    proto = os.path.join(os.path.dirname(os.path.abspath(stage_path)), 'meshes',
                         _safe(mesh_name) + '.usdc')

    if not os.path.exists(proto):
        return {}

    stage = Usd.Stage.Open(proto)
    out = {}

    for prim in stage.Traverse():
        if not prim.IsA(UsdShade.Material):
            continue

        mi = prim.GetCustomDataByKey('bf3MaterialIndex')

        if mi is None:
            continue

        slots = {}

        for child in prim.GetChildren():
            res = child.GetCustomDataByKey('bf3:resource')

            if res and not str(res).startswith('external:'):
                slots[child.GetName()] = str(res)

        if slots:
            out[int(mi)] = slots

    return out


def _texture_slots(stage_path, mesh_name, material_index):
    """The texture resources a mesh's material binds, read back off the stage."""
    from pxr import Usd, UsdShade

    proto = os.path.join(os.path.dirname(os.path.abspath(stage_path)), 'meshes',
                         _safe(mesh_name) + '.usdc')

    if not os.path.exists(proto):
        return []

    stage = Usd.Stage.Open(proto)
    out = []

    for prim in stage.Traverse():
        if not prim.IsA(UsdShade.Material):
            continue

        if prim.GetCustomDataByKey('bf3MaterialIndex') != material_index:
            continue

        for child in prim.GetChildren():
            res = child.GetCustomDataByKey('bf3:resource')

            if res and not str(res).startswith('external:'):
                out.append(str(res))

    return out


def _as_linear_transform(t):
    """BF3's LinearTransform as EBX JSON wants it: four named vectors, not a flat array.

    level_from_usd hands back the 12 floats in BF3's own order (right, up, forward, trans) because
    that is the compact form; the EBX serialiser needs the object, and given the array it aborts the
    whole build with "Cannot deserialize the current JSON array into type 'fb.LinearTransform'".
    """
    return {'right': {'x': float(t[0]), 'y': float(t[1]), 'z': float(t[2])},
            'up': {'x': float(t[3]), 'y': float(t[4]), 'z': float(t[5])},
            'forward': {'x': float(t[6]), 'y': float(t[7]), 'z': float(t[8])},
            'trans': {'x': float(t[9]), 'y': float(t[10]), 'z': float(t[11])}}


def _materials_from_stage(proto_path):
    """The MeshMaterial records the stage carries, in material_index order.

    Written by the exporter into each material prim's bf3Material customData, alongside a
    bf3:ShaderGraph node in the "bf3" render context. Reading them back is what makes shader
    fidelity survive BOTH directions -- without it the emitter substitutes one hardcoded template
    and every material in the level comes out with the same constants.
    """
    from pxr import Usd, UsdShade

    stage = Usd.Stage.Open(proto_path)
    found = {}

    for prim in stage.Traverse():
        if not prim.IsA(UsdShade.Material):
            continue

        raw = prim.GetCustomDataByKey('bf3Material')

        if not raw:
            continue

        # The authored index, not the prim name: the name counts DISTINCT materials, so two
        # subsets sharing one make the two disagree.
        mi = prim.GetCustomDataByKey('bf3MaterialIndex')

        if mi is None:
            continue

        try:
            found[int(mi)] = json.loads(raw)
        except (ValueError, TypeError):
            continue

    if not found:
        return None

    return [found.get(i) for i in range(max(found) + 1)]


def shipped_index(res_dir):
    """mesh name (lowercased) -> the bytes the game ships, so 'changed' is a byte comparison."""
    import glob

    index = {}

    for path in sorted(glob.glob(os.path.join(res_dir, '*.bin'))):
        data = open(path, 'rb').read()

        if not data:
            continue

        try:
            ms = MeshSet.parse(data)
        except Exception:                                    # noqa: BLE001
            continue

        if ms.name:
            index[ms.name.lower()] = data

    return index


def variation_index(ebx_dir, partitions):
    """-> {(mesh blueprint partition, instance, rounded transform): ObjectVariation ref}.

    The placement list this emitter works from is bare transforms, so the variation a placement was
    authored with is not in it -- and 199 of MP_001's 1840 explicit ReferenceObjectData carry one.
    Dropping them puts every object on its default variation, which is a silent visual difference
    rather than a failure.

    The source ReferenceObjectData have both the blueprint and the transform, so a placement is
    matched back to its original by those. Transforms are rounded before comparing: they survive the
    USD round trip as float64 and the EBX stores float32, so an exact match finds nothing.
    """
    import json as _json
    import os as _os

    index = {}

    for part in partitions:
        f = _os.path.join(ebx_dir, part + '.json')

        if not _os.path.exists(f):
            continue

        try:
            doc = _json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        for inst in (doc.get('Instances') or {}).values():
            if inst.get('$type') != 'ReferenceObjectData' or not inst.get('ObjectVariation'):
                continue

            bp, t = inst.get('Blueprint'), inst.get('BlueprintTransform')

            if not bp or not isinstance(t, dict):
                continue

            index[_placement_key(bp['PartitionGuid'], bp['InstanceGuid'], t)] = \
                inst['ObjectVariation']

    return index


def _placement_key(pg, ig, transform):
    """A placement's identity: its blueprint plus its position, to a millimetre."""
    tr = transform.get('trans') or {}
    return (str(pg).lower(), str(ig).lower(),
            round(float(tr.get('x', 0.0)), 3), round(float(tr.get('y', 0.0)), 3),
            round(float(tr.get('z', 0.0)), 3))


def blueprint_index(bp_dir):
    """-> {blueprint partition name: (partition guid, primary instance guid)}.

    A mesh that comes through the round trip UNCHANGED does not need a blueprint of our own: the
    game already ships one, and its ObjectBlueprint partition is the mesh's name without the
    '_Mesh' suffix (MEASURED -- all 527 of MP_001's meshes resolve that way, and every one of them
    has an ObjectBlueprint as its primary instance). Referencing that and placing against it keeps
    DICE's bytes out of the bundle entirely.
    """
    import json as _json
    import os as _os

    index = {}

    for name in _os.listdir(bp_dir):
        try:
            doc = _json.load(open(_os.path.join(bp_dir, name)))
        except Exception:                                    # noqa: BLE001
            continue

        if doc.get('Name') and doc.get('PartitionGuid') and doc.get('PrimaryInstanceGuid'):
            index[doc['Name'].lower()] = (doc['PartitionGuid'], doc['PrimaryInstanceGuid'])

    return index


def emit(stage_path, corpus, out_dir, host='mp001', bundle_name='UsdLevel',
         texture_dir=None, terrain_of=None, reference_parts=None, roads=None,
         ebx_dir=None, level_sb=None, sb_dir=None, max_meshes=None, skip_meshes=0,
         max_per_mesh=None, blueprint_dir=None, texture_edits=None,
         ship_textures=False, reference_closure=False):
    os.makedirs(out_dir, exist_ok=True)
    index = shipped_index(os.path.join(corpus, 'res'))
    protos, placements, stats = level_from_usd.read(stage_path)
    stage_dir = os.path.dirname(os.path.abspath(stage_path))

    # A bisecting knob, not a feature. The emitted bundle builds clean and then the engine never
    # finishes opening it, and the only way to find which piece of the content does that is to ship
    # fewer pieces. Placements go with their prototypes: a placement whose mesh was dropped is a
    # dangling reference, which is a different failure than the one being chased.
    if max_meshes is not None or skip_meshes:
        # skip_meshes takes a DIFFERENT slice of the same size, which is what separates "too many
        # meshes" from "one bad mesh": if the first 232 hang and the last 232 load, the count is
        # not the problem and the fault is a specific prototype.
        ordered = sorted(protos)[skip_meshes:]
        keep = set(ordered[:max_meshes] if max_meshes is not None else ordered)
        protos = {k: v for k, v in protos.items() if k in keep}
        placements = {k: v for k, v in placements.items() if k in keep}

    if max_per_mesh is not None:
        # Same meshes, fewer copies of each. Holding the mesh count and cutting the placements is
        # what separates "too many distinct assets" from "too many objects in the world" -- the two
        # scale together in a real level and cannot be told apart without breaking the tie.
        placements = {k: v[:max_per_mesh] for k, v in placements.items()}
        print('LIMIT     %d prototype(s) of %d (bisect)' % (len(protos), len(keep) and len(protos)))

    import build_dust2

    build_dust2.configure(host)
    # WHERE the bundle is built decides whether the level loads at all, and this is not a detail.
    #
    # A bundle in its OWN superbundle can only reach the level by being mounted and prepended onto
    # the level's bundle list at runtime, from Lua. That path does not work: it kills the server
    # during level load, before Level:Loaded. MEASURED in an isolated instance, same level, same
    # everything else --
    #
    #     REALITYMOD + Blank_Level_Test                    -> Level:Loaded, "Running"
    #     REALITYMOD + Blank_Level_Test + mount/prepend     -> exits at "prepending", no Level:Loaded
    #     dust2 built INTO Win32/Levels/REALITYMOD/REALITYMOD, no mount/prepend
    #                                                       -> Level:Loaded, "Running"
    #
    # The middle row used the bundle that had ALREADY been verified in-game (standing on its
    # collision), so this was never about the content being wrong. Blank_Level_Test's own notes say
    # the same thing about its shaderdb: it "just needs to live INSIDE the MAIN REALITYMOD
    # superbundle -- no Lua mount/prepend needed (the prepend was unnecessary and hung the client)".
    #
    # READ THE THIRD ROW NARROWLY. It says the superbundle BUILDS without breaking the level; it
    # does not say the content loaded. Nothing referenced that bundle, so the engine never opened
    # it -- the level's LoadBundles list held only Levels/REALITYMOD/REALITYMOD. Getting the engine
    # to open it needs a SubWorldReferenceObjectData in the level's own LevelData naming this
    # bundle. Check the LoadBundles list for your own bundle before believing a green Level:Loaded.
    #
    # So `level_sb` names the level's OWN superbundle and the content is built as a bundle inside
    # it, resident when the level loads. Passing None falls back to a standalone superbundle, which
    # is only useful for inspecting the output -- it will not load.
    build_dust2_sb = level_sb or ('Win32/%s/%s' % (bundle_name, bundle_name))
    build_dust2_bundle = 'Win32/Levels/REALITYMOD/%s' % bundle_name.lower()

    # The world partition has to be NAMED AFTER THE BUNDLE, because that is how a sub-level is
    # found. A SubWorldReferenceObjectData carries a bundle name and a null blueprint, and the
    # engine resolves the SubWorldData out of the bundle by that name; there is no other link
    # between the two.
    #
    # The HOSTS table calls it 'dust2/world', which was right for the old design where the bundle
    # was mounted and prepended at runtime and nothing had to resolve it by name. Under the
    # sub-level design that name resolves to nothing and the server exits ~1s into the level load,
    # silently, with exit code 0.
    #
    # MEASURED by bisecting the emitted content down to nothing: a bundle with 462 meshes, one with
    # 3, and one with ZERO content all failed identically, which is only possible if the failure is
    # in how the bundle is addressed rather than in what it holds. The shipped dust2 build gets this
    # right -- bundle Win32/Levels/REALITYMOD/dust2, world partition levels/realitymod/dust2.
    if level_sb:
        build_dust2.WORLD_NAME = 'levels/realitymod/%s' % bundle_name.lower()

    referenced, changed, unresolved = [], [], []

    for name in sorted(protos):
        proto = os.path.join(stage_dir, 'meshes', _safe(name) + '.usdc')

        if not os.path.exists(proto):
            unresolved.append(name)
            continue

        try:
            ms, chunks = bf3_usd.load(proto)
            payload, meta = ms.serialize()
            material_ebx = _materials_from_stage(proto)
        except Exception as exc:                             # noqa: BLE001
            unresolved.append('%s (%s)' % (name, exc))
            continue

        original = index.get(name.lower())

        if original is not None and payload == original:
            # Untouched. The GEOMETRY comes from the game -- add_existing_resource, no bytes of
            # ours -- but the EBX is still authored under our own namespace, exactly as a changed
            # mesh's is.
            #
            # Referencing the game's mesh and blueprint PARTITIONS instead was tried and the server
            # rejected the bundle outright, in under a second, at 64 meshes as well as 527: those
            # partitions already belong to the game, and a sub-level bundle cannot bring its own
            # copy of them. Authoring our own thin EBX that NAMES the game's resource keeps the
            # bytes out of the bundle without colliding with anything.
            referenced.append(name)
            changed.append((name, None, meta, ms, chunks, material_ebx))
            continue

        res_path = os.path.join(out_dir, _safe(name) + '.meshset')
        open(res_path, 'wb').write(payload)
        changed.append((name, res_path, meta, ms, chunks, material_ebx))

    # build_sb names the superbundle and build_bundle the bundle inside it; without both, the
    # command list adds resources to nothing and produces no output at all.
    # No select_game. It switches the REPL into a context where the build verbs are not
    # registered, so build_sb and everything after it fail with "Command not found" -- 2940 lines
    # of it, exit code 0, and no output at all. mount_game with true already selects the game.
    cmds = ['mount_game "%s" Frostbite2_0 true'
            % os.path.expanduser('~/.local/share/Steam/steamapps/common/Battlefield 3'),
            'build_sb %s Frostbite2_0 "%s"'
            % (build_dust2_sb, sb_dir or os.path.join(out_dir, 'sb')),
            'build_bundle %s' % build_dust2_bundle]

    # An unchanged mesh keeps the game's own mesh resource AND its own blueprint, and is PLACED
    # against that blueprint. Emitting no placement for it -- which is what happened while the
    # corpus could only compare 65 of 527 meshes -- means a correctly-referenced mesh never appears
    # in the world.
    extra = []                      # (blueprint partition, blueprint instance, transform[, var])
    var_index = variation_index(ebx_dir, reference_parts or []) if ebx_dir else {}
    matched_vars = 0

    if referenced:
        print('referenced %d mesh resource(s) -- the game supplies the geometry' % len(referenced))

    # EBX for the meshes we ship. A referenced mesh keeps the game's own blueprint, so nothing is
    # authored for it; a changed one needs its mesh asset, its blueprint, and a placement.
    import build_dust2
    import json
    import uuid

    build_dust2.configure(host)

    # configure() resets the naming, including WORLD_NAME, so the sub-level name set above has to
    # be re-applied after it. Setting it once before this call left the emitted world partition
    # named 'dust2/world' and the sub-level unresolvable -- silently, since a build that names a
    # partition nothing else refers to is still a valid build.
    if level_sb:
        build_dust2.WORLD_NAME = 'levels/realitymod/%s' % bundle_name.lower()

    part_dir = os.path.join(out_dir, 'partitions')
    os.makedirs(part_dir, exist_ok=True)
    mvdb_inputs = []
    tex_index = {}
    flat_name = 'flat_normal'

    for name, res_path, meta, ms, chunks, material_ebx in changed:
        saved = (build_dust2.MESH_NAME, build_dust2.BLUEPRINT_NAME)
        globals_ = vars(build_dust2)
        globals_['MESH_NAME'] = name
        globals_['BLUEPRINT_NAME'] = name.rsplit('/', 1)[0] + '/blueprint_' + _safe(
            name.rsplit('/', 1)[-1])

        # One MeshMaterial per MATERIAL INDEX, not per subset. Subsets share materials -- MP_001's
        # 1354 subsets use 889 materials -- and emitting one each both bloats the EBX and leaves the
        # duplicates with no record to carry, so they fall back to the template.
        by_index = {}

        for lod in ms.lods[:1]:
            for sub in lod.subsets:
                by_index.setdefault(sub.material_index, sub.material_name)

        names = [by_index.get(i, 'material%d' % i) for i in range(max(by_index) + 1)] \
            if by_index else []
        mesh_json, mesh_pg, mesh_g, _mats = build_dust2.mesh_partition(names, material_ebx)
        slots_by_index = _bindings_for(stage_path, name)
        binding = {names[i]: (slots_by_index.get(i) or {}).get('Diffuse')
                   for i in range(len(names))}
        binding = {k: v for k, v in binding.items() if v}
        mvdb_inputs.append((name, mesh_pg, mesh_g, _mats, names, binding))
        bp_json, bp_pg, bp_g = build_dust2.blueprint_partition(mesh_pg, mesh_g,
                                                               with_physics=False)

        for obj, fname in ((mesh_json, 'mesh_%s.json' % _safe(name)),
                           (bp_json, 'bp_%s.json' % _safe(name))):
            path = os.path.join(part_dir, fname)
            json.dump(obj, open(path, 'w'), indent=1)

        if res_path is None:
            cmds.append('add_existing_resource %s 1' % name)
        else:
            cmds.append('add_resource %s MeshSet "%s" %s'
                        % (name, res_path, meta.hex().upper()))

        for li, chunk in sorted(chunks.items()) if res_path else []:
            guid = uuid.UUID(bytes_le=ms.lods[li].data_chunk_id)
            path = os.path.join(out_dir, '%s.chunk' % guid)
            data = chunk + b'\0' * ((-len(chunk)) % 16)
            open(path, 'wb').write(data)
            cmds.append('add_chunk %s %s "%s"' % (guid, name, path))

        cmds.append('add_json_partition %s "%s"'
                    % (build_dust2.MESH_NAME, os.path.join(part_dir, 'mesh_%s.json' % _safe(name))))
        cmds.append('add_json_partition %s "%s"'
                    % (build_dust2.BLUEPRINT_NAME,
                       os.path.join(part_dir, 'bp_%s.json' % _safe(name))))

        for t in placements.get(name, []):
            lt = _as_linear_transform(t)
            var = var_index.get(_placement_key(bp_pg, bp_g, lt))

            if var:
                matched_vars += 1

            extra.append((bp_pg, bp_g, lt, var))

        build_dust2.MESH_NAME, build_dust2.BLUEPRINT_NAME = saved

    if var_index:
        print('variations %d of %d source variations matched onto placements'
              % (matched_vars, len(var_index)))

    # The MVDB and the texture partitions.
    #
    # Without them the meshes are in the bundle and draw UNTEXTURED: BF3 resolves a mesh's material
    # bindings through the MeshVariationDatabase, not through the mesh's own EBX, so a bundle with
    # geometry and no database is a grey level.
    # NOT gated on texture_dir: slot names come from the stage, and referencing needs no local
    # bytes. Requiring the DDS directory here silently emitted ZERO texture partitions for any
    # level whose textures had not been extracted (MP_007 did exactly that and still said LOADED).
    if changed:
        # The slot NAMES come from the USD stage; a local .dds is only needed to SHIP a texture,
        # never to reference one. Gating the whole collection on the file existing meant a level
        # whose textures had not been extracted emitted ZERO texture partitions and loaded grey --
        # MP_017 did exactly that, silently, while still reporting LOADED.
        slots, shipped = set(), {}

        # `flat_normal` is OURS, not the game's -- a synthetic 4x4 normal map bound wherever a mesh
        # has no normal slot. It can never be referenced: `add_existing_resource flat_normal` fails
        # with "Could not find resource (flat_normal)", which contains no "error" and so slipped
        # past the build-log check silently. Generate it and ship it.
        _flat_dds = os.path.join(part_dir, '_flat_n.dds')
        build_dust2._write_flat_normal(_flat_dds)
        shipped[flat_name] = _flat_dds

        for name, _res, _meta, ms, _chunks, _ebx in changed:
            for lod in ms.lods[:1]:
                for sub in lod.subsets:
                    for slot in _texture_slots(stage_path, name, sub.material_index):
                        slots.add(slot)
                        if not texture_dir:
                            continue

                        src = os.path.join(texture_dir, slot.replace('/', '__') + '.dds')

                        if os.path.exists(src) and _has_fourcc(src):
                            shipped[slot] = src

        textures = build_dust2.texture_partitions({}, sorted(slots), flat_name)
        tex_index.update(textures)

        # A texture the level already uses is ALREADY ON THE PLAYER'S DISK. Shipping our own copy
        # of it is the single largest thing in the bundle: 636 textures, 492 MB of DDS, against 527
        # meshes that cost nothing because they are referenced. MEASURED: all 636 of MP_001's
        # texture slots resolve as resources in the mounted game.
        #
        # So the same rule the meshes follow applies here -- reference what was not edited, ship
        # only what was. `texture_edits` names the slots the caller actually changed; everything
        # else is taken from the game.
        # DEFAULT: reference the textures out of the player's own game install rather than
        # shipping copies. Measured on MP_001: 297,649,088 -> 7,221,728 bytes (41x smaller), and it
        # loads identically -- bundle in the level's list, full chain to "Running", zero errors.
        # It also means we ship none of the game's original art, only what was actually edited.
        #
        # All 636 textures MP_001 uses were confirmed present in the mounted game (add_existing_resource
        # prints "Could not find resource" and would fail loudly otherwise -- note that message does NOT
        # contain the word "error", so a build-log error grep will not catch it).
        #
        # An earlier run of this path was recorded as HANG. That was a stale second mod in the test
        # instance's ModList.txt loading the same bundle twice, not this code. ship_textures=True
        # restores the old behaviour if a level ever needs an edited texture shipped whole.
        edited = True if ship_textures else None
        referenced_tex = 0

        for base, (doc, _pg, _ig) in sorted(textures.items()):
            tex_json = os.path.join(part_dir, 'tex_%s.json' % _safe(base))

            # Ship when we hold the bytes AND either the caller edited it or we are in ship mode.
            # flat_normal is always ours, so it always ships.
            _mine = base == flat_name
            if base in shipped and (_mine or edited is True
                                    or (edited is not None and base in edited)):
                tex_name = build_dust2.texture_partition_name(base)
                json.dump(doc, open(tex_json, 'w'), indent=1)
                cmds.append('add_dds_texture %s "%s" true false false World_SkipNoStr'
                            % (tex_name, shipped[base]))
                cmds.append('add_json_partition %s "%s"' % (tex_name, tex_json))
                continue

            # Unedited: OUR partition, the GAME's bytes -- the same split the meshes use.
            #
            # The partition PATH stays ours so the MeshVariationDatabase's binding still resolves
            # (it binds the partition's guids). The TextureAsset's NAME is the game's resource
            # name, because that name is what the engine matches to a DxTexture. Dropping the
            # partition altogether left the MVDB binding pointing at nothing and the level hung.
            ref_doc = json.loads(json.dumps(doc))

            for inst in (ref_doc.get('Instances') or {}).values():
                if inst.get('$type') == 'TextureAsset':
                    inst['Name'] = base

            json.dump(ref_doc, open(tex_json, 'w'), indent=1)
            cmds.append('add_existing_resource %s 1' % base)
            cmds.append('add_json_partition %s "%s"'
                        % (build_dust2.texture_partition_name(base), tex_json))
            referenced_tex += 1

        print('textures  %d referenced from the game, %d shipped (%d slot(s) from the stage)'
              % (referenced_tex, len(textures) - referenced_tex, len(slots)))

    # Roads. Read from the stage as ribbons and written back as RoadData -- the writer has existed
    # since the emitter learned about splines, it was simply never called from here.
    if roads:
        road_name = 'levels/realitymod/%s/roads' % bundle_name.lower()
        saved_world = build_dust2.WORLD_NAME
        road_json, _rpg, _rg, n_roads = build_dust2.roads_partition(roads, road_name)
        path = os.path.join(part_dir, 'roads.json')
        json.dump(road_json, open(path, 'w'), indent=1)
        cmds.append('add_json_partition %s "%s"' % (road_name, path))
        build_dust2.WORLD_NAME = saved_world
        print('roads     %d ribbon(s) authored' % n_roads)

    # Entities the stage EDITED, written back.
    #
    # This is what makes a spawn point, a light, a sound emitter or a destructible part authorable
    # rather than merely present: the stage carries each one's source partition and instance guid,
    # so an edited transform is written into a copy of that partition and THAT is added to the
    # bundle -- the referenced original is skipped. Without this half the entities export to USD and
    # nothing comes back, which is authoring in one direction only.
    edited_parts = set()
    stage_entities = {}

    if ebx_dir:
        import level_entities

        edits = level_entities.read(stage_path)
        stage_entities = edits

        for part, changes in sorted(edits.items()):
            src = os.path.join(ebx_dir, part + '.json')

            if not os.path.exists(src):
                continue

            try:
                doc = json.load(open(src))
            except Exception:                                # noqa: BLE001
                continue

            # Only a record that actually CHANGED. `read()` returns every entity it authored, not
            # just edited ones, so rewriting on presence shadowed 511 of the game's own partitions
            # for an unedited export of mp_003 -- under the game's own names, which is the one thing
            # measured never to work. An unedited level must add NO entity partitions at all.
            touched = 0

            for guid, record in changes.items():
                old = (doc.get('Instances') or {}).get(guid)

                if old is None or old == record:
                    continue

                doc['Instances'][guid] = record
                touched += 1

            if not touched:
                continue

            out = os.path.join(part_dir, 'ent_%s.json' % _safe(part))
            json.dump(doc, open(out, 'w'), indent=1)
            cmds.append('add_json_partition %s "%s"' % (part, out))
            edited_parts.add(part)

        if edited_parts:
            print('entities  %d partition(s) rewritten with edited entities' % len(edited_parts))

    # Everything else the level holds, by REFERENCE.
    #
    # A level is far more than geometry: MP_001 carries 411 spawn entities, 348 decal entities, 139
    # effect placements, 105 light-probe volumes, 124 shape volumes and ~1400 material relations for
    # damage, sound, penetration and decals. None of that needs REBUILDING for a level whose content
    # is unchanged -- naming the partition brings the game's own data in. It is the same rule the
    # meshes and terrain follow, and it keeps a distributable bundle free of DICE's data.
    if reference_parts:
        named = 0

        for part in reference_parts:
            part = part.strip()

            if not part or part in referenced or part in edited_parts:
                continue

            cmds.append('reference_existing_partition %s 1' % part)
            named += 1

        print('level     %d partition(s) referenced (effects, decals, probes, volumes, spawns)'
              % named)

    # Terrain, by REFERENCE.
    #
    # An unmodified terrain needs no writer: naming its partitions puts the game's own heightfield,
    # mask, material and destruction trees into the bundle. Only an EDITED terrain needs writing
    # back, and only its mask tree can be written today. This keeps the common case correct and
    # keeps DICE's terrain data out of a distributable bundle, the same rule the meshes follow.
    if terrain_of:
        terrain_parts = [ln.strip() for ln in terrain_of if ln.strip()]

        for part in terrain_parts:
            cmds.append('reference_existing_partition %s 1' % part)

        if terrain_parts:
            print('terrain   %d partition(s) referenced' % len(terrain_parts))

    # THE MeshVariationDatabase -- one for the bundle, an entry per mesh.
    #
    # This is what BF3 resolves a mesh's textures through. Geometry and texture partitions alone
    # give a bundle that loads and draws grey.
    if texture_dir and os.path.isdir(texture_dir) and mvdb_inputs:
        entries = []

        for name, mesh_pg, mesh_g, mats, names_, binding in mvdb_inputs:
            entry_g, instances, _bound = build_dust2.mvdb_entry(
                name, mesh_pg, mesh_g, mats, names_, binding, tex_index, flat_name)
            entries.append((entry_g, instances))

        mvdb_json = build_dust2.mvdb_partition(entries)
        path = os.path.join(part_dir, 'mvdb.json')
        json.dump(mvdb_json, open(path, 'w'), indent=1)
        cmds.append('add_json_partition %s "%s"' % (build_dust2.MVDB_NAME, path))
        print('mvdb      %d entries' % len(entries))

    # The sub-level, plus one partition per world part -- the shape the game's own levels have.
    if extra:
        # The level's content, straight from the stage: every instance the game would keep in a
        # world part, with whatever the DCC changed about it. These are AUTHORED into our own
        # partitions rather than referenced out of the source level -- see WORLD_PART_TYPES.
        authored = {}

        if ebx_dir and stage_entities:
            # A reference object is only instantiable if the BLUEPRINT it points at is actually in
            # this bundle. Authoring one whose blueprint we never shipped kills the server during
            # "Creating entities for autoloaded sublevels" -- silently, exit code 0.
            #
            # This only began to bite once the entity partition list was derived for every level:
            # before that only MP_001 authored entities, and its set happened to be self-contained
            # (decals, probes, locators, sounds). mp_003 brought 2731 ReferenceObjectData and 218
            # EffectReferenceObjectData pointing at blueprints outside the bundle, and the load died.
            #
            # The mesh pipeline already emits a placement for every mesh it ships, so dropping these
            # loses no geometry -- it drops a DUPLICATE that cannot resolve.
            # Every partition guid this bundle actually carries, read back from the JSON we just
            # wrote. Derived, not assumed: a hardcoded or empty set here would silently drop every
            # reference object and look like it worked.
            ours = set()

            for _f in os.listdir(part_dir):
                if not _f.endswith('.json'):
                    continue

                try:
                    _d = json.load(open(os.path.join(part_dir, _f)))
                except Exception:                            # noqa: BLE001
                    continue

                if _d.get('PartitionGuid'):
                    ours.add(str(_d['PartitionGuid']).lower())

            # Bisect handle: USD_SKIP_TYPES=RoadData,PointLightEntityData narrows which authored
            # type kills a load without re-plumbing the emitter each time.
            _skip_types = set(filter(None, os.environ.get('USD_SKIP_TYPES', '').split(',')))
            # Blueprints pulled by guid out of the closure dump, so a reference object we would
            # otherwise skip can be kept. Index once: guid -> (partition name, file).
            _closure = {}
            _cdir = os.environ.get('USD_CLOSURE_DIR', '/tmp/closure')

            if os.path.isdir(_cdir):
                for _cf in os.listdir(_cdir):
                    if not _cf.endswith('.json'):
                        continue

                    try:
                        _cd = json.load(open(os.path.join(_cdir, _cf)))
                    except Exception:                        # noqa: BLE001
                        continue

                    _cg = _cd.get('PartitionGuid')
                    _cn = _cd.get('Name')

                    if _cg and _cn:
                        _closure[str(_cg).lower()] = (_cn, os.path.join(_cdir, _cf))

            shipped_bp = {}
            unresolvable = 0
            skipped = 0

            for _part, by_guid in stage_entities.items():
                # The LEVEL's entities only. A closure partition authored into the stage is a
                # library asset, not something placed in this world, and copying its reference
                # objects into our world part is the one arrangement measured to be fatal: the load
                # reaches "Creating entities for autoloaded sublevels" and the process exits.
                if ebx_dir and not os.path.exists(os.path.join(ebx_dir, _part + '.json')):
                    continue

                for guid_str, record in by_guid.items():
                    if record.get('$type') not in build_dust2.WORLD_PART_TYPES:
                        continue

                    if record.get('$type') in _skip_types:
                        continue

                    bp = record.get('Blueprint')

                    if isinstance(bp, dict) and bp.get('PartitionGuid'):
                        _g = bp['PartitionGuid'].lower()

                        # Nothing is dropped: the whole closure ships, so a blueprint we do not
                        # already emit is still resolvable. An object that cannot be accounted for
                        # is REPORTED, never silently skipped -- 1:1 or a number that says why not.
                        if _g not in ours and _g not in _closure:
                            unresolvable += 1

                    authored[guid_str] = record

            # 1:1 means the whole dependency graph, not just the blueprint a reference object
            # names. Shipping only the 171 named ones authored 2189 more objects and then died
            # during entity creation: a blueprint's own meshes, emitters, sounds and materials must
            # resolve too, and they are not all in the game's mounted bundles at that point. The
            # closure converged in six rounds (5407 -> 2696 -> 1746 -> 320 -> 61 -> 1), so it is
            # finite and shippable.
            # Embed if edited, reference if not -- the same rule the meshes and textures follow.
            # A closure partition we have REFERENCED is already resolvable from the player's own
            # install, so shipping a copy of it as well is pure duplication: the earlier measurement
            # that forced the whole closure to ship was taken when only the 171 named blueprints
            # were referenced and the rest were resolvable from nothing.
            _named = set()

            if reference_closure and reference_parts:
                _named = {p.strip() for p in reference_parts if p.strip()}

            _shipped_closure = 0
            _edited_closure = 0

            for _g, (_cn, _cf) in sorted(_closure.items()):
                if _cn in _named and _cn not in edited_parts:
                    continue                        # referenced above; the game supplies it

                # A closure partition the STAGE edited ships with the edit applied. Without this
                # the closure is exportable and not editable: a weapon or soldier could be changed
                # in a DCC, the change would round trip through USD, and the bundle would still
                # carry the game's original -- authoring in one direction only, which is the exact
                # failure the level's own entities already guard against.
                # The closure is authored into the stage under its FILE name, which is a guid,
                # while it ships under its partition name. Look under both, or an edit to a weapon
                # silently never lands.
                _changes = (stage_entities.get(_cn) or stage_entities.get(_g)
                            or stage_entities.get(str(_g).lower()))

                if _changes:
                    try:
                        _doc = json.load(open(_cf))
                    except Exception:                            # noqa: BLE001
                        _doc = None

                    if _doc is not None:
                        _touched = 0

                        for _ig, _rec in _changes.items():
                            _old = (_doc.get('Instances') or {}).get(_ig)

                            # Only what actually CHANGED, the same rule the level's entities
                            # follow: read() returns everything it authored, not just edits.
                            if _old is None or _old == _rec:
                                continue

                            _doc['Instances'][_ig] = _rec
                            _touched += 1

                        if _touched:
                            _cf = os.path.join(part_dir, 'clo_%s.json' % _safe(_cn))
                            json.dump(_doc, open(_cf, 'w'), indent=1)
                            _edited_closure += 1

                cmds.append('add_json_partition %s "%s"' % (_cn, _cf))
                _shipped_closure += 1

            if _edited_closure:
                print('closure   %d partition(s) rewritten with edits from the stage'
                      % _edited_closure)

            if _closure:
                print('closure   %d partition(s): %d shipped, %d referenced'
                      % (len(_closure), _shipped_closure, len(_closure) - _shipped_closure))

            if unresolvable:
                print('content   %d instance(s) whose blueprint is in NEITHER our bundle nor the '
                      'closure -- authored anyway, report if the load rejects them' % unresolvable)

            if authored:
                import collections as _collections
                kinds = _collections.Counter(v.get('$type') for v in authored.values())
                print('content   %d instance(s) authored into our world parts (%s)'
                      % (len(authored),
                         ', '.join('%s %d' % (k.replace('EntityData', '').replace('Data', ''), n)
                                   for k, n in kinds.most_common(4))))

        # Resources named by an asset rather than placed. Referenced, never rebuilt.
        asset_res = set()

        for _record in authored.values():
            _n = _record.get('Name')

            if isinstance(_n, str) and _record.get('$type', '').endswith('Asset') and '/' in _n:
                asset_res.add(_n.lower())

        for _part, _by_guid in (stage_entities or {}).items():
            # Only assets the LEVEL owns. Once the closure is authored into the stage this loop can
            # see every SoundWaveAsset in the game -- tank cannons, sniper layers -- and referencing
            # them fails 992 times and the level stops loading. The closure's own assets resolve
            # from the game's bundles; they are not this bundle's to name.
            if ebx_dir and not os.path.exists(os.path.join(ebx_dir, _part + '.json')):
                continue

            for _record in _by_guid.values():
                _t = _record.get('$type', '')
                _n = _record.get('Name')

                if not isinstance(_n, str) or '/' not in _n:
                    continue

                # WaterAsset.Name is a MESH name, not a resource name -- add_existing_resource on
                # it fails ("Could not find resource (...water.mesh)"). Water geometry comes through
                # the mesh path instead; see the asset-mesh authoring in export_level_usd.
                if _t in ('HavokAsset', 'SoundWaveAsset',
                          'DestructionDepthTreeAsset', 'TerrainDecalsAsset'):
                    asset_res.add(_n.lower())

        for _n in sorted(asset_res):
            cmds.append('add_existing_resource %s 1' % _n)

        # COLLISION AUTHORED IN THE DCC. Any prim carrying UsdPhysics.CollisionAPI is turned into a
        # real HavokPhysicsData resource by tools/havok/build_collision.py -- boxes and convex hulls,
        # byte-verified against BF3's own shapes. No Havok SDK: MOPP is only needed for large mesh
        # shapes, and convex hulls do not use one. Without this, collision could be modelled in USD
        # and silently never reached the game.
        try:
            import collision as _collision

            _shapes = _collision.read(stage_path)
        except Exception as _ex:                             # noqa: BLE001
            _shapes = []
            print('collision  skipped (%s)' % _ex)

        if _shapes:
            import sys as _sys

            _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                             '..', 'havok'))
            import build_collision as _bc

            _blob = _bc.build(_shapes)
            _cpath = os.path.join(part_dir, 'authored_collision.bin')
            open(_cpath, 'wb').write(_blob)
            _cname = '%s/authored_physics_0_win32' % build_dust2.WORLD_NAME
            cmds.append('add_resource %s "%s" 0' % (_cname, _cpath))
            print('collision %d authored shape(s) -> %d byte HavokPhysicsData'
                  % (len(_shapes), len(_blob)))

        if asset_res:
            print('assets    %d resource(s) referenced by name (water, havok, destruction, audio)'
                  % len(asset_res))

        # 1:1 STRUCTURE. Copying the level's ReferenceObjectData into a world part WE invented is
        # what the engine refuses: measured on mp_003, shipping the full 10396-partition closure
        # loads clean (0 errors, 35/35 parts) and stays clean until those copies are authored, at
        # which point it dies in "Creating entities for autoloaded sublevels".
        #
        # So point our sub-level at the level's OWN world parts instead. Their WorldPartData
        # partitions ship with the closure, so a verbatim copy of each WorldPartReferenceObjectData
        # gives the engine exactly the arrangement it already knows how to instantiate -- which is
        # also what BF3 itself bakes, and what makes the USD hierarchy the level's real hierarchy
        # rather than a flat bucket per type.
        own_parts = []

        if ebx_dir and os.environ.get('USD_OWN_STRUCTURE', '1') != '0':
            _lvl_file = os.path.join(ebx_dir, 'levels', host.lower(), host.lower() + '.json')

            if os.path.exists(_lvl_file):
                try:
                    _ld = json.load(open(_lvl_file))
                    _root = (_ld.get('Instances') or {}).get(_ld.get('PrimaryInstanceGuid')) or {}

                    for _o in (_root.get('Objects') or []):
                        _inst = (_ld.get('Instances') or {}).get(_o.get('InstanceGuid'))

                        if _inst and _inst.get('$type') == 'WorldPartReferenceObjectData':
                            own_parts.append((_o.get('InstanceGuid'), _inst))
                except Exception as _ex:                     # noqa: BLE001
                    print('structure  could not read %s (%s)' % (_lvl_file, _ex))

        if own_parts:
            # The level's own world parts now carry its objects, so a COPY of each object in our
            # synthetic world part is both redundant and fatal -- the engine instantiates the real
            # ones and refuses the copies (measured: EXITED with them, LOADED without). Dropping the
            # copies loses nothing: every object still reaches the level, through the arrangement
            # BF3 itself bakes. What stays authored is content that is genuinely OURS -- anything a
            # DCC added or changed, which has no home in the level's shipped partitions.
            _from_level = {'ReferenceObjectData', 'EffectReferenceObjectData'}
            _before = len(authored)
            authored = {g: r for g, r in authored.items()
                        if r.get('$type') not in _from_level}

            print('structure  %d WorldPartReferenceObjectData from the level itself; '
                  '%d duplicate object(s) dropped in favour of the real world parts'
                  % (len(own_parts), _before - len(authored)))

        world_json, world_parts = build_dust2.world_partition(
            extra[0][0], extra[0][1], extra=extra, entities=authored, own_parts=own_parts)

        # Parts first: a WorldPartReferenceObjectData whose blueprint partition is not in the
        # bundle yet resolves to nothing, and the object silently does not appear.
        for part_json in world_parts:
            part_path = os.path.join(part_dir, '%s.json' % _safe(part_json['Name']))
            json.dump(part_json, open(part_path, 'w'), indent=1)
            cmds.append('add_json_partition %s "%s"' % (part_json['Name'], part_path))

        if world_parts:
            print('world     %d part partition(s)' % (len(world_parts) + 1))

        path = os.path.join(part_dir, 'world.json')
        json.dump(world_json, open(path, 'w'), indent=1)
        cmds.append('add_json_partition %s "%s"' % (build_dust2.WORLD_NAME, path))

    cmds += ['build', 'build']
    open(os.path.join(out_dir, 'build.cmds'), 'w').write('\n'.join(cmds) + '\n')

    return {'meshes': stats['meshes'], 'placements': stats['placements'],
            'referenced': len(referenced), 'changed': len(changed),
            'unresolved': len(unresolved), 'placed': len(extra)}


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)

    r = emit(sys.argv[1], sys.argv[2], sys.argv[3])
    print('meshes            %d  (%d placements)' % (r['meshes'], r['placements']))
    print('REFERENCED        %d  unchanged -- the game supplies these, nothing is copied'
          % r['referenced'])
    print('shipped           %d  changed or new -- only these are written into the bundle'
          % r['changed'])
    print('placements emitted %d  into one world partition' % r.get('placed', 0))
    print('unresolved        %d' % r['unresolved'])
