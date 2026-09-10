#!/usr/bin/env python3
"""Build de_dust2 as its OWN BF3 object: MeshSet, EBX chain, textures, and a level placement.

Nothing shipped with the game is overwritten. The mesh, its 91 materials, its MeshVariationDatabase
entry, its blueprint, its textures and the sub-level that places it are all new partitions with
fresh guids under a `dust2/` name prefix. Two things are read from shipped data and neither is an
object: the VERTEX DECLARATION (which element sits at which byte, in which format) and the SHADER
the standard BF3 static mesh draws with. Both are format facts -- there is no way to author a mesh
without a declaration the engine recognises, and no way to compile DXBC here.

    build_dust2.py <de_dust2.obj> <format-reference.meshset> <materials-dir> <out-dir>

Writes out-dir/{dust2.meshset, dust2.chunk, dds/*.dds, partitions/*.json, build.cmds}.
"""
import json
import os
import re
import struct
import sys
import uuid

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meshset import MeshSet, Subset                                          # noqa: E402
from vtf_to_dds import convert as vtf_to_dds                                 # noqa: E402

# Source is Z-up right-handed, Frostbite is Y-up. A rotation with determinant +1, so it does NOT
# flip winding; the winding flip below is a separate, conventional difference.
SRC_TO_BF3 = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)        # noqa: E731

# Names are configured per host level. A sub-level partition MUST be named exactly the bundle that
# carries it, minus the "Win32/" prefix: the engine looks a sub-level's DataContainer up BY NAME
# (ResourceManager::lookupDataContainer), and a mismatch returns NULL and crashes the load rather
# than reporting anything. Both name sets below obey that.
HOSTS = {
    # dust2 dropped into a stock level, placed by a runtime SubWorldReferenceObjectData patch.
    'mp001': {
        'world': 'dust2/world', 'bundle': 'Win32/Dust2/World', 'sb': 'Win32/Dust2/Dust2',
        'mesh': 'dust2/dust2_mesh', 'blueprint': 'dust2/dust2',
        'mvdb': 'dust2/meshvariationdb_win32', 'tex': 'dust2/textures/',
        'level_shadow': None,
    },
    # dust2 on the from-scratch blank level, as authored content: the level partition is shadowed
    # with one extra SubWorldReferenceObjectData, so no Lua patches anything at runtime.
    # Same blank-level naming, but NO level shadow: dust2's sub-level is referenced by a runtime
    # SubWorldReferenceObjectData patch instead. Shadowing the host level's own partition turned out
    # to kill the load before any of dust2's content was reached, and debugging someone else's level
    # description is not the job -- the mesh, the 91 materials and the 86 textures are already
    # built, and the patch route never crashed anything.
    'realitymod_patch': {
        'world': 'levels/realitymod/dust2', 'bundle': 'Win32/Levels/REALITYMOD/dust2',
        'sb': 'Win32/Dust2/Dust2',
        'mesh': 'levels/realitymod/dust2/mesh', 'blueprint': 'levels/realitymod/dust2/blueprint',
        'mvdb': 'levels/realitymod/dust2/meshvariationdb_win32',
        'tex': 'levels/realitymod/dust2/textures/',
        'level_shadow': None,
    },
    'realitymod': {
        'world': 'levels/realitymod/dust2', 'bundle': 'Win32/Levels/REALITYMOD/dust2',
        'sb': 'Win32/Dust2/Dust2',
        'mesh': 'levels/realitymod/dust2/mesh', 'blueprint': 'levels/realitymod/dust2/blueprint',
        'mvdb': 'levels/realitymod/dust2/meshvariationdb_win32',
        'tex': 'levels/realitymod/dust2/textures/',
        'level_shadow': 'levels/realitymod/realitymod',
    },
}

# The shipped loadingpallet MeshMaterial: MP_001 places that prop, so its shader permutation is
# compiled into the level's shaderdb. Enabled with DUST2_BORROW_MATERIAL=1.
BORROW_PARTITION = 'objects/loadingpallet_01/loadingpallet_01_mesh'
BORROWED_MATERIAL = ({'PartitionGuid': '19b3beec-4810-6b4a-1feb-a8c8ac98ee46',
                      'InstanceGuid': '12441907-0289-11de-abc3-810b95555a08'}
                     if os.environ.get('DUST2_BORROW_MATERIAL') else None)

MESH_NAME = BLUEPRINT_NAME = MVDB_NAME = WORLD_NAME = TEX_PREFIX = None
PHYSICS_NAME = None
BUNDLE_NAME = SB_NAME = LEVEL_SHADOW = None


def default_host(name):
    """Naming for any level that has no hand-written HOSTS entry.

    The HOSTS table above is dust2-era: every entry hard-codes dust2 paths, so a second level used
    to die on `HOSTS[host]` with a KeyError. These names are only namespaces for the EBX we emit --
    they have to be unique and self-consistent, nothing more (emit() overrides world/bundle/sb from
    its own bundle_name/level_sb arguments anyway). Namespacing by level name gives that for free.

    Existing HOSTS keys still win, so the verified mp001 path is unchanged.
    """
    return {
        'world': 'levels/realitymod/%s' % name,
        'bundle': 'Win32/Levels/REALITYMOD/%s' % name,
        'sb': 'Win32/Levels/REALITYMOD/REALITYMOD',
        'mesh': 'levels/realitymod/%s/mesh' % name,
        'blueprint': 'levels/realitymod/%s/blueprint' % name,
        'mvdb': 'levels/realitymod/%s/meshvariationdb_win32' % name,
        'tex': 'levels/realitymod/%s/textures/' % name,
        'level_shadow': None,
    }


def configure(host):
    global MESH_NAME, BLUEPRINT_NAME, MVDB_NAME, WORLD_NAME, TEX_PREFIX
    global BUNDLE_NAME, SB_NAME, LEVEL_SHADOW, PHYSICS_NAME
    h = HOSTS.get(host) or default_host(host)
    MESH_NAME, BLUEPRINT_NAME = h['mesh'], h['blueprint']
    # Shipped physics resources are named <blueprint>_Physics_<n>_Win32 -- the HavokAsset's Name
    # field is what resolves to the resource, so ours has to follow the same shape.
    PHYSICS_NAME = h['blueprint'] + '_physics_0_win32'
    MVDB_NAME, WORLD_NAME, TEX_PREFIX = h['mvdb'], h['world'], h['tex']
    BUNDLE_NAME, SB_NAME, LEVEL_SHADOW = h['bundle'], h['sb'], h['level_shadow']


configure('mp001')

# The shader every plain BF3 static mesh draws with. Both objects/loadingpallet_01 and
# objects/tires_stack reference this same instance, and tires_stack binds Diffuse/Normal/Specular
# through its MVDB entry -- which is exactly the binding path this build needs.
STATIC_MESH_SHADER = {'PartitionGuid': '7d695128-2252-11e0-af13-c7d193512d44',
                      'InstanceGuid': '2acf6ff2-42a7-c791-0e2b-3acd6a796754'}

# Every guid is derived from a fixed namespace so a rebuild produces the same bundle. A random guid
# per run would make "did the change take, or is the client holding an old partition" unanswerable.
# Shipped partition guids, keyed by lowercased partition name. Populated by the emitter from the
# game corpus.
#
# A partition we emit under a name the game ALREADY SHIPS has to keep that name's guid, or it is a
# different partition wearing the same name. MEASURED: 24 of our partitions reused a shipped name
# with a fresh guid. Partitions resolve first-wins by name, so ours and the game's compete, and any
# reference carrying the shipped guid resolves to the ORIGINAL -- which means an edited mesh can
# silently not appear. Reusing the guid makes our version the same partition, which is what an
# edit-in-place export means.
SHIPPED_GUIDS = {}

# Shipped MeshLodGroup VALUES, keyed by lowercased mesh partition name. Populated by the emitter.
#
# The local lodgroup below stays local -- borrowing the shipped one would make this bundle depend on
# another object's partition being loaded -- but its numbers should be the mesh's OWN. Hardcoding
# Lod1-5Distance to 100000 means the LODs never switch, and these meshes do ship several
# (MEASURED: shipped lodgroups cluster on 20/40/70/100/150, and one mesh carries 3 LOD chunks).
SHIPPED_LODGROUPS = {}

# partition name -> {record type: [instance guid, ...]}, for a partition the game already ships.
#
# Keeping the shipped PARTITION guid is not enough. A game blueprint that places one of these
# meshes references it as (partition guid, INSTANCE guid), and our re-emitted partition wins that
# name -- so if the instances inside carry fresh guids the reference resolves to nothing and the
# placement dies. MEASURED: objects/invisiblecharactercollision_01/charactercollision_01_Mesh keeps
# the shipped partition guid 6508ebc8 and gave its RigidMeshAsset 9179a57f where the game ships
# 54e84e85, and placing that blueprint in the gamemode sub-level exited the server rc=0 with
# nothing logged.
SHIPPED_INSTANCES = {}


# OFF by default, and the measurement is why.
#
# Reusing the shipped instance guids is correct in principle -- a game blueprint that places one of
# our re-emitted meshes names (partition guid, INSTANCE guid), and with fresh instance guids the
# second half resolves to nothing. But turning it on takes MP_001 from Level:Loaded to hanging at
# "Loading terrain", with the build still clean, and ordering the materials by the mesh asset's own
# Materials array (which IS the right order -- the dump lists them differently) does not change it.
# So something else in the level still expects our derived guids and has not been found yet.
#
# The map is built either way, so USD_SHIPPED_INSTANCES=1 re-runs the experiment in one step.
USE_SHIPPED_INSTANCES = os.environ.get('USD_SHIPPED_INSTANCES') == '1'


def shipped_instance(name, kind, index=0, fallback=None):
    """The guid the game gives instance `index` of `kind` in partition `name`, if it ships one."""
    if not USE_SHIPPED_INSTANCES:
        return fallback

    got = (SHIPPED_INSTANCES.get(name.lower()) or {}).get(kind) or []

    return got[index] if index < len(got) else fallback


def partition_guid(name):
    """The shipped guid for `name` if the game ships one, else a stable derived guid."""
    return SHIPPED_GUIDS.get(name.lower()) or guid('partition', name)


NS = uuid.UUID('9d3f1a52-6c41-4f2b-9c7e-0d7a2f0e1b33')
guid = lambda *parts: str(uuid.uuid5(NS, '|'.join(str(p) for p in parts)))    # noqa: E731


def fnv1(text):
    """Frostbite's name hash: seed 5381, multiply by 33, then XOR, over the LOWERCASED name.

    Verified against a shipped MeshAsset -- objects/loadingpallet_01/loadingpallet_01_mesh hashes
    to its stored 893820143.

    The lowercasing is not cosmetic. MEASURED against MP_001's own RigidMeshAssets: every one of
    them stores fnv1 of the lowercased name, and a mesh whose real name has capitals
    (xp_raw/props/signrooftop_01/signrooftop_01_Mesh) hashes to a DIFFERENT value with its case
    kept. Hashing the name as written produced 462 mesh assets whose stored hash matched nothing
    the engine would compute, and the hash is how a mesh is resolved."""
    h = 5381

    for c in text.lower().encode():
        h = (h * 33) & 0xFFFFFFFF
        h ^= c

    return h


# --------------------------------------------------------------------------- geometry

def load_obj_grouped(path):
    pos, uv, groups, current = [], [], [], None

    for line in open(path, 'r', errors='ignore'):
        if line.startswith('v '):
            pos.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            uv.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('usemtl'):
            parts = line.split(None, 1)
            current = (parts[1].strip() if len(parts) > 1 else 'default', [])
            groups.append(current)
        elif line.startswith('f '):
            if current is None:
                current = ('default', [])
                groups.append(current)

            idx = []

            for tok in line.split()[1:]:
                p = tok.split('/')
                idx.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))

            for k in range(1, len(idx) - 1):
                current[1].append((idx[0], idx[k], idx[k + 1]))

    merged = {}

    for name, tris in groups:
        merged.setdefault(name, []).extend(tris)

    return (np.array(pos, np.float64), np.array(uv, np.float64) if uv else np.zeros((1, 2)), merged)


def pack_vertices(decl, n, P, N, T):
    """Fill one vertex block according to the DECLARED element layout.

    This is the part the first attempt got wrong: it wrote float32 positions at offset 0 while the
    declaration says Half3, so bytes 6..11 -- the binormal sign and the first half of the normal --
    were overwritten with the low half of a float. The declaration is authoritative; write what it
    says, in the format it names, at the offset it names.
    """
    vb = np.zeros((n, decl.streams[0].stride), np.uint8)

    for e in decl.elements[:decl.element_count]:
        if e.usage == 1:                                          # Pos, Half3
            vb[:, e.offset:e.offset + 6] = P.astype('<f2').view(np.uint8)
        elif e.usage == 9:                                        # BinormalSign, Half
            vb[:, e.offset:e.offset + 2] = np.ones((n, 1), np.float32).astype('<f2').view(np.uint8)
        elif e.usage == 6:                                        # Normal, Half4
            v4 = np.hstack([N, np.zeros((n, 1), np.float32)])
            vb[:, e.offset:e.offset + 8] = v4.astype('<f2').view(np.uint8)
        elif e.usage == 7:                                        # Tangent, Half4
            t = np.cross(N, np.array([0, 1, 0], np.float32))
            tl = np.linalg.norm(t, axis=1, keepdims=True)
            t = np.divide(t, np.where(tl == 0, 1, tl)).astype(np.float32)
            v4 = np.hstack([t, np.ones((n, 1), np.float32)])
            vb[:, e.offset:e.offset + 8] = v4.astype('<f2').view(np.uint8)
        elif e.usage == 33:                                       # TexCoord0, Half2
            vb[:, e.offset:e.offset + 4] = T.astype('<f2').view(np.uint8)

    return vb


def build_mesh(obj_path, reference, out_resource, out_chunk, loaded=None, transform=True):
    """loaded: (positions, uvs, groups) in place of reading obj_path -- how the USD front end
    feeds this path without going back through an OBJ file. transform=False says the caller's
    positions are already in BF3 space (metres, Y-up, centred), which USD's are."""
    pos, uv, groups = loaded if loaded is not None else load_obj_grouped(obj_path)

    # DUST2_MAX_MATERIALS caps how many OBJ material groups become subsets.
    #
    # The full map builds ONE mesh with 91 materials in a single LOD. Nothing BF3 ships is remotely
    # like that -- vanilla meshes carry 2-4 materials over 4-5 LODs -- and instantiating this
    # blueprint terminates the process (measured: the server resolved the ObjectBlueprint and then
    # exited on CreateEntitiesFromBlueprint). This cap exists to bisect that: build the same mesh
    # with a handful of materials and see whether it instantiates.
    cap = int(os.environ.get('DUST2_MAX_MATERIALS', '0') or 0)

    if cap > 0:
        kept = {}

        for name in sorted(groups, key=lambda k: -len(groups[k]))[:cap]:
            kept[name] = groups[name]

        print('cap       DUST2_MAX_MATERIALS=%d: %d of %d material groups kept'
              % (cap, len(kept), len(groups)))
        groups = kept
    if transform:
        pos = SRC_TO_BF3(pos)

        # Centre the map on the origin in X/Z and put its floor at Y=0, so the single placement can
        # be the identity transform at 0,0,0 and still mean "dust2 is at the world origin".
        lo_all, hi_all = pos.min(axis=0), pos.max(axis=0)
        pos = pos - np.array([(lo_all[0] + hi_all[0]) / 2, lo_all[1],
                              (lo_all[2] + hi_all[2]) / 2])

    ref = MeshSet.parse(open(reference, 'rb').read())
    template = ref.lods[0].subsets[0]
    decl = template.geom_decl
    stride = template.vertex_stride

    ms = MeshSet()
    ms.mesh_type = ref.mesh_type
    ms.flags = ref.flags
    ms.name = MESH_NAME
    ms.short_name = MESH_NAME.rsplit('/', 1)[-1]
    ms.name_hash = fnv1(MESH_NAME)

    lod = type(ref.lods[0])()
    lod.type = ref.lods[0].type
    lod.flags = ref.lods[0].flags
    lod.index_buffer_format = ref.lods[0].index_buffer_format

    # Carry the reference LOD's "no aux vertex index data" sentinel.
    #
    # MeshLayout defaults this to 0, and 0 does not mean "none" -- it means "aux vertex index data
    # begins at offset 0", i.e. it points the engine at the head of our vertex buffer. Measured
    # across the dump corpus: 2704 of 2755 shipped LODs (98.1%) carry 0xFFFFFFFF here, and the
    # reference this mesh is built from is one of them. Copying it, rather than inheriting the
    # dataclass default, is the only correct thing.
    lod.aux_vertex_index_data_offset = ref.lods[0].aux_vertex_index_data_offset
    lod.embedded_edge_data_ptr = ref.lods[0].embedded_edge_data_ptr
    lod.edge_partition_buffer_size = ref.lods[0].edge_partition_buffer_size

    lod.name = MESH_NAME
    lod.short_name = ms.short_name
    lod.shader_debug_name = 'Mesh:' + MESH_NAME
    lod.name_hash = ms.name_hash

    chunk_uuid = uuid.UUID(guid('chunk', MESH_NAME))
    chunk_bytes = bytearray(chunk_uuid.bytes_le)
    chunk_bytes[15] |= 0x01                     # retail mesh chunk ids carry the compression flag
    lod.data_chunk_id = bytes(chunk_bytes)

    vblocks, iblocks, names, all_positions = [], [], [], []
    vbase_bytes = index_base = 0
    lo = np.array([1e30] * 3)
    hi = np.array([-1e30] * 3)

    for name, tris in groups.items():
        if not tris:
            continue

        n = len(tris) * 3

        if n > 65535:
            raise SystemExit('material %r needs %d vertices; 16-bit indices cap a subset at 65535'
                             % (name, n))

        P = np.empty((n, 3), np.float32)
        T = np.empty((n, 2), np.float32)

        # Winding reversed: Source and Frostbite disagree on which vertex order faces front. Left
        # alone every surface is backfacing, and a floor is visible only from underneath.
        for i, tri in enumerate(tris):
            for k, (vi, ti) in enumerate((tri[0], tri[2], tri[1])):
                P[i * 3 + k] = pos[vi]
                # V is flipped: OBJ (and Source) put the UV origin at the BOTTOM-left, Frostbite
                # and D3D put it at the TOP-left. Copying v straight through renders every
                # texture upside down -- which is exactly what it did.
                if 0 <= ti < len(uv):
                    T[i * 3 + k] = (uv[ti][0], 1.0 - uv[ti][1])
                else:
                    T[i * 3 + k] = (0.0, 0.0)

        lo = np.minimum(lo, P.min(axis=0))
        hi = np.maximum(hi, P.max(axis=0))

        e1, e2 = P[1::3] - P[0::3], P[2::3] - P[0::3]
        fn = np.cross(e1, e2)
        ln = np.linalg.norm(fn, axis=1, keepdims=True)
        N = np.repeat(np.divide(fn, np.where(ln == 0, 1, ln)), 3, axis=0).astype(np.float32)

        s = Subset()
        s.material_name = name
        s.material_index = len(lod.subsets)
        s.primitive_count = len(tris)
        s.primitive_type = template.primitive_type
        # Measured off shipped multi-subset meshes (res05, roof): VertexOffset is a BYTE offset into
        # the LOD's single vertex block and StartIndex is an INDEX offset into its single index
        # block, both cumulative -- and each subset's indices are therefore RELATIVE to its own
        # vertex block. res05's second subset has vertex_count 72 with start_index 4572, which only
        # reads consistently under the relative interpretation.
        s.start_index = index_base
        s.vertex_offset = vbase_bytes
        s.vertex_count = n
        s.vertex_stride = stride
        s.geom_decl = decl
        s.texcoord_ratios = list(template.texcoord_ratios)
        lod.subsets.append(s)
        names.append(name)

        all_positions.append(P)
        vblocks.append(pack_vertices(decl, n, P, N, T).tobytes())
        iblocks.append(np.arange(n, dtype='<u2').tobytes())
        vbase_bytes += n * stride
        index_base += n

    # ZOnly subset -- the depth-only pass.
    #
    # Every shipped mesh read for this document has one: res05 puts a single stride-16 subset in
    # category 3 covering all of its triangles, roof puts one per material subset, tires and the
    # pallet one per LOD. dust2 had none, because dropping it halved the chunk and nothing had
    # forced the question -- and both shaderdbs turn out to compile MORE ZOnly permutations of
    # PropPreset than any other mode (370 on mp_subway, 532 on MP_001). A deferred renderer whose
    # depth prepass finds nothing to draw for a mesh is a plausible way to get content that loads,
    # places, occupies the right bounds and never appears.
    #
    # res05's arrangement: ONE subset, whole mesh, its own vertex block at stride 16, its own index
    # range, listed in category 3.
    zonly_template = ref.lods[0].subsets[1] if len(ref.lods[0].subsets) > 1 else None

    if zonly_template is not None and not os.environ.get('DUST2_NO_ZONLY'):
        z = Subset()
        z.material_name = ''
        z.material_index = 0
        z.primitive_count = index_base // 3
        z.primitive_type = zonly_template.primitive_type
        z.start_index = index_base
        z.vertex_offset = vbase_bytes
        z.vertex_count = index_base
        z.vertex_stride = zonly_template.vertex_stride
        z.geom_decl = zonly_template.geom_decl
        z.texcoord_ratios = list(zonly_template.texcoord_ratios)

        zb = np.zeros((index_base, z.vertex_stride), np.uint8)
        allP = np.concatenate(all_positions, axis=0)
        P4 = np.hstack([allP, np.ones((index_base, 1), np.float32)])
        zb[:, 0:8] = P4.astype('<f2').view(np.uint8)      # Pos, Half4 at offset 0
        vblocks.append(zb.tobytes())
        iblocks.append(np.arange(index_base, dtype='<u2').tobytes())

        lod.subsets.append(z)
        lod.category_indices = [list(range(len(lod.subsets) - 1)), [], [], [len(lod.subsets) - 1]]
        vbase_bytes += index_base * z.vertex_stride
        index_base += index_base
    else:
        lod.category_indices = [list(range(len(lod.subsets))), [], [], []]

    # Mirror the reference's null-ness: a category array can be non-null with count 0, and that
    # survives into the relocation table.
    lod.category_present = list(ref.lods[0].category_present)
    lod.vertex_data_size = vbase_bytes
    lod.index_data_size = index_base * 2

    ms.total_subset_count = len(lod.subsets)
    ms.lods = [lod]
    ms.bbox_min = tuple(float(x) for x in lo)
    ms.bbox_max = tuple(float(x) for x in hi)

    payload, meta = ms.serialize()
    open(out_resource, 'wb').write(payload)

    chunk = b''.join(vblocks) + b''.join(iblocks)
    chunk += b'\0' * ((-len(chunk)) % 16)
    open(out_chunk, 'wb').write(chunk)

    return {'names': names, 'meta': meta.hex().upper(), 'chunk_guid': str(chunk_uuid),
            'tris': index_base // 3, 'verts': vbase_bytes // stride,
            'bbox': (lo.tolist(), hi.tolist()), 'resource_bytes': len(payload),
            'chunk_bytes': len(chunk)}


# --------------------------------------------------------------------------- materials / textures

def strip_vmt_comments(text):
    """A VMT comments out with // to end of line. Honour it: dust2 has parameters Valve DISABLED
    that way -- eighteen $bumpmaps and counting -- and reading them binds maps the game never uses.
    Quoted values are left alone, since a path may legitimately contain a slash pair.
    """
    out = []

    for line in text.splitlines():
        quoted = False

        for i in range(len(line) - 1):
            if line[i] == '"':
                quoted = not quoted
            elif not quoted and line[i] == '/' and line[i + 1] == '/':
                line = line[:i]
                break

        out.append(line)

    return '\n'.join(out)


def parse_vmt(text, mat_dir, depth=0, param='$basetexture'):
    """One texture parameter out of a VMT, following `patch { include ... }` one hop at a time.

    The six materials the BSP carries in its own pakfile are patch stubs: they set $envmap for a
    baked cubemap and inherit everything else, so the colour map is only reachable through the
    include. Read them literally and dust2's tile floor comes back with no texture at all.
    """
    text = strip_vmt_comments(text)
    m = re.findall(r'"?%s"?\s+"?([^"\r\n]+)"?' % re.escape(param), text, re.I)

    if m:
        return m[0].strip().replace('\\', '/').lower().rstrip('/')

    inc = re.findall(r'"?include"?\s+"?([^"\r\n]+)"?', text, re.I)

    if inc and depth < 4:
        target = inc[0].strip().replace('\\', '/').lower()
        target = re.sub(r'^materials/', '', target)
        target = re.sub(r'\.vmt$', '', target)
        path = os.path.join(mat_dir, target.replace('/', '__') + '.vmt')

        if os.path.exists(path):
            return parse_vmt(open(path, 'r', errors='ignore').read(), mat_dir, depth + 1, param)

    return None


def texture_partition_name(base):
    return TEX_PREFIX + base


def collect_textures(material_names, mat_dir, pak_vmt_dir):
    """material -> colour map, material -> normal map, and the materials with neither.

    73 of dust2's 86 materials carry a $bumpmap. Binding them all to one flat normal -- which is
    what this did -- throws away every surface's relief: the shader still runs, so nothing looks
    broken, it just looks like plastic.
    """
    binding, normals, missing = {}, {}, []

    for name in material_names:
        key = name.lower().replace('/', '__')
        vmt = os.path.join(mat_dir, key + '.vmt')

        if not os.path.exists(vmt):
            # The six maps/de_dust2/... materials are cubemap-patched copies the compiler wrote into
            # the BSP's own pakfile; they never existed in the game's material tree.
            vmt = os.path.join(pak_vmt_dir, key + '.vmt')

        if not os.path.exists(vmt):
            missing.append(name)
            continue

        text = open(vmt, 'r', errors='ignore').read()
        base = parse_vmt(text, mat_dir)

        if not base or not os.path.exists(os.path.join(mat_dir, base.replace('/', '__') + '.vtf')):
            missing.append(name)
            continue

        binding[name] = base
        bump = parse_vmt(text, mat_dir, param='$bumpmap')

        if bump and os.path.exists(os.path.join(mat_dir, bump.replace('/', '__') + '.vtf')):
            normals[name] = bump

    return binding, normals, missing


def write_dds(binding, mat_dir, dds_dir, normals=None):
    os.makedirs(dds_dir, exist_ok=True)
    written, failed = {}, {}
    wanted = set(binding.values()) | set((normals or {}).values())

    for base in sorted(wanted):
        src = os.path.join(mat_dir, base.replace('/', '__') + '.vtf')
        dst = os.path.join(dds_dir, base.replace('/', '__') + '.dds')

        try:
            vtf_to_dds(src, dst)
            written[base] = dst
        except Exception as ex:                                   # noqa: BLE001
            failed[base] = str(ex)

    # One flat normal map, so the shader's Normal slot is bound to something sane rather than left
    # to sample whatever the pool last had there.
    flat = os.path.join(dds_dir, '_flat_n.dds')
    _write_flat_normal(flat)
    return written, failed, flat


def _write_flat_normal(path):
    """A 4x4 DXT1 block that decodes to a constant (128, 128, 255)."""
    def rgb565(r, g, b):
        return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)

    c = rgb565(128, 128, 255)
    block = struct.pack('<HHI', c, c, 0)
    header = bytearray(124)
    struct.pack_into('<I', header, 0, 124)
    struct.pack_into('<I', header, 4, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000)
    struct.pack_into('<I', header, 8, 4)
    struct.pack_into('<I', header, 12, 4)
    struct.pack_into('<I', header, 16, 8)
    struct.pack_into('<I', header, 24, 1)
    struct.pack_into('<I', header, 72, 32)
    struct.pack_into('<I', header, 76, 0x4)
    header[80:84] = b'DXT1'
    struct.pack_into('<I', header, 104, 0x1000)
    open(path, 'wb').write(b'DDS ' + bytes(header) + block)


# --------------------------------------------------------------------------- EBX partitions

def ref(partition, instance):
    return {'PartitionGuid': partition, 'InstanceGuid': instance}



def level_shadow_partition(level_json_path, bundle_name):
    """The host level's own partition, plus ONE extra SubWorldReferenceObjectData naming our bundle.

    This is what makes dust2 authored level content rather than something Lua bolts on at runtime:
    the level itself lists the sub-level, exactly the way it already lists `teamdeathmatch` and
    `tdm2`. The mod's Lua is then only a mount and a prepend, and the prepend is what makes this
    copy of the partition win over the one shipped in the level's own bundle.

    `BundleName` carries no "Win32/" prefix -- the level's existing entries read
    `Levels/REALITYMOD/teamdeathmatch`, and the engine adds the platform prefix itself.
    """
    level = json.load(open(level_json_path))
    pg = level['PartitionGuid']
    data = level['Instances'][level['PrimaryInstanceGuid']]
    registry = level['Instances'][data['RegistryContainer']['InstanceGuid']]

    swrod_g = guid('instance', 'levelshadow', bundle_name, 'swrod')
    highest = 0

    for inst in level['Instances'].values():
        idx = inst.get('IndexInBlueprint')

        if isinstance(idx, int) and idx != 65535 and idx > highest:
            highest = idx

    level['Instances'][swrod_g] = {
        '$type': 'SubWorldReferenceObjectData',
        'BundleName': bundle_name,
        # No InclusionSettings: the two shipped entries gate themselves on the gamemode criterion,
        # and dust2 should be present whatever the gamemode is.
        'InclusionSettings': None,
        'AutoLoad': True,
        'IsWin32SubLevel': True, 'IsXenonSubLevel': True, 'IsPs3SubLevel': True,
        'BlueprintTransform': {'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
                               'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
                               'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
                               'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}},
        'Blueprint': None, 'ObjectVariation': None, 'StreamRealm': 'StreamRealm_Both',
        'CastSunShadowEnable': True, 'Excluded': False,
        'IndexInBlueprint': highest + 1,
        'IsEventConnectionTarget': 2, 'IsPropertyConnectionTarget': 3,
    }

    data['Objects'].append(ref(pg, swrod_g))
    registry['ReferenceObjectRegistry'].append(ref(pg, swrod_g))
    return level


def mesh_partition(material_names, material_ebx=None):
    """The mesh's EBX. With material_ebx, each MeshMaterial is the REAL record read back out of the
    stage rather than the template below -- so a level keeps its own 252 shader graphs instead of
    being flattened onto one."""
    pg = partition_guid(MESH_NAME)
    # The shipped instance guids where the game ships this partition, so a game blueprint that
    # places this mesh still resolves the asset it names. See SHIPPED_INSTANCES.
    mesh_g = (shipped_instance(MESH_NAME, 'RigidMeshAsset')
              or shipped_instance(MESH_NAME, 'MeshAsset')
              or shipped_instance(MESH_NAME, 'CompositeMeshAsset')
              or shipped_instance(MESH_NAME, 'SkinnedMeshAsset')
              or guid('instance', MESH_NAME, 'asset'))
    lod_g = (shipped_instance(MESH_NAME, 'MeshLodGroup')
             or guid('instance', MESH_NAME, 'lodgroup'))
    instances = {}
    material_guids = []

    for i, name in enumerate(material_names):
        g = (shipped_instance(MESH_NAME, 'MeshMaterial', i)
             or guid('instance', MESH_NAME, 'material', i, name))
        material_guids.append(g)

        if material_ebx and i < len(material_ebx) and material_ebx[i]:
            instances[g] = dict(material_ebx[i])
            instances[g]['$type'] = 'MeshMaterial'
            continue

        instances[g] = {
            '$type': 'MeshMaterial',
            'ShaderInstance': None,
            'Shader': {
                'Shader': STATIC_MESH_SHADER,
                'BoolParameters': [],
                # The shader's scalar constants.
                #
                # MEASURED from the vanilla loadingpallet MeshMaterial, which points at this exact
                # same ShaderGraph instance: it carries FresnelExponent and SpecularScale, both
                # 0.5, and an EMPTY TextureParameters (textures come from the MVDB, not here).
                # Ours shipped with no parameters at all, so the shader was being set up without
                # the constants it declares.
                'VectorParameters': [
                    {'Value': {'x': 0.5, 'y': 0.0, 'z': 0.0, 'w': 0.0},
                     'ParameterType': 'ShaderParameterType_Scalar',
                     'ParameterName': 'FresnelExponent'},
                    {'Value': {'x': 0.5, 'y': 0.0, 'z': 0.0, 'w': 0.0},
                     'ParameterType': 'ShaderParameterType_Scalar',
                     'ParameterName': 'SpecularScale'},
                ],
                'VectorArrayParameters': [],
                'TextureParameters': [],
            },
        }

    # Authored here rather than referenced: every shipped mesh points at a MeshLodGroup living in
    # some other object's partition, and borrowing one would make this bundle depend on that object
    # being loaded. It is seven floats.
    _lod = SHIPPED_LODGROUPS.get(MESH_NAME.lower()) or {}

    instances[lod_g] = {
        '$type': 'MeshLodGroup', 'Name': MESH_NAME + '_lodgroup',
        'Lod1Distance': _lod.get('Lod1Distance', 100000.0),
        'Lod2Distance': _lod.get('Lod2Distance', 100000.0),
        'Lod3Distance': _lod.get('Lod3Distance', 100000.0),
        'Lod4Distance': _lod.get('Lod4Distance', 100000.0),
        'Lod5Distance': _lod.get('Lod5Distance', 100000.0),
        # 0.02, matching every shipped lodgroup measured.
        #
        # This used to be 0.0 on the reasoning that "zero area means never cull by screen coverage,
        # which is what a single-LOD mesh wants". That was an assumption, never checked, and it is
        # the kind of value a screen-coverage test divides by. The complete vanilla lodgroup
        # (lodgroups/Xenon_SkipAndStreamNoLODs, dumped from the game) uses 0.02, so use that.
        'ShadowDistance': _lod.get('ShadowDistance', 0.0),
        'CullScreenArea': _lod.get('CullScreenArea', 0.02),
    }

    instances[mesh_g] = {
        '$type': 'RigidMeshAsset',
        'Name': MESH_NAME,
        'LodGroup': ref(pg, lod_g),
        'LodScale': 1.0,
        'CullScale': 1.0,
        'NameHash': fnv1(MESH_NAME),
        'EnlightenType': 'EnlightenType_Dynamic',
        # DUST2_BORROW_MATERIAL: reference a SHIPPED MeshMaterial instead of our own.
        #
        # A Frostbite material is only drawable if a compiled permutation for it exists in a
        # shaderdb the level loads. Our bundle authors brand-new MeshMaterial instances and ships
        # no shaderdb, so nothing was ever compiled for them -- which fits every symptom: the
        # entity constructs, the asset chain resolves, and no geometry is rasterised, regardless of
        # mesh size. Borrowing a material whose permutation is already in the level's shaderdb
        # tests that directly.
        'Materials': ([BORROWED_MATERIAL] * len(material_guids)) if BORROWED_MATERIAL
                     else [ref(pg, g) for g in material_guids],
        'OccluderHighPriority': False,
        # True, matching every shipped mesh asset measured.
        #
        # The old reasoning here was "everything ships inside this bundle, so there is no streaming
        # pool to fetch from". That misreads what the flag is about: our geometry lives in a CHUNK
        # (build.cmds does `add_chunk`), and chunks ARE the mechanism the mesh streamer reads
        # through. The vanilla loadingpallet asset is chunked exactly the same way and sets True;
        # StreamingEnable was the ONLY field differing between our RigidMeshAsset and its.
        'StreamingEnable': True,
        'DestructionMaterialEnable': False,
        'OccluderMeshEnable': False,
    }

    return ({'PartitionGuid': pg, 'PrimaryInstanceGuid': mesh_g, 'Name': MESH_NAME,
             'Instances': instances}, pg, mesh_g, material_guids)


def blueprint_partition(mesh_pg, mesh_g, with_physics=True):
    pg = partition_guid(BLUEPRINT_NAME)
    bp_g = guid('instance', BLUEPRINT_NAME, 'blueprint')
    smed_g = guid('instance', BLUEPRINT_NAME, 'staticmodel')
    part_g = guid('instance', BLUEPRINT_NAME, 'partcomponent')
    hs_alive_g = guid('instance', BLUEPRINT_NAME, 'healthstate', 'alive')
    hs_dead_g = guid('instance', BLUEPRINT_NAME, 'healthstate', 'dead')
    phys_g = guid('instance', BLUEPRINT_NAME, 'physicsentity')
    hk_g = guid('instance', BLUEPRINT_NAME, 'havokasset')
    hk2_g = guid('instance', BLUEPRINT_NAME, 'havokasset', 'raycast')
    rb_g = guid('instance', BLUEPRINT_NAME, 'rigidbody')
    rb2_g = guid('instance', BLUEPRINT_NAME, 'rigidbody', 'raycast')
    identity = {'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
                'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
                'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
                'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}}

    instances = {
        bp_g: {
            '$type': 'ObjectBlueprint', 'Name': BLUEPRINT_NAME,
            'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
            'Descriptor': None, 'NeedNetworkId': False, 'InterfaceHasConnections': False,
            'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
            'Object': ref(pg, smed_g),
        },
        smed_g: {
            # StaticModelEntityData with its COMPLETE field list.
            #
            # This was previously a RigidMeshEntityData carrying only {IndexInBlueprint,
            # IsEvent/PropertyConnectionTarget, Transform, Mesh} -- five fields. Instantiating that
            # blueprint crashed the process with a DEP/EXECUTE access violation at an address in no
            # loaded module (0x51472861), i.e. a call through an uninitialised function pointer,
            # which is what constructing an entity from a half-populated data type looks like.
            #
            # MEASURED against the shipped Objects/LoadingPallet_01 blueprint: BF3 uses
            # StaticModelEntityData for placed static geometry, with SIXTEEN fields. An earlier
            # attempt at StaticModelEntityData died at "Creating material grid", but that attempt
            # carried the same five fields -- the type was right and the payload was not.
            #
            # Physics is deliberately absent, not omitted: PhysicsData null, PhysicsPartInfos and
            # PartLinks empty, and NetworkInfo with a zero id count. There is no Havok for this mesh
            # to reference, so it must describe itself as having none rather than leave the fields
            # off entirely.
            '$type': 'StaticModelEntityData',
            'IndexInBlueprint': 0, 'IsEventConnectionTarget': 2, 'IsPropertyConnectionTarget': 2,
            'Transform': identity,
            # A StaticModelEntityData draws THROUGH a part component.
            #
            # MEASURED on the shipped loadingpallet blueprint: Components holds one
            # PartComponentData, RuntimeComponentCount is 1, and PhysicsPartInfos maps part 0 to
            # health state 0. Ours carried an empty component list and a zero count -- an entity
            # with no parts has nothing to render, which matches the symptom exactly: the entity
            # constructs on both realms and no geometry is ever rasterised.
            'Components': [ref(pg, part_g)],
            'Enabled': True,
            'RuntimeComponentCount': 1,
            'PhysicsData': ref(pg, phys_g) if with_physics else None,
            'PartLinks': [],
            'Mesh': ref(mesh_pg, mesh_g),
            # One bone per part plus a root, with a pose each. The shipped building has 21 parts
            # and BoneCount 22; ours had 1 part and BoneCount 0, so anything indexing a bone by
            # part index read off the end -- which is what PhysicsPartInfos makes the physics
            # system do.
            'BoneCount': 2,
            'BasePoseTransforms': [identity, identity],
            'NetworkInfo': {'PartNetworkIdRanges': [], 'NetworkIdCount': 0,
                            'ChildNetworkInfos': [], 'ChildNetworkIdCount': 0},
            # Maps part 0 to health state 0, exactly as the shipped loadingpallet blueprint does.
            #
            # This was EMPTY for as long as PhysicsData was null: setting it while there was no
            # physics data to resolve HUNG the client during level load -- no crash dump, six
            # minutes of silence. Now that PhysicsData resolves to a real PhysicsEntityData the
            # entry has something to point at, which is the arrangement every shipped static model
            # uses.
            'PhysicsPartInfos': ([{'PartComponentIndex': 0, 'HealthStateIndex': 0}]
                                 if with_physics else []),
            # Static level geometry, explicitly not destructible.
            'ExcludeFromNearbyObjectDestruction': True,
            'AnimatePhysics': False,
            'Visible': True,
        },
    }

    # The part the mesh is drawn as, with the alive/dead health pair every shipped static model
    # carries. Health is huge and CanSupportOtherParts false: this is indestructible scenery.
    instances[part_g] = {
        '$type': 'PartComponentData', 'IndexInBlueprint': 1,
        'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
        'Transform': identity, 'Components': [], 'Excluded': False,
        # ONE health state per part, as the shipped building has -- 21 parts, 21 states. The
        # second state here was a dead/alive pair that no shipped static model carries, and it
        # left the part's state list a different length to its part count.
        'HealthStates': [ref(pg, hs_alive_g)],
        'PartLinks': [], 'IsSupported': False, 'IsFragile': False,
        'IsNetworkable': False, 'IsWindow': False, 'AnimatePhysics': False,
    }
    instances[hs_alive_g] = {
        '$type': 'HealthStateData', 'Objects': [], 'LoosePartPhysics': [],
        'SpawnedBangerBlueprint': None, 'SpawnedBangerImpulseParams': None,
        'Health': 10000000.0, 'PartIndex': 0, 'PhysicsEnabled': True,
        'CopyDamageToBanger': False, 'CanSupportOtherParts': True,
    }
    instances[hs_dead_g] = {
        '$type': 'HealthStateData', 'Objects': [], 'LoosePartPhysics': [],
        'SpawnedBangerBlueprint': None, 'SpawnedBangerImpulseParams': None,
        'Health': 0.0, 'PartIndex': 4294967295, 'PhysicsEnabled': True,
        'CopyDamageToBanger': False, 'CanSupportOtherParts': False,
    }

    # --- physics, shaped after Objects/LoadingPallet_01, which keeps all three of these in the
    # blueprint's own partition rather than a separate one.
    #
    # The 1000010.0 sentinels are not a placeholder: that is literally what the shipped
    # PhysicsEntityData carries in every scalar it does not override, and the per-body values in
    # RigidBodyData are what actually apply.
    if with_physics:
        instances[phys_g] = {
            '$type': 'PhysicsEntityData',
            'IndexInBlueprint': 65535, 'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
            'InertiaModifier': {'x': 1.0, 'y': 1.0, 'z': 1.0},
            # TWO bodies, as every shipped static model has: one the world collides with and one
            # rays are traced against. A single entry is not a smaller version of this -- the
            # engine indexes both.
            # One asset, one body: the shipped BUILDING has exactly this. The pallet's second
            # raycast pair is a movable prop's arrangement, not level geometry's.
            'ScaledAssets': [ref(pg, hk_g)],
            'RigidBodies': [ref(pg, rb_g)],
            'Asset': None, 'FloatPhysics': None,
            # Damping is -1.0 ("use the body's own"), not the 1000010.0 sentinel. The pallet
            # carries the sentinel in every scalar; the shipped BUILDING -- which is what dust2
            # actually is -- carries -1.0 for the two dampings.
            'Mass': 1000010.0, 'Restitution': 1000010.0, 'Friction': 1000010.0,
            'LinearVelocityDamping': -1.0, 'AngularVelocityDamping': -1.0,
            # The COMPLETE field list, in the shipped order. Four of these were missing and the
            # server died silently at entity instantiation -- no crash dump, exit 1 straight after
            # "captured SubWorldData". An EBX instance shorter than its type reads past its own
            # end, which is the same failure StaticModelEntityData hit earlier in this work.
            # An EMPTY array, not a null one: the shipped building's dump reads *nullArray* here,
            # but Rime's writer dereferences the list unconditionally and a null crashes it. The
            # distinction is untested for that reason, not because it was ruled out.
            'Proximity': None, 'Constraints': [],
            'EncapsulatePartsInLists': False, 'MovableParts': False,
        }
        instances[hk_g] = {
            # Name is the RESOURCE name -- this string is how the engine finds the HavokPhysicsData.
            #
            # DUST2_BORROW_PHYSICS names a SHIPPED resource instead, which separates two failures
            # that look identical from outside: physics EBX wired wrongly, and physics EBX wired
            # correctly around a HavokPhysicsData the engine will not accept.
            '$type': 'HavokAsset',
            'Name': os.environ.get('DUST2_BORROW_PHYSICS') or PHYSICS_NAME,
            'Scale': 1.0, 'ExternalAssets': [],
        }
        instances[hk2_g] = {
            '$type': 'HavokAsset',
            'Name': os.environ.get('DUST2_BORROW_PHYSICS') or PHYSICS_NAME,
            'Scale': 1.2, 'ExternalAssets': [],
        }
        instances[rb2_g] = {
            '$type': 'RigidBodyData',
            'InertiaModifier': {'x': 1.0, 'y': 1.0, 'z': 1.0},
            'RigidBodyType': 'RBTypeRaycast',
            'Mass': 0.0, 'Restitution': 0.4, 'Friction': 0.5,
            'AngularVelocityDamping': -1.0, 'LinearVelocityDamping': -1.0,
            'InteractionToolkitCollisionVolumeId': 0,
            'MotionType': 'RigidBodyMotionType_Fixed',
            'QualityType': 'RigidBodyQualityType_Invalid',
            'CollisionLayer': 'RigidBodyCollisionLayer_Invalid',
            'FloatPhysics': None, 'Constraints': [],
        }
        instances[rb_g] = {
            '$type': 'RigidBodyData',
            'InertiaModifier': {'x': 1.0, 'y': 1.0, 'z': 1.0},
            'RigidBodyType': 'RBTypeCollision',
            # The shipped pallet's own values. Mass is meaningless for a fixed body, but "should
            # not matter" is exactly the assumption worth removing while bisecting.
            'Mass': 10000.0, 'Restitution': 0.4, 'Friction': 0.5,
            'AngularVelocityDamping': -1.0, 'LinearVelocityDamping': -1.0,
            'InteractionToolkitCollisionVolumeId': 0,
            'MotionType': 'RigidBodyMotionType_Fixed',
            'QualityType': 'RigidBodyQualityType_Invalid',
            'CollisionLayer': 'RigidBodyCollisionLayer_Invalid',
            'FloatPhysics': None, 'Constraints': [],
        }

    return ({'PartitionGuid': pg, 'PrimaryInstanceGuid': bp_g, 'Name': BLUEPRINT_NAME,
             'Instances': instances}, pg, bp_g)


def texture_partitions(binding, shipped, flat_name):
    """One TextureAsset partition per shipped DDS. A TextureBaseAsset carries no fields of its own
    beyond Asset.Name, and the engine matches it to the DxTexture resource of the same name."""
    partitions = {}

    for base in sorted(set(shipped)) + [flat_name]:
        name = texture_partition_name(base)
        pg = guid('partition', name)
        ig = guid('instance', name)
        partitions[base] = ({'PartitionGuid': pg, 'PrimaryInstanceGuid': ig, 'Name': name,
                             'Instances': {ig: {'$type': 'TextureAsset', 'Name': name}}}, pg, ig)

    return partitions


def mvdb_entry(key, mesh_pg, mesh_g, material_guids, material_names, binding, textures,
               flat_name, normals=None):
    """One mesh's MeshVariationDatabaseEntry, to be collected into the bundle's single database.

    `key` distinguishes entries within that database; every entry lives in the database's own
    partition, so the guids are derived from MVDB_NAME rather than from the mesh's partition.
    """
    pg = guid('partition', MVDB_NAME)
    entry_g = guid('instance', MVDB_NAME, 'entry', key)
    _, flat_pg, flat_ig = textures[flat_name]
    materials, bound = [], 0

    for i, (mg, mname) in enumerate(zip(material_guids, material_names)):
        if BORROWED_MATERIAL:
            materials.append({'Material': BORROWED_MATERIAL, 'MaterialVariation': None,
                              'TextureParameters': []})
            bound += 1
            continue

        params = []
        base = binding.get(mname)

        if base and base in textures:
            _, tpg, tig = textures[base]
            bump = (normals or {}).get(mname)
            npg, nig = (textures[bump][1], textures[bump][2]) if bump in textures \
                else (flat_pg, flat_ig)
            # Diffuse and Specular both point at the colour map, which is what shipped meshes do --
            # objects/tires_stack binds tires_stacks_d to both. Normal takes the material's own
            # $bumpmap where Source had one, and the flat map only where it did not.
            params = [{'ParameterName': 'Diffuse', 'Value': ref(tpg, tig)},
                      {'ParameterName': 'Normal', 'Value': ref(npg, nig)},
                      {'ParameterName': 'Specular', 'Value': ref(tpg, tig)}]
            bound += 1

        materials.append({'Material': ref(mesh_pg, mg), 'MaterialVariation': None,
                          'TextureParameters': params})

    return (entry_g,
            {entry_g: {'$type': 'MeshVariationDatabaseEntry', 'Mesh': ref(mesh_pg, mesh_g),
                       # 0 is the base appearance: a mesh with no ObjectVariation realises with it.
                       'VariationAssetNameHash': 0, 'Materials': materials}},
            bound)


def mvdb_partition(entries):
    """THE MeshVariationDatabase for the bundle -- one, holding every mesh's entry.

    A database per mesh resolves too, so this is not what makes the level load; shipped bundles
    simply carry exactly one however many meshes they hold (MEASURED: no shipped level has a
    second), and one database with N entries is the arrangement the engine is known to read.
    """
    pg = guid('partition', MVDB_NAME)
    db_g = guid('instance', MVDB_NAME, 'db')
    # Name is REQUIRED: MeshVariationDatabase derives from Asset -> DataContainer, and every
    # shipped MVDB carries it (e.g. "Levels/COOP_002/AB01_Art_Parent/MeshVariationDb_Win32").
    # Ours had none. The engine resolves a mesh's material bindings through the MVDB index, so an
    # unnamed database can never be found there -- which is exactly the symptom seen: the asset
    # chain resolves, the entity constructs on both realms, and nothing is ever drawn.
    instances = {db_g: {'$type': 'MeshVariationDatabase', 'Name': MVDB_NAME,
                        'Entries': [ref(pg, entry_g) for entry_g, _ in entries],
                        'RedirectEntries': []}}

    for _, entry_instances in entries:
        instances.update(entry_instances)

    return {'PartitionGuid': pg, 'PrimaryInstanceGuid': db_g, 'Name': MVDB_NAME,
            'Instances': instances}


def roads_partition(roads, name):
    """A WorldPartData holding one RoadData per road -- how BF3 ships them.

    MEASURED off levels/mp_001/mp_001/layer29_terraindecals, which is exactly this: one
    WorldPartData whose Objects are 109 RoadData and nothing else. A road is a spline, not a mesh:
    Points carry the centre line, RibbonPoints the half-width either side of each sampled point
    (Left positive, Right negative), and the engine tessellates the ribbon and drapes it.

    RibbonPoints is NOT per Point -- the shipped roads carry 2 points and 28 ribbon points, so it is
    sampled along the spline independently. Emitting one per point draws a road that ends early.

    `roads` is [{points, widths, uvTile, stick, order, shader2d}] with points in BF3 world space.
    """
    pg = guid('partition', name)
    part_g = guid('instance', name, 'worldpart')
    objects, instances = [], {}

    for i, road in enumerate(roads):
        pts = road['points']

        if len(pts) < 2:
            continue

        rg = guid('instance', name, 'road', i)
        widths = road.get('widths') or []
        ribbon = []

        for j in range(len(widths) or len(pts)):
            left, right = (widths[j] if j < len(widths) else (0.15, -0.15))
            ribbon.append({
                # The per-channel masks the terrain shader blends the ribbon with. Every shipped
                # road sets all four to 1 on both sides; nothing here needs them varied.
                'UserMaskRight': {'x': 1.0, 'y': 1.0, 'z': 1.0, 'w': 1.0},
                'UserMaskLeft': {'x': 1.0, 'y': 1.0, 'z': 1.0, 'w': 1.0},
                'Right': float(right), 'Left': float(left),
            })

        instances[rg] = {
            '$type': 'RoadData', 'IndexInBlueprint': 2666 + i,
            'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
            'Points': [{'x': float(x), 'y': float(y), 'z': float(z)} for x, y, z in pts],
            'Normals': [{'x': 0.0, 'y': 1.0, 'z': 0.0} for _ in pts],
            'Tension': 0.5, 'IsClosed': False, 'AllowRoll': False, 'ErrorTolerance': 0.1,
            'Shader3d': road.get('shader3d'), 'DrawOrderIndex': int(road.get('order', 100)),
            'TessellationTriangleSize': 4.0, 'RibbonPoints': ribbon,
            'Shader2d': road.get('shader2d'), 'Shader3dZOnly': None,
            'UvTileFactor': float(road.get('uvTile', 1.0)),
            'StickToTerrain': bool(road.get('stick', True)),
        }
        objects.append(ref(pg, rg))

    instances[part_g] = {
        '$type': 'WorldPartData', 'Name': name,
        'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
        'Descriptor': None, 'NeedNetworkId': False, 'InterfaceHasConnections': False,
        'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
        # A GUID string despite the name and despite reading like a flag -- the shipped
        # TerrainDecals part carries one, and writing False here aborts the build with a
        # Boolean-to-String cast.
        'Objects': objects, 'HackToSolveRealTimeTweakingIssue': guid('hack', name),
        'UseDeferredEntityCreation': False, 'Enabled': True,
    }

    return ({'PartitionGuid': pg, 'PrimaryInstanceGuid': part_g, 'Name': name,
             'Instances': instances}, pg, part_g, len(objects))


# How many placements one WorldPartData may hold before the next is started.
#
# MEASURED on MP_001: it spreads 3410 placements over 53 WorldPartData -- median 21, largest 904
# (layer20_streetprops). Nothing the game ships puts thousands in one part, and an emitted level
# that did stopped loading somewhere between 710 and 3018 placements: the server either sat in the
# level load forever or died partway through it. 256 keeps every part comfortably inside the range
# the engine is known to handle while keeping the part count small.
PART_MAX = 256


# The instance types the game keeps INSIDE a world part, rather than in the level partition or a
# bundle of their own. MEASURED across MP_001's 34 layer partitions, which hold 2850 instances:
# layer20_streetprops alone carries 585 ReferenceObjectData, 309 DecalEntityData, 8 PointLight and
# 1 SpotLight in a single WorldPartData.
#
# These are the level's CONTENT, and for a level authored from a stage they have to be written into
# our own partitions. Referencing the source level's partitions instead does not work: they belong
# to that level, and dropping them into a different one collides -- its MeshVariationDatabases
# fight ours, and that is only the first of several conflicts.
# VehicleSpawnReferenceObjectData is DELIBERATELY absent, and it is the one type that stops a
# level being playable. Bisected type by type against a live server, using "accepting connections"
# rather than "Level:Loaded" as the test: an empty world part accepts, and so does every type here
# -- 1976 ReferenceObjectData, 411 AlternateSpawn, 348 decals, 139 effects, 115 roads, the lights,
# the volumes, the sound. Add the 21 VehicleSpawnReferenceObjectData and the server loads the level
# and then refuses connections.
#
# They place 7 vehicle blueprints (kornet, m1abrams, bmp2, lav25, tow2, vodnik, humvee) that the
# bundle does not carry, and carrying them is not cheap: the blueprints alone are 375 instances
# each and reach 205 further partitions one level out, into weapons, ai, sound and fx. MEASURED --
# reference_existing_partition on the seven took the superbundle to 357 MB and exited rc=1; raw
# copies plus their meshes and physics resources built at 6 MB and the server hung instead.
#
# So a vehicle spawn is dropped rather than shipped broken, and USD_VEHICLE_SPAWNS=1 puts them
# back for anyone continuing that work. Everything else about the level is unaffected: 5864
# entities, teams, and a server that accepts connections.
WORLD_PART_TYPES = (
    'ReferenceObjectData', 'DecalEntityData', 'EffectReferenceObjectData', 'RoadData',
    'LightProbeVolumeData', 'VolumeVectorShapeData', 'SoundEntityData', 'LocatorEntityData',
    'OccluderVolumeEntityData', 'EmitterExclusionVolumeData', 'IrReverbEntityData',
    'SoundAreaEntityData', 'PointLightEntityData', 'SpotLightEntityData',
    # SPAWNS. Without these the level loads and a player connects, but the server reports
    # `team=0 squad=0 alive=false soldier=false` and there is nowhere to deploy, so the client
    # never enters. MEASURED on mp_001: 411 AlternateSpawnEntityData, 20
    # CharacterSpawnReferenceObjectData, 21 VehicleSpawnReferenceObjectData -- ours carried zero
    # of all three, because these are not named plain ReferenceObjectData and so failed this
    # filter. A geometry-only export is a level you can look at but not play.
    'CharacterSpawnReferenceObjectData',
    'AlternateSpawnEntityData',
    # NOT TransformPartPropertyTrackData. It is a property-ANIMATION TRACK belonging to a
    # blueprint's part, not a placeable object, and authoring 120 of them into mp_003's world parts
    # killed the server inside "Creating entities for autoloaded sublevels" -- silently, exit 0.
    # Bisected against RoadData and PointLightEntityData, which both load clean (33/33 world parts
    # confirmed live in the engine), so this type alone is the cause.
)


# Counted here rather than returned, so the message stays next to the rule that causes it.
dropped_vehicle_spawns = [0]


def world_partition(bp_pg, bp_g, empty=False, extra=None, part_max=None,
                    register_placements=False, entities=None, own_parts=None,
                    source_registries=None):
    """A sub-level holding dust2 at the identity, plus a ReferenceObjectData per extra placement.

    `extra` is [(partition guid, instance guid, transform)] -- the props. Each needs its own
    reference object AND an entry in both registries: a blueprint the level points at but never
    registers resolves to nothing and the object silently does not appear, which is the failure
    mode this whole partition exists to avoid.

    Shape copied from LevelLoaderGen's SubWorldData template, which is the arrangement a
    SubWorldReferenceObjectData naming this bundle will instantiate: SubWorldData -> a
    WorldPartReferenceObjectData -> a WorldPartData whose Objects are the real placements, with a
    RegistryContainer listing all of them. A blueprint the level points at must be registered or the
    reference resolves to nothing and the object silently does not appear.
    """
    pg = guid('partition', WORLD_NAME)
    swd_g = guid('instance', WORLD_NAME, 'subworld')
    desc_g = guid('instance', WORLD_NAME, 'descriptor')
    reg_g = guid('instance', WORLD_NAME, 'registry')
    wpd_g = guid('instance', WORLD_NAME, 'worldpart')
    wprod_g = guid('instance', WORLD_NAME, 'worldpartrod')
    rod_g = guid('instance', WORLD_NAME, 'rod')
    identity = {'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
                'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
                'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
                'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}}

    instances = {
        swd_g: {'$type': 'SubWorldData', 'Name': WORLD_NAME,
                'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
                'Descriptor': ref(pg, desc_g), 'NeedNetworkId': True,
                'InterfaceHasConnections': False,
                'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
                'Objects': [ref(pg, wprod_g)], 'RegistryContainer': ref(pg, reg_g),
                'IsWin32SubLevel': True, 'IsXenonSubLevel': True, 'IsPs3SubLevel': True,
                'RememberStateOnStreamOut': False},
        desc_g: {'$type': 'InterfaceDescriptorData', 'Fields': [], 'InputEvents': [],
                 'OutputEvents': [], 'InputLinks': [], 'OutputLinks': []},
        # EntityRegistry and AssetRegistry carry the level's GAMEPLAY declarations, not its
        # geometry: on mp_001 the game lists 1,628 assets (1,231 UnlockAsset, 172
        # SoldierWeaponUnlockAsset, 141 ValueUnlockAsset, 42 ObjectVariation) and 132 entities
        # (90 SoldierWeaponData, 8 MissileEntityData, 6 VehicleEntityData...).
        #
        # Ours were hardcoded EMPTY. Both real sub-world roots -- the game's own and the shipped
        # realitymod/teamdeathmatch -- populate them, and a client dies while loading the very
        # partition that holds them. A dedicated server binds no assets and can skip the registry;
        # a client cannot, which is why 48 headless LOADED verdicts never noticed.
        #
        # They are carried from the SOURCE level rather than invented: the exported level declares
        # the same weapons, vehicles and unlocks it always did.
        reg_g: {'$type': 'RegistryContainer',
                'EntityRegistry': list((source_registries or {}).get('EntityRegistry') or []),
                'AssetRegistry': list((source_registries or {}).get('AssetRegistry') or []),
                'BlueprintRegistry': [ref(pg, swd_g), ref(pg, wpd_g), ref(bp_pg, bp_g)],
                'ReferenceObjectRegistry': [ref(pg, wprod_g), ref(pg, rod_g)]},
        wprod_g: {'$type': 'WorldPartReferenceObjectData', 'IndexInBlueprint': 3000,
                  'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
                  'BlueprintTransform': identity, 'Blueprint': ref(pg, wpd_g),
                  'ObjectVariation': None, 'StreamRealm': 'StreamRealm_None',
                  'CastSunShadowEnable': True, 'Excluded': False},
        wpd_g: {'$type': 'WorldPartData', 'Name': WORLD_NAME + '/part',
                'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
                'Descriptor': None, 'NeedNetworkId': False, 'InterfaceHasConnections': False,
                'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
                # DUST2_EMPTY_SUBLEVEL bisects the load crash: same bundle, same partitions, same
                # sub-level -- but nothing placed. If the server still dies, the crash is in loading
                # or wiring the sub-level; if it survives, the crash is in instantiating our
                # blueprint, and those are different bugs in different places.
                'Objects': [] if empty else [ref(pg, rod_g)],
                'HackToSolveRealTimeTweakingIssue': '00000000-0000-0000-0000-000000000000',
                'UseDeferredEntityCreation': False, 'Enabled': True},
        # The whole point of the exercise: ONE placement, identity rotation, 1:1 scale, at 0,0,0.
        rod_g: {'$type': 'ReferenceObjectData', 'IndexInBlueprint': 30001,
                'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
                'BlueprintTransform': identity, 'Blueprint': ref(bp_pg, bp_g),
                'ObjectVariation': None, 'StreamRealm': 'StreamRealm_None',
                'CastSunShadowEnable': True, 'Excluded': False},
    }

    # Placements go into parts of at most PART_MAX, and each part is its OWN PARTITION whose
    # primary instance is its WorldPartData -- which is exactly how the game lays a level out.
    #
    # MEASURED on MP_001: levels/mp_001/mp_001 holds 34 WorldPartReferenceObjectData and nothing
    # else of the world; every one points at a WorldPartData that is the PRIMARY INSTANCE of a
    # separate partition (levels/mp_001/mp_001/layer20_streetprops and friends), and those layer
    # partitions carry their own placements -- 585 reference objects and 309 decals in that one --
    # with no RegistryContainer of their own.
    #
    # Keeping every part inside one partition, as this did, produces a partition unlike anything
    # the engine is ever handed.
    parts = []                  # one partition per world part -- part 0 included
    part_of = {}                # WorldPartData guid -> the partition dict holding it
    limit = part_max or PART_MAX
    part = wpd_g                                  # the first part is the one built above

    # Part 0 gets its OWN partition too, exactly like parts 1..n.
    #
    # MEASURED across the game's corpus: 617 partitions hold a LevelData or SubWorldData root, and
    # NOT ONE of them also holds a WorldPartData -- every world part is the primary instance of a
    # separate partition. Leaving part 0 inline put 257 ReferenceObjectData in the sub-world root,
    # a partition shaped like nothing the engine is ever handed.
    part0_pg = guid('partition', WORLD_NAME, 'part', 0)
    part0 = {'PartitionGuid': part0_pg, 'PrimaryInstanceGuid': wpd_g,
             'Name': '%s/part0' % WORLD_NAME,
             'Instances': {wpd_g: instances.pop(wpd_g), rod_g: instances.pop(rod_g)}}
    parts.append(part0)
    part_of[wpd_g] = part0              # placements 0..limit-1 now land here, via the loop's owner

    # Every reference that named part 0 in the root partition has to follow it across.
    part0['Instances'][wpd_g]['Objects'] = [] if empty else [ref(part0_pg, rod_g)]
    instances[wprod_g]['Blueprint'] = ref(part0_pg, wpd_g)
    instances[reg_g]['BlueprintRegistry'] = [ref(part0_pg, wpd_g) if r == ref(pg, wpd_g) else r
                                             for r in instances[reg_g]['BlueprintRegistry']]
    instances[reg_g]['ReferenceObjectRegistry'] = [
        ref(part0_pg, rod_g) if r == ref(pg, rod_g) else r
        for r in instances[reg_g]['ReferenceObjectRegistry']]

    # A blueprint is registered ONCE, however many times it is placed.
    #
    # Appending per placement gave MP_001's sub-level 5350 blueprint entries for 484 distinct
    # blueprints -- 11x duplicated, against exactly 1.00x in every RegistryContainer the game
    # ships. The engine still loaded it, for small counts: at 64 meshes the level came up in
    # seconds, and at 527 the server sat at 73% of a core for twenty-three minutes without
    # finishing, which is the shape of a lookup that walks the list.
    seen_blueprints = {(bp_pg, bp_g)}

    for i, e in enumerate(extra or []):
        # A placement is (blueprint partition, blueprint instance, transform) and OPTIONALLY the
        # ObjectVariation it was authored with.
        e_pg, e_g, e_transform = e[0], e[1], e[2]
        e_var = e[3] if len(e) > 3 else None
        if i and i % limit == 0:
            n = i // limit
            part = guid('instance', WORLD_NAME, 'worldpart', n)
            part_rod = guid('instance', WORLD_NAME, 'worldpartrod', n)
            part_pg = guid('partition', WORLD_NAME, 'part', n)
            part_name = '%s/part%d' % (WORLD_NAME, n)
            parts.append({'PartitionGuid': part_pg, 'PrimaryInstanceGuid': part,
                          'Name': part_name, 'Instances': {}})
            part_of[part] = parts[-1]

            parts[-1]['Instances'][part] = {
                '$type': 'WorldPartData', 'Name': part_name,
                'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
                'Descriptor': None, 'NeedNetworkId': False, 'InterfaceHasConnections': False,
                'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
                'Objects': [],
                'HackToSolveRealTimeTweakingIssue': '00000000-0000-0000-0000-000000000000',
                'UseDeferredEntityCreation': False, 'Enabled': True}
            instances[part_rod] = {
                '$type': 'WorldPartReferenceObjectData', 'IndexInBlueprint': 3000 + n,
                'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
                'BlueprintTransform': identity, 'Blueprint': ref(part_pg, part),
                'ObjectVariation': None, 'StreamRealm': 'StreamRealm_None',
                'CastSunShadowEnable': True, 'Excluded': False}

            # A part the sub-level does not list is a part the engine never builds, and a blueprint
            # that is not registered resolves to nothing -- both fail silently.
            instances[swd_g]['Objects'].append(ref(pg, part_rod))
            instances[reg_g]['BlueprintRegistry'].append(ref(part_pg, part))
            instances[reg_g]['ReferenceObjectRegistry'].append(ref(pg, part_rod))

        e_rod = guid('instance', WORLD_NAME, 'placement', i)
        owner = part_of.get(part)
        target = owner['Instances'] if owner else instances
        target[e_rod] = {
            '$type': 'ReferenceObjectData', 'IndexInBlueprint': 30002 + i,
            'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
            'BlueprintTransform': e_transform, 'Blueprint': ref(e_pg, e_g),
            'ObjectVariation': e_var, 'StreamRealm': 'StreamRealm_None',
            'CastSunShadowEnable': True, 'Excluded': False,
        }
        (owner['Instances'][part] if owner else instances[part])['Objects'].append(
            ref(owner['PartitionGuid'] if owner else pg, e_rod))

        # NOT every placement goes in the ReferenceObjectRegistry.
        #
        # MEASURED on MP_001: its level RegistryContainer lists 328 reference objects for a level
        # holding 6185 placements, and 146 blueprints. The registry is what has to be FINDABLE at
        # runtime -- the structural objects, the world parts, the sub-levels -- not every prop that
        # was ever put down. Registering all 5327 gave a container sixteen times the largest the
        # game ships, and the load never finished.
        if register_placements:
            # The placement lives in the PART's partition, so that is the guid the registry has to
            # name -- ref(pg, ...) would point into the root, where the object is not.
            instances[reg_g]['ReferenceObjectRegistry'].append(
                ref(owner['PartitionGuid'] if owner else pg, e_rod))

        if (e_pg, e_g) not in seen_blueprints:
            seen_blueprints.add((e_pg, e_g))
            instances[reg_g]['BlueprintRegistry'].append(ref(e_pg, e_g))

    # The level's own content, authored from the stage. Each keeps its instance guid -- it is
    # already unique and keeping it means a record that refers to one by guid still resolves --
    # but it now lives in OUR partition.
    for guid_str, record in sorted((entities or {}).items()):
        if record.get('$type') == 'VehicleSpawnReferenceObjectData':
            if os.environ.get('USD_VEHICLE_SPAWNS') == '1':
                pass
            else:
                dropped_vehicle_spawns[0] += 1
                continue
        elif record.get('$type') not in WORLD_PART_TYPES:
            continue

        owner = part_of.get(part)
        target = owner['Instances'] if owner else instances
        target[guid_str] = record
        (owner['Instances'][part] if owner else instances[part])['Objects'].append(
            ref(owner['PartitionGuid'] if owner else pg, guid_str))

    return ({'PartitionGuid': pg, 'PrimaryInstanceGuid': swd_g, 'Name': WORLD_NAME,
             'Instances': instances}, parts)


# --------------------------------------------------------------------------- driver

def main(obj_path, reference, mat_dir, out_dir, game_path, roads=None, host='mp001', level_json=None,
         loaded=None, transform=True, physics=None, props=None):
    """loaded/transform are forwarded to build_mesh, so the whole pipeline -- textures, EBX
    partitions, MVDB, world, Rime commands -- can run off a USD stage instead of an OBJ.

    props: [{name, loaded, physics, placements}] -- each becomes its own mesh, blueprint and MVDB
    under a dust2/props/<name> prefix, and its placements become reference objects in the same
    sub-level. A prop is just a small static model, so it takes the identical path the level does.
    """
    configure(host)
    part_dir = os.path.join(out_dir, 'partitions')
    dds_dir = os.path.join(out_dir, 'dds')
    os.makedirs(part_dir, exist_ok=True)

    resource = os.path.join(out_dir, 'dust2.meshset')
    chunk = os.path.join(out_dir, 'dust2.chunk')
    info = build_mesh(obj_path, reference, resource, chunk,
                      loaded=loaded, transform=transform)
    names = info['names']
    print('mesh      %d subsets  %d tris  %d verts' % (len(names), info['tris'], info['verts']))
    print('bbox m    min %s  max %s' % (np.round(info['bbox'][0], 2), np.round(info['bbox'][1], 2)))
    print('resource  %d bytes   chunk %d bytes' % (info['resource_bytes'], info['chunk_bytes']))
    print('META_HEX  %s' % info['meta'])

    binding, normals, missing = collect_textures(names, mat_dir,
                                                os.path.join(mat_dir, 'pak'))
    shipped, failed, flat_path = write_dds(binding, mat_dir, dds_dir, normals)
    flat_name = '_flat_n'
    print('textures  %d of %d materials bound, %d DDS written, %d failed, %d without a VMT'
          % (len(binding), len(names), len(shipped), len(failed), len(missing)))
    print('normals   %d of %d materials carry a real $bumpmap (%d fall back to flat)'
          % (len(normals), len(names), len(binding) - len(normals)))

    if missing:
        print('          unbound: ' + ', '.join(sorted(missing)[:8])
              + (' ...' if len(missing) > 8 else ''))

    mesh_json, mesh_pg, mesh_g, material_guids = mesh_partition(names)
    bp_json, bp_pg, bp_g = blueprint_partition(mesh_pg, mesh_g, with_physics=bool(physics))
    textures = texture_partitions(binding, shipped.keys(), flat_name)
    # Every mesh's entry goes into ONE database, built after the props have contributed theirs.
    level_entry_g, level_entry_instances, bound = mvdb_entry(
        'level', mesh_pg, mesh_g, material_guids, names, binding, textures, flat_name, normals)
    mvdb_entries = [(level_entry_g, level_entry_instances)]
    print('mvdb      %d of %d subsets carry a texture binding' % (bound, len(names)))

    def dump(obj, filename):
        path = os.path.join(part_dir, filename)
        json.dump(obj, open(path, 'w'), indent=1)
        return path

    # DUST2_PROBE_BLUEPRINT places a SHIPPED blueprint through our own sub-level, which separates
    # "our blueprint is malformed" from "our placement path cannot carry physics at all".
    probe = os.environ.get('DUST2_PROBE_BLUEPRINT')
    extra_placements = []

    if probe:
        p_pg, p_ig = probe.split(',')
        extra_placements.append((p_pg, p_ig, {
            'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
            'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
            'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
            'trans': {'x': 20.0, 'y': 0.0, 'z': 0.0}}))
        print('probe     placing shipped blueprint %s' % probe)

    # --- props: each is a small static model, so it takes the same path the level mesh does.
    prop_cmds, prop_tex_cmds = [], []
    prop_bound = prop_slots = 0
    # Separate from `shipped`: that one drives the LEVEL's texture commands, and adding a prop's
    # textures to it makes that loop look them up in the level's paths and fail.
    prop_shipped = set()

    for prop in props or []:
        p_name = prop['name']
        saved = (MESH_NAME, BLUEPRINT_NAME, MVDB_NAME, TEX_PREFIX, PHYSICS_NAME)
        globals()['MESH_NAME'] = 'dust2/props/%s_mesh' % p_name
        globals()['BLUEPRINT_NAME'] = 'dust2/props/%s' % p_name
        # Its OWN physics resource name: the blueprint's HavokAsset resolves by this string, so
        # leaving the level's here adds two different resources under one name and the second
        # silently replaces the first.
        globals()['PHYSICS_NAME'] = 'dust2/props/%s_physics_0_win32' % p_name
        p_res = os.path.join(out_dir, 'props', p_name + '.meshset')
        p_chunk = os.path.join(out_dir, 'props', p_name + '.chunk')
        os.makedirs(os.path.dirname(p_res), exist_ok=True)

        p_info = build_mesh(None, reference, p_res, p_chunk, loaded=prop['loaded'],
                            transform=False)
        p_names = p_info['names']
        p_binding, p_normals, _p_missing = collect_textures(p_names, mat_dir,
                                                            os.path.join(mat_dir, 'pak'))
        p_mesh_json, p_mesh_pg, p_mesh_g, p_mats = mesh_partition(p_names)
        p_bp_json, p_bp_pg, p_bp_g = blueprint_partition(p_mesh_pg, p_mesh_g,
                                                          with_physics=bool(prop.get('physics')))
        # The prop's OWN textures. Passing the level's set bound nothing: a prop's materials are
        # its own, so nothing matched and every prop drew untextured.
        p_written, _p_failed, _p_flat = write_dds(p_binding, mat_dir, dds_dir, p_normals)
        p_textures = dict(textures)
        p_textures.update(texture_partitions(p_binding, p_written.keys(), flat_name))

        # PROP_TEX_NO_BIND ships the prop's textures but binds the level's set, separating
        # "carrying these textures breaks the bundle" from "binding them breaks the entity".
        p_entry_g, p_entry_instances, p_bound = mvdb_entry(
            p_name, p_mesh_pg, p_mesh_g, p_mats, p_names, p_binding,
            textures if os.environ.get('PROP_TEX_NO_BIND') else p_textures,
            flat_name, p_normals)
        mvdb_entries.append((p_entry_g, p_entry_instances))
        prop_bound += p_bound
        prop_slots += len(p_names)

        for p_base in sorted(p_written):
            if p_base in shipped or p_base in prop_shipped:
                continue

            p_tex_name = texture_partition_name(p_base)
            p_tex_path = dump(p_textures[p_base][0],
                              'tex_%s.json' % p_base.replace('/', '__'))
            prop_tex_cmds.append('add_dds_texture %s "%s" true false false World_SkipNoStr'
                                 % (p_tex_name, p_written[p_base]))
            prop_tex_cmds.append('add_json_partition %s "%s"' % (p_tex_name, p_tex_path))
            prop_shipped.add(p_base)
        dump(p_mesh_json, 'prop_%s_mesh.json' % p_name)
        dump(p_bp_json, 'prop_%s_bp.json' % p_name)

        prop_cmds += [
            'add_resource %s MeshSet "%s" %s' % (MESH_NAME, p_res, p_info['meta']),
            'add_chunk %s %s "%s"' % (p_info['chunk_guid'], MESH_NAME, p_chunk),
            'add_json_partition %s "%s"' % (MESH_NAME, os.path.join(part_dir,
                                                                    'prop_%s_mesh.json' % p_name)),
            'add_json_partition %s "%s"' % (BLUEPRINT_NAME, os.path.join(part_dir,
                                                                        'prop_%s_bp.json' % p_name)),
        ]

        if prop.get('physics'):
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                            '..', 'havok'))
            import build_collision
            prop_cmds.append('add_resource %s HavokPhysicsData "%s" %s'
                             % (PHYSICS_NAME, prop['physics'],
                                build_collision.meta(open(prop['physics'], 'rb').read())
                                .hex().upper()))

        for t in prop['placements']:
            extra_placements.append((p_bp_pg, p_bp_g, t))

        (globals()['MESH_NAME'], globals()['BLUEPRINT_NAME'], globals()['MVDB_NAME'],
         globals()['TEX_PREFIX'], globals()['PHYSICS_NAME']) = saved

    if props:
        print('props     %d model(s), %d placement(s), %d of %d material slots textured'
              % (len(props), sum(len(p['placements']) for p in props), prop_bound, prop_slots))

    world_json, world_parts = world_partition(
        bp_pg, bp_g, empty=bool(os.environ.get('DUST2_EMPTY_SUBLEVEL')),
        extra=extra_placements)

    road_cmds = []

    if roads:
        road_name = '%s/roads' % BLUEPRINT_NAME.rsplit('/', 1)[0]
        road_json, _rpg, _rg, n_roads = roads_partition(roads, road_name)
        road_cmds.append('add_json_partition %s "%s"'
                         % (road_name, dump(road_json, 'roads.json')))
        print('roads     %d ribbon(s) in %s' % (n_roads, road_name))

    paths = {
        'mesh': dump(mesh_json, 'mesh.json'),
        'blueprint': dump(bp_json, 'blueprint.json'),
        'mvdb': dump(mvdb_partition(mvdb_entries), 'mvdb.json'),
        'world': dump(world_json, 'world.json'),
    }

    if LEVEL_SHADOW and level_json:
        # The bundle name the engine is asked for, spelled exactly as the level's own entries
        # spell theirs (`Levels/REALITYMOD/teamdeathmatch`) -- i.e. the built bundle minus "Win32/".
        bundle_ref = BUNDLE_NAME.split('/', 1)[1]
        paths['level'] = dump(level_shadow_partition(level_json, bundle_ref), 'level_shadow.json')
        print('shadow    %s <- %s (+1 SubWorldReferenceObjectData)' % (LEVEL_SHADOW, level_json))
    tex_paths = {base: dump(t[0], 'tex_%s.json' % base.replace('/', '__'))
                 for base, t in textures.items()}

    sb, bundle = SB_NAME, BUNDLE_NAME
    sb_out = os.path.join(os.path.dirname(out_dir.rstrip('/')), 'sb')
    # The collision. Without this the blueprint's HavokAsset names a resource that is not in the
    # bundle, so the physics system finds nothing and the level is scenery you walk through. It is
    # added BEFORE the blueprint that names it, for the same reason the prop textures are.
    physics_cmds = []

    if physics:
        # With the meta, as every shipped physics resource has: it holds the length of each of the
        # resource's four sections, and without it the engine cannot find the packfiles inside.
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'havok'))
        import build_collision

        physics_cmds.append('add_resource %s HavokPhysicsData "%s" %s'
                            % (PHYSICS_NAME, physics,
                               build_collision.meta(open(physics, 'rb').read()).hex().upper()))

    cmds = [
        'mount_game "%s" Frostbite2_0 true' % game_path,
        'build_sb %s Frostbite2_0 "%s"' % (sb, sb_out),
        'build_bundle %s' % bundle,
        'add_resource %s MeshSet "%s" %s' % (MESH_NAME, resource, info['meta']),
        'add_chunk %s %s "%s"' % (info['chunk_guid'], MESH_NAME, chunk),
        'add_json_partition %s "%s"' % (MESH_NAME, paths['mesh']),
    ] + physics_cmds + [
        'add_json_partition %s "%s"' % (BLUEPRINT_NAME, paths['blueprint']),
    ]

    for base in sorted(shipped):
        cmds.append('add_dds_texture %s "%s" true false false World_SkipNoStr'
                    % (texture_partition_name(base), shipped[base]))
        cmds.append('add_json_partition %s "%s"' % (texture_partition_name(base), tex_paths[base]))

    # The props' textures go HERE, with the level's, and not with the rest of the prop commands
    # further down. Order is not cosmetic: a texture partition added after the databases and the
    # world partition that reference it loads fine up to fourteen of them, and past that the server
    # WEDGES -- every partition logged, then no further output at all, not even other mods' timers,
    # and no Level:Loaded. Emitted here, all 31 of dust2's prop textures load.
    cmds += prop_tex_cmds
    cmds.append('add_dds_texture %s "%s" false false true World_SkipNoStr'
                % (texture_partition_name(flat_name), flat_path))
    cmds.append('add_json_partition %s "%s"' % (texture_partition_name(flat_name),
                                                tex_paths[flat_name]))
    cmds += [
        'add_json_partition %s "%s"' % (MVDB_NAME, paths['mvdb']),
        'add_json_partition %s "%s"' % (WORLD_NAME, paths['world']),
    ] + road_cmds + prop_cmds

    if 'level' in paths:
        # The host level's partition, shadowed. Prepending this bundle makes our copy -- the one
        # that lists dust2's sub-level -- win over the level's own.
        cmds.append('add_json_partition %s "%s"' % (LEVEL_SHADOW, paths['level']))

    # objects/shaders/proppreset is the ShaderGraph all 91 MeshMaterials point at. On a stock level
    # it is resident because the level draws props with it; on a from-scratch level there is no such
    # guarantee, so carry it. Its partition holds a single instance with no references, which is why
    # this is cheap and cannot drag in the DxTextures that broke the closure walk in section C.
    cmds.append('reference_existing_partition objects/shaders/proppreset 1')

    # The probe's own partition, so its blueprint reference resolves and its closure comes with it.
    if os.environ.get('DUST2_PROBE_PARTITION'):
        cmds.append('reference_existing_partition %s 1'
                    % os.environ['DUST2_PROBE_PARTITION'])

    if BORROWED_MATERIAL:
        # Pull in the shipped mesh partition that owns the borrowed MeshMaterial, so the reference
        # resolves and its already-compiled shader permutation is the one our mesh draws with.
        cmds.append('reference_existing_partition %s 1' % BORROW_PARTITION)
    cmds += ['build', 'build']

    # ---- bundle bisect -------------------------------------------------------------------------
    # The client dies between receiving the level and Level:Loaded, doing work the server skips:
    # building a render entity for a 92-subset RigidMeshAsset, uploading 86 DxTextures, resolving
    # the MeshVariationDatabase. Rather than reason about which, remove them from the ARTIFACT one
    # at a time and see which removal the client survives.
    #
    #   DUST2_BISECT=nomvdb    mesh + textures + blueprint + ROD, no MVDB partition
    #   DUST2_BISECT=nomesh    blueprint + ROD only: no MeshSet resource, no chunk, no mesh EBX,
    #                          no textures, no MVDB
    #   DUST2_BISECT=empty     sub-level wired but WorldPartData.Objects empty (see also
    #                          DUST2_EMPTY_SUBLEVEL, which is what sets that)
    bisect = os.environ.get('DUST2_BISECT', '')

    if bisect:
        drop = {
            'nomvdb': (MVDB_NAME,),
            'nomesh': (MESH_NAME, MVDB_NAME, TEX_PREFIX),
            'empty': (),
        }.get(bisect, ())

        kept = []

        for line in cmds:
            if any(('"%s"' % d) in line or (' %s ' % d) in line or line.split(' ')[1:2] == [d]
                   for d in drop if d):
                continue
            if drop and any(d and d in line and ('add_' in line) for d in drop):
                continue
            kept.append(line)

        print('bisect    %s: %d of %d commands kept (dropped %s)'
              % (bisect, len(kept), len(cmds), ', '.join(drop) or 'nothing'))
        cmds = kept

    cmd_path = os.path.join(out_dir, 'build.cmds')
    open(cmd_path, 'w').write('\n'.join(cmds) + '\n')
    if physics:
        print('physics   %s -> %s' % (PHYSICS_NAME, physics))

    print('commands  %s (%d lines)' % (cmd_path, len(cmds)))
    json.dump({'info': info, 'binding': binding, 'missing': missing, 'failed': failed,
               'bundle': bundle, 'superbundle': sb},
              open(os.path.join(out_dir, 'build_report.json'), 'w'), indent=1)


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(2)

    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
         os.environ.get('BF3_PATH',
                        os.path.expanduser('~/.local/share/Steam/steamapps/common/Battlefield 3')),
         host=sys.argv[5] if len(sys.argv) > 5 else 'mp001',
         level_json=sys.argv[6] if len(sys.argv) > 6 else None)
