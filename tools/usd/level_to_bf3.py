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
import uuid

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


def is_referenced(payload, original, geom_ok):
    """Embed if edited, reference if not -- the whole rule, in one place so the test can prove the
    rule the emitter actually runs rather than a restatement of it.

    A mesh is referenced from the player's install only when all three hold:
      * the game ships it under this name          (original is not None)
      * its resource rebuilt to the game's bytes   (payload == original)
      * its geometry rebuilt to the exported bytes (geom_ok is not False)

    The third is the one that was missing. Without it a UV or normal edit -- which changes the
    chunk and not the payload -- referenced the game's geometry and the edit vanished.
    `geom_ok is None` means the stage carries no digest, so the first two decide and the caller
    reports how many meshes that covers.
    """
    return original is not None and payload == original and geom_ok is not False


def _q(name):
    """Quote a command argument that carries a space.

    Rime's tokenizer (RimeLib.Cmd/CommandUtils.ParseArguments) splits on spaces and honours double
    quotes, so a name with a space MUST be quoted or it arrives truncated. BF3 ships exactly one
    such resource -- `objects/rugpile_01/rugpile_01_n ` has a trailing space, a DICE typo -- and
    unquoted it reached the builder as `..._n`, which does not exist: "Could not find resource".

    Quoted only when needed, so every other emitted command stays byte-identical.
    """
    return '"%s"' % name if (' ' in name or '\t' in name) else name


_RESOURCE_NAMES = None


def _resource_names():
    """Every resource name the game contains, lowercased. Empty set if the list is absent."""
    global _RESOURCE_NAMES

    if _RESOURCE_NAMES is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            '..', 'hashes', 'bf3_resources.txt')
        try:
            _RESOURCE_NAMES = {ln.strip().lower() for ln in open(path) if ln.strip()}
        except Exception:                                    # noqa: BLE001
            _RESOURCE_NAMES = set()

    return _RESOURCE_NAMES


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
         ship_textures=False, reference_closure=False, ship_closure=True):
    os.makedirs(out_dir, exist_ok=True)
    index = shipped_index(os.path.join(corpus, 'res'))

    # Where a chunk can be read from when the game has no usable variant of it.
    #
    # `add_existing_resource_with_chunks` resolves a resource's chunks out of the mounted game, and
    # for 68 of MP_001's 1681 attachments -- LOD and destruction slices -- the chunk is indexed but
    # no variant of it is resident, so nothing gets carried. The server never notices; the CLIENT
    # livelocks on a chunk that is not there, which is the black screen. The corpus dump has all 68,
    # so hand the builder somewhere to read them from.
    _chunk_dir = os.path.join(corpus, 'chunks')
    _chunk_arg = (' "%s"' % _chunk_dir) if os.path.isdir(_chunk_dir) else ''
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
    # A partition emitted under a name the game already ships must keep that name's guid, or it is
    # a different partition wearing the same name -- and since partitions resolve first-wins by
    # name, a reference carrying the shipped guid then resolves to the ORIGINAL, so an edited mesh
    # can silently not appear. MEASURED: 24 of our partitions reused a shipped name with a fresh
    # guid before this.
    # Scan the BLUEPRINT dump as well as the level dump: the names we re-emit (meshes, blueprints)
    # are prefab partitions that live there, not in the level's own EBX. Scanning only ebx_dir found
    # zero of them and the map came out empty.
    # The names we re-emit are prefab partitions, which live in the CLOSURE dump -- the blueprint
    # dump holds the blueprint names (…_model) while we emit mesh names (…_model_Mesh), so neither
    # ebx_dir nor blueprint_dir contains them and the map came out empty twice.
    # USD_GUID_DIRS is a colon-separated list of extra dumps to read guids from.
    _guid_dirs = [d for d in (ebx_dir, blueprint_dir) if d and os.path.isdir(d)]
    _guid_dirs += [d for d in os.environ.get('USD_GUID_DIRS', '').split(':')
                   if d and os.path.isdir(d)]

    if _guid_dirs and not build_dust2.SHIPPED_GUIDS:
        import glob as _g

        _files = []

        for _d in _guid_dirs:
            _files += _g.glob(os.path.join(_d, '**', '*.json'), recursive=True)

        for _f in _files:
            try:
                _d = json.load(open(_f))
            except Exception:                                # noqa: BLE001
                continue

            _n, _pg = (_d.get('Name') or '').lower(), _d.get('PartitionGuid')

            if _n and _pg:
                build_dust2.SHIPPED_GUIDS.setdefault(_n, _pg)

                # And the INSTANCE guids inside it, in the order the partition stores them.
                #
                # A re-emitted partition that keeps the shipped name and partition guid but invents
                # its instance guids is a different partition wearing the same address: a game
                # blueprint placing that mesh names (partition, instance) and the instance half no
                # longer exists. Recorded per type so mesh_partition can hand each record back the
                # guid the game gave it.
                if _n not in build_dust2.SHIPPED_INSTANCES:
                    _by_type = {}

                    for _ig, _inst in (_d.get('Instances') or {}).items():
                        _by_type.setdefault(_inst.get('$type') or '?', []).append(_ig)

                    # MeshMaterials in MATERIAL-INDEX order, which is the mesh asset's own
                    # `Materials` array -- not the order the dump happens to list instances in.
                    # MEASURED on the crane: its Materials array runs metal, beams, glass, grating,
                    # concrete, platform, sign while the dump lists them in a different order
                    # entirely, so handing material i the i-th dumped guid mismatches every subset.
                    _asset = next((_i for _i in (_d.get('Instances') or {}).values()
                                   if (_i.get('$type') or '').endswith('MeshAsset')), None)

                    if _asset and isinstance(_asset.get('Materials'), list):
                        _ordered = [(_m or {}).get('InstanceGuid') for _m in _asset['Materials']]
                        _ordered = [_g for _g in _ordered if _g]

                        if _ordered:
                            _by_type['MeshMaterial'] = _ordered

                    build_dust2.SHIPPED_INSTANCES[_n] = _by_type

        print('guids     %d shipped partition name(s) will keep their own guid, '
              '%d also their instance guids'
              % (len(build_dust2.SHIPPED_GUIDS), len(build_dust2.SHIPPED_INSTANCES)))

        # Second pass: each shipped mesh's own MeshLodGroup VALUES, so a re-emitted mesh keeps its
        # LOD distances instead of the 100000 placeholder that never switches LOD. Only the handful
        # of lodgroup partitions are re-read, not the whole corpus.
        _lod_refs, _lod_parts = {}, {}

        for _f in _files:
            try:
                _pd = json.load(open(_f))
            except Exception:                                # noqa: BLE001
                continue

            _pn = (_pd.get('Name') or '').lower()

            for _i in (_pd.get('Instances') or {}).values():
                if _i.get('$type') == 'MeshLodGroup':
                    _lod_parts[(_pd.get('PartitionGuid') or '').lower()] = _pd

                # Every mesh asset type, not just the rigid one. MEASURED over MP_001's 527
                # meshes: 244 are RigidMeshAsset, 91 CompositeMeshAsset and 4 SkinnedMeshAsset,
                # and all 339 carry a LodGroup ref. Matching only the first two names left the
                # composites and the skinned meshes on the 100000 placeholder, which never
                # switches LOD.
                if _i.get('$type') in ('RigidMeshAsset', 'MeshAsset', 'CompositeMeshAsset',
                                       'SkinnedMeshAsset') and _pn:
                    _lg = _i.get('LodGroup')

                    if isinstance(_lg, dict):
                        _lod_refs[_pn] = ((_lg.get('PartitionGuid') or '').lower(),
                                          (_lg.get('InstanceGuid') or '').lower())

        for _pn, (_lpg, _lig) in _lod_refs.items():
            _part = _lod_parts.get(_lpg)

            if not _part:
                continue

            for _g, _i in (_part.get('Instances') or {}).items():
                if _g.lower() == _lig and _i.get('$type') == 'MeshLodGroup':
                    build_dust2.SHIPPED_LODGROUPS[_pn] = {
                        _k: _i[_k] for _k in _i
                        if _k.startswith('Lod') or _k in ('ShadowDistance', 'CullScreenArea')}
                    break

        print('lodgroups %d mesh(es) will keep their shipped LOD distances'
              % len(build_dust2.SHIPPED_LODGROUPS))

    if level_sb:
        build_dust2.WORLD_NAME = 'levels/realitymod/%s' % bundle_name.lower()
        # The MVDB is resolved BY NAME from the sub-level's own name: the game ships
        # levels/mp_001/mp_001/meshvariationdb_win32 next to sub-level levels/mp_001/mp_001, one
        # per gamemode, and never a database named outside the level it belongs to.
        #
        # WORLD_NAME was overridden here and MVDB_NAME was not, so the database kept its dust2-era
        # name (dust2/meshvariationdb_win32) while the world became levels/realitymod/<x>. The
        # build still succeeds -- nothing refers to the database by path -- but the CLIENT then
        # binds mesh variations against a database it cannot find and spins forever in an empty
        # 16-slot GUID table (vu.com+0xC1CAC), which is the black screen. A dedicated server never
        # binds variations, which is why 48 headless LOADED verdicts never caught it.
        build_dust2.MVDB_NAME = build_dust2.WORLD_NAME + '/meshvariationdb_win32'

    referenced, changed, unresolved = [], [], []
    unproven = 0

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

        # The resource is only half the mesh. Positions, normals, UVs and tangents are in the
        # CHUNK, and the payload changes only when a count or the bbox does -- so `payload ==
        # original` calls a retextured or re-normalled mesh untouched and references the game's
        # geometry over the top of the edit. MEASURED before the fix, on a corpus mesh: a UV nudge
        # and a flipped normal each left the payload byte-identical and the chunk different, and
        # the emitter dropped both. The digest `bf3_usd.export` authors covers the chunk.
        geom_ok = bf3_usd.unedited_geometry(proto, chunks)

        if geom_ok is None:
            unproven += 1               # no digest carried: say so rather than assume untouched

        if is_referenced(payload, original, geom_ok):
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

    if unproven:
        # An old stage carries no chunk digest, so "unedited" rests on the resource bytes alone --
        # which cannot see a UV or normal edit. Named, not hidden: re-export to close it.
        print('WARNING %d mesh(es) carry no chunk digest; geometry edits to them cannot be '
              'detected. Re-export the stage.' % unproven)

    # EBX for the meshes we ship. A referenced mesh keeps the game's own blueprint, so nothing is
    # authored for it; a changed one needs its mesh asset, its blueprint, and a placement.
    import build_dust2
    # (json and uuid are imported at module scope; a local import here made the name
    #  function-local and every EARLIER use in this function raised UnboundLocalError.)

    build_dust2.configure(host)

    # configure() resets the naming, including WORLD_NAME, so the sub-level name set above has to
    # be re-applied after it. Setting it once before this call left the emitted world partition
    # named 'dust2/world' and the sub-level unresolvable -- silently, since a build that names a
    # partition nothing else refers to is still a valid build.
    if level_sb:
        build_dust2.WORLD_NAME = 'levels/realitymod/%s' % bundle_name.lower()
        # The MVDB is resolved BY NAME from the sub-level's own name: the game ships
        # levels/mp_001/mp_001/meshvariationdb_win32 next to sub-level levels/mp_001/mp_001, one
        # per gamemode, and never a database named outside the level it belongs to.
        #
        # WORLD_NAME was overridden here and MVDB_NAME was not, so the database kept its dust2-era
        # name (dust2/meshvariationdb_win32) while the world became levels/realitymod/<x>. The
        # build still succeeds -- nothing refers to the database by path -- but the CLIENT then
        # binds mesh variations against a database it cannot find and spins forever in an empty
        # 16-slot GUID table (vu.com+0xC1CAC), which is the black screen. A dedicated server never
        # binds variations, which is why 48 headless LOADED verdicts never caught it.
        build_dust2.MVDB_NAME = build_dust2.WORLD_NAME + '/meshvariationdb_win32'

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
            cmds.append('add_existing_resource_with_chunks %s 1%s' % (_q(name), _chunk_arg))
        else:
            cmds.append('add_resource %s MeshSet "%s" %s'
                        % (_q(name), res_path, meta.hex().upper()))

        for li, chunk in sorted(chunks.items()) if res_path else []:
            guid = uuid.UUID(bytes_le=ms.lods[li].data_chunk_id)
            path = os.path.join(out_dir, '%s.chunk' % guid)
            data = chunk + b'\0' * ((-len(chunk)) % 16)
            open(path, 'wb').write(data)
            cmds.append('add_chunk %s %s "%s"' % (guid, _q(name), path))

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
                cmds.append('add_json_partition %s "%s"' % (_q(tex_name), tex_json))
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
            cmds.append('add_existing_resource_with_chunks %s 1%s' % (_q(base), _chunk_arg))
            cmds.append('add_json_partition %s "%s"'
                        % (_q(build_dust2.texture_partition_name(base)), tex_json))
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
        cmds.append('add_json_partition %s "%s"' % (_q(road_name), path))
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
            # The level's OWN dump first, then the other dumps this export was given.
            #
            # /World/Registry carries the 2762 partitions the level's RegistryContainer declares --
            # weapons, persistence, characters -- and those live in their own dump, not the level's.
            # Looking only in ebx_dir found none of them, so a weapon edited in a DCC read back off
            # the stage correctly and was then dropped on the floor here, with nothing said.
            src = None

            for base in _guid_dirs:
                candidate = os.path.join(base, part + '.json')

                if os.path.exists(candidate):
                    src = candidate
                    break

            if src is None:
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
            cmds.append('add_json_partition %s "%s"' % (_q(part), out))
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

            cmds.append('reference_existing_partition %s 1' % _q(part))
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
            cmds.append('reference_existing_partition %s 1' % _q(part))

        if terrain_parts:
            print('terrain   %d partition(s) referenced' % len(terrain_parts))

    # THE MeshVariationDatabase -- one for the bundle, an entry per mesh.
    #
    # This is what BF3 resolves a mesh's textures through. Geometry and texture partitions alone
    # give a bundle that loads and draws grey.
    # Gated on HAVING ENTRIES, not on a texture directory existing. It used to require
    # `texture_dir and os.path.isdir(texture_dir)`, and any caller that did not create
    # `<level>_textures/` silently shipped a level with NO MeshVariationDatabase at all. A dedicated
    # server never needs one, so every headless check still passed -- 48 levels reported LOADED, and
    # a client cannot bind a single material without it. The builder was saying so all along, in the
    # 476 "could not find a valid variant" warnings nobody read as fatal.
    if mvdb_inputs:
        entries = []

        for name, mesh_pg, mesh_g, mats, names_, binding in mvdb_inputs:
            entry_g, instances, _bound = build_dust2.mvdb_entry(
                name, mesh_pg, mesh_g, mats, names_, binding, tex_index, flat_name)
            entries.append((entry_g, instances))

        mvdb_json = build_dust2.mvdb_partition(entries)
        path = os.path.join(part_dir, 'mvdb.json')
        json.dump(mvdb_json, open(path, 'w'), indent=1)
        cmds.append('add_json_partition %s "%s"' % (_q(build_dust2.MVDB_NAME), path))
        print('mvdb      %d entries' % len(entries))

        # `flat_normal` is a 4x4 normal map this emitter GENERATES, bound wherever a mesh has no
        # normal slot. Shipped alone in a sub-level bundle it FREEZES THE CLIENT -- one of the
        # causes that made every exported level unenterable, and invisible to a server, which is
        # how it survived 48 "LOADED" verdicts.
        #
        # It is NOT unused, and the check is here because a first measurement said it was. Counting
        # `MeshMaterial.TextureParameters` in the mesh PARTITIONS finds them empty -- 27 of 27 on
        # frontend, 892 of 892 on mp_001 -- but that is the wrong place to look: binding happens in
        # the MeshVariationDatabase, where this guid appears **586 times** on mp_001 as the `Normal`
        # parameter. Dropping it on the strength of the partition count would have left 586
        # bindings pointing at a partition that no longer exists.
        #
        # So the test asks the database, not the partitions. Today it keeps the texture; if a
        # future change stops binding it, the dead weight disappears on its own.
        _flat_used = build_dust2.guid('instance', build_dust2.texture_partition_name(flat_name)) \
            in json.dumps(mvdb_json)

        if not _flat_used:
            _before = len(cmds)
            cmds = [c for c in cmds
                    if flat_name not in c or not c.startswith(('add_dds_texture', 'add_json_partition'))]
            print('flat      dropped %d flat-normal command(s): the database binds it 0 times'
                  % (_before - len(cmds)))

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

            # MEASURED 2026-09-06 on the FIXED host (the one that loads a sub-level and registers
            # teams): the closure is dead weight. mp_001 with 6,199 placements, built twice,
            # identical but for dropping all 10,396 closure partitions --
            #
            #     superbundle  61,924,317 -> 12,529,621 bytes   (79.8% smaller)
            #     world parts       25/25 -> 25/25
            #     static entities    6200 -> 6200
            #     texture warnings    476 -> 476        teams: registered both ways
            #
            # This document recorded the closure as MANDATORY ("shipping only the 171 named
            # blueprints died during entity creation"). That measurement was taken against the
            # BROKEN baseline -- a stale RimeCommands.txt that never loaded a sub-level -- and it
            # does not survive the fix.
            #
            # Default stays True until the 49-level sweep is re-run without it: two levels agreeing
            # exactly is strong, and it is not 49.

            for _g, (_cn, _cf) in sorted(_closure.items()):
                if not ship_closure and _cn not in edited_parts:
                    continue                        # dead weight; see the measurement above

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

                cmds.append('add_json_partition %s "%s"' % (_q(_cn), _cf))
                _shipped_closure += 1

            if _edited_closure:
                print('closure   %d partition(s) rewritten with edits from the stage'
                      % _edited_closure)

            if _closure:
                # DROPPED and REFERENCED are different things and must not be reported as one:
                # a dropped partition emits no command at all, while a referenced one emits
                # reference_existing_partition. Saying "referenced" for both printed "10396
                # referenced" on a build whose reference count was zero.
                _dropped = 0 if ship_closure else len(_closure) - _shipped_closure
                _referenced = len(_closure) - _shipped_closure - _dropped
                print('closure   %d partition(s): %d shipped, %d referenced, %d dropped'
                      % (len(_closure), _shipped_closure, _referenced, _dropped))

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
        _skipped_res = 0

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

        # Reference only what the game HAS. An asset's Name is not a promise that a resource
        # exists behind it: an object declares both `_Physics_0_Win32` (Scale 1.0) and
        # `_Physics_1_Win32` (Scale 2.0) and DICE ships a resource only for the first. Measured
        # across the 49-level sweep, that produced 72 build errors over 19 levels from 71 distinct
        # names, and `where_is` resolves 0 of 71 against a positive control that resolves.
        #
        # tools/hashes/bf3_resources.txt is every resource name the game contains, dumped from the
        # mounted game. Checked against it, 0 of the 1,065 names that failed are present -- so the
        # filter removes exactly the errors and nothing else. Without the list the behaviour is
        # unchanged, because guessing which names are real is what caused this.
        _known = _resource_names()

        for _n in sorted(asset_res):
            if _known and _n not in _known:
                _skipped_res += 1
                continue

            cmds.append('add_existing_resource_with_chunks %s 1%s' % (_q(_n), _chunk_arg))

        if _skipped_res:
            print('assets    %d name(s) skipped: no such resource in the game' % _skipped_res)

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
            cmds.append('add_resource %s "%s" 0' % (_q(_cname), _cpath))
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

        # The source level's own gameplay declarations, carried through. Measured on mp_001: the
        # game's sub-world root lists 1,628 assets and 132 entities, ours listed none, and the
        # client dies loading exactly that partition. See world_partition().
        _src_reg = {}

        if ebx_dir:
            # Found by SHAPE, not by a guessed filename: the level root is the partition holding
            # both a LevelData and a RegistryContainer. An earlier version built the path from a
            # `level` name that does not exist in this scope, so it silently carried nothing.
            #
            # Scoped to THIS level's own directory when the dump holds more than one. /tmp/allebx
            # has all 70 levels, and taking the first partition of the right shape meant every
            # level built from it carried the same arbitrary registry: MP_003, MP_007, MP_011,
            # MP_012, MP_013 and MP_017 all shipped an identical 476 assets / 90 entities, which is
            # not any of their registries. MP_001 was right only because its dump holds one level.
            import glob as _glob

            # The SOURCE level's name, which the exporter wrote onto /World as bf3:level.
            _src_level = ''

            try:
                from pxr import Usd as _Usd

                # Hold the STAGE. Chaining Stage.Open(...).GetPrimAtPath(...) drops the only
                # reference to the stage, the prim expires the moment it is used, and the except
                # below turns that into a silent empty level name.
                _stage = _Usd.Stage.Open(stage_path)
                _root = _stage.GetPrimAtPath('/World')
                _src_level = ((_root.GetCustomData().get('bf3') or {}).get('level') or ''
                              if _root else '')
            except Exception:                                # noqa: BLE001
                _src_level = ''

            _level_dir = os.path.join(ebx_dir, os.path.dirname(_src_level))
            _roots = ([_level_dir] if os.path.isdir(_level_dir) else []) + [ebx_dir]

            _candidates = []

            for _root in _roots:
                _candidates = sorted(_glob.glob(os.path.join(_root, '**', '*.json'),
                                                recursive=True))

                if _candidates:
                    break

            # The level's OWN partition first, then everything else.
            #
            # A gamemode sub-level is ALSO a LevelData with a RegistryContainer, so taking the
            # first partition of the right shape picked levels/mp_007/conquest_large -- 476 assets
            # where mp_007 itself declares 1623. Alphabetical order was deciding which registry a
            # level shipped.
            if _src_level:
                _own = os.path.join(ebx_dir, _src_level + '.json')
                _candidates = ([_own] if os.path.exists(_own) else []) + \
                    [_c for _c in _candidates if _c != _own]

            for _f in _candidates:
                try:
                    _ldoc = json.load(open(_f))
                except Exception:                            # noqa: BLE001
                    continue

                _types = {_i.get('$type') for _i in (_ldoc.get('Instances') or {}).values()}

                if 'LevelData' not in _types or 'RegistryContainer' not in _types:
                    continue

                for _i in (_ldoc.get('Instances') or {}).values():
                    if _i.get('$type') != 'RegistryContainer':
                        continue

                    if _i.get('EntityRegistry') or _i.get('AssetRegistry'):
                        _src_reg = {'EntityRegistry': _i.get('EntityRegistry') or [],
                                    'AssetRegistry': _i.get('AssetRegistry') or []}
                        break

                if _src_reg:
                    break

            if _src_reg:
                print('registry  carried %d asset(s) and %d entity(ies) from the source level'
                      % (len(_src_reg['AssetRegistry']), len(_src_reg['EntityRegistry'])))
            else:
                print('registry  WARNING: no populated RegistryContainer found under %s -- the '
                      'root will declare no assets, which a client cannot survive' % ebx_dir)

        world_json, world_parts = build_dust2.world_partition(
            extra[0][0], extra[0][1], extra=extra, entities=authored, own_parts=own_parts,
            source_registries=_src_reg)

        # Parts first: a WorldPartReferenceObjectData whose blueprint partition is not in the
        # bundle yet resolves to nothing, and the object silently does not appear.
        for part_json in world_parts:
            part_path = os.path.join(part_dir, '%s.json' % _safe(part_json['Name']))
            json.dump(part_json, open(part_path, 'w'), indent=1)
            cmds.append('add_json_partition %s "%s"' % (_q(part_json['Name']), part_path))

        if world_parts:
            print('world     %d part partition(s)' % (len(world_parts) + 1))

        path = os.path.join(part_dir, 'world.json')
        json.dump(world_json, open(path, 'w'), indent=1)
        cmds.append('add_json_partition %s "%s"' % (_q(build_dust2.WORLD_NAME), path))

    # EVERY LOD chunk, named explicitly, from our own parse of the MeshSet.
    #
    # `add_existing_resource_with_chunks` resolves a mesh's chunks by parsing the resource inside
    # Rime, and that parse fails for a lot of BF3's meshes: MEASURED on MP_001, 271 of 1223
    # resources throw "offset out of bounds" and fall back to searching chunks by asset-name hash,
    # which finds SOME of them. The result is 256 of 523 meshes shipping short of their LODs --
    # roofdome_01 wants 5 chunks and gets 4, box_01_wet wants 2 and gets 1.
    #
    # A missing LOD is invisible on a dedicated server, which never fetches render payloads, and is
    # a livelock on the client: BF3's chunk lookup indexes its own empty-bucket sentinel on a miss
    # instead of terminating, so the player gets a black screen rather than a missing mesh.
    #
    # We do not need Rime's parser for this. meshset.py already read every one of these MeshSets to
    # build the stage, so the LOD chunk guids are known here, and the corpus dump has the bytes.
    # Chunks are keyed by guid in the builder, so naming one that was already attached overwrites
    # it with the same content rather than duplicating it.
    if os.path.isdir(_chunk_dir):
        _wanted = []

        for _line in cmds:
            if not _line.startswith('add_existing_resource_with_chunks '):
                continue

            _rest = _line[len('add_existing_resource_with_chunks '):]
            _res = _rest.split('"')[1] if _rest.startswith('"') else _rest.split(' ')[0]
            _data = index.get(_res.lower())

            if _data is None:
                continue

            try:
                _ms = MeshSet.parse(_data)
            except Exception:                                # noqa: BLE001
                continue

            for _lod in _ms.lods:
                _cid = getattr(_lod, 'data_chunk_id', None)

                if not _cid:
                    continue

                _guid = str(uuid.UUID(bytes_le=_cid))
                _file = os.path.join(_chunk_dir, '%s.chunk' % _guid)

                if os.path.exists(_file):
                    _wanted.append('add_chunk %s %s "%s"' % (_guid, _q(_res), _file))

        if _wanted:
            # Before the trailing build pair, like everything else: build_sb nests, and a line after
            # them runs in a closed context and is silently dropped.
            cmds += _wanted
            print('chunks    %d LOD chunk(s) named explicitly from the corpus dump' % len(_wanted))

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
