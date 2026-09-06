#!/usr/bin/env python3
"""Collision as first-class USD, both directions.

BF3 collision lives in a HavokPhysicsData resource, which USD has no notion of -- so collision was
carried as opaque bytes and could not be authored at all. It does not need the Havok SDK: shapes are
boxes and convex hulls, and tools/havok/build_collision.py writes the resource from those, verified
against BF3's own bytes.

So collision becomes real USD geometry with UsdPhysics.CollisionAPI applied: visible in a DCC,
movable, and new shapes can simply be modelled. read() turns whatever is in the stage back into the
descriptors build_collision.build() consumes.

MOPP is not involved. It is a Havok SDK acceleration structure for large mesh shapes; boxes and
convex hulls do not use one.
"""
import base64
import hashlib
import os
import sys

from pxr import Gf, Sdf, Usd, UsdGeom, UsdPhysics, Vt

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'havok'))

SCOPE = 'Collision'


def _xform(prim, centre):
    UsdGeom.Xformable(prim).AddTranslateOp().Set(Gf.Vec3d(*[float(c) for c in centre]))


def author(stage, root, shapes, original=None):
    """Write box/convex descriptors into the stage as collision prims.

    `original` is the resource these shapes came out of. It is carried verbatim so an UNEDITED
    round trip can hand back the game's own bytes instead of a rebuild.

    That is not a shortcut, it is the same rule the rest of this pipeline runs on: terrain emits
    only the nodes that actually changed, and meshes reference the player's install rather than
    shipping copies. A rebuild can only ever approximate BF3's baker -- object order, padding and
    fixup layout are its choices, not ours -- so reproducing them for data nobody touched would be
    guessing where the real bytes are already in hand. Edited shapes still rebuild, and that is the
    only case where a rebuild is unavoidable.
    """
    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild(SCOPE))
    n = 0

    if original:
        scope.GetPrim().SetCustomDataByKey(
            'bf3:originalResource', base64.b64encode(bytes(original)).decode('ascii'))
        scope.GetPrim().SetCustomDataByKey('bf3:originalDigest', _digest(shapes))

    for i, sh in enumerate(shapes or ()):
        path = scope.GetPath().AppendChild('shape%04d' % i)

        if sh.get('kind') == 'box':
            cube = UsdGeom.Cube.Define(stage, path)
            cube.CreateSizeAttr(2.0)
            half = [float(h) for h in sh.get('half', (0.5, 0.5, 0.5))]
            prim = cube.GetPrim()
            # Translate BEFORE scale. The other order multiplies the translation by the scale --
            # measured: centre (1,2,3) with half (0.5,1,1.5) came back as (0.5,2,4.5).
            _xform(prim, sh.get('centre', (0.0, 0.0, 0.0)))
            UsdGeom.Xformable(cube).AddScaleOp().Set(Gf.Vec3f(*half))
        else:
            mesh = UsdGeom.Mesh.Define(stage, path)
            verts = [Gf.Vec3f(*[float(c) for c in v]) for v in sh.get('verts', ())]
            mesh.CreatePointsAttr(verts)

            # Author REAL faces. The plane equations a hull needs are derived from them on the way
            # back, which is why this cannot be left empty: there is no convex-hull library here
            # (no scipy), and brush_hulls.hull() goes planes -> verts, not the reverse. Faces come
            # from the DCC, so planes do too.
            counts, idx = [], []

            for face in (sh.get('faces') or ()):
                counts.append(len(face))
                idx.extend(int(i) for i in face)

            mesh.CreateFaceVertexCountsAttr(counts)
            mesh.CreateFaceVertexIndicesAttr(idx)
            prim = mesh.GetPrim()

            # A hull extracted FROM the game arrives with its own plane equations and no faces --
            # Havok stores planes, not a face list, and rebuilding faces from bare vertices needs a
            # convex-hull solver this toolchain does not have. Carry them verbatim so the trip is
            # exact; a hull modelled in a DCC still comes back through its faces below.
            if sh.get('planes'):
                mesh.GetPrim().CreateAttribute(
                    'bf3ConvexPlanes', Sdf.ValueTypeNames.Float4Array).Set(
                    Vt.Vec4fArray([Gf.Vec4f(*[float(c) for c in p]) for p in sh['planes']]))
            _xform(prim, sh.get('centre', (0.0, 0.0, 0.0)))

        UsdPhysics.CollisionAPI.Apply(prim)

        if sh.get('radius'):
            prim.CreateAttribute('bf3ConvexRadius', Sdf.ValueTypeNames.Double).Set(
                float(sh['radius']))

        n += 1

    return n


def _q(x):
    """Quantise to what USD actually stores: float32.

    Rounding to a fixed number of decimals is wrong here -- a half-extent came back 1.011325
    against 1.011324, which is the same float32 seen through a double, not an edit. Comparing at
    the storage precision makes "unchanged" mean unchanged rather than "unchanged to 6 places".
    """
    import struct as _s

    return _s.unpack('f', _s.pack('f', float(x)))[0]


def _digest(shapes):
    """A stable fingerprint of the shapes, so an edit can be told from an untouched trip."""
    h = hashlib.sha256()

    for sh in shapes or ():
        h.update(repr((sh.get('kind'),
                       tuple(_q(c) for c in sh.get('centre', ())),
                       tuple(_q(c) for c in sh.get('half', ())),
                       tuple(tuple(_q(c) for c in v) for v in sh.get('verts', ())),
                       _q(sh.get('radius', 0.0)))).encode())

    return h.hexdigest()


def original_bytes(stage_path):
    """The untouched source resource, when the stage still holds exactly what came out of it.

    -> bytes, or None if anything was edited (or nothing was carried).
    """
    stage = Usd.Stage.Open(stage_path)

    for prim in stage.Traverse():
        blob = prim.GetCustomDataByKey('bf3:originalResource')

        if not blob:
            continue

        want = prim.GetCustomDataByKey('bf3:originalDigest')

        if want and _digest(read(stage_path)) != want:
            return None                     # edited: it has to be rebuilt

        return base64.b64decode(blob)

    return None


def read(stage_path):
    """-> [box(...)/convex(...) descriptors] for build_collision.build()."""
    import build_collision                                                  # noqa: E402

    stage = Usd.Stage.Open(stage_path)
    out = []

    for prim in stage.Traverse():
        if not prim.HasAPI(UsdPhysics.CollisionAPI):
            continue

        xf = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        t = xf.ExtractTranslation()
        centre = (t[0], t[1], t[2])
        r = prim.GetAttribute('bf3ConvexRadius')
        radius = float(r.Get()) if r and r.HasAuthoredValue() else 0.0

        if prim.IsA(UsdGeom.Cube):
            sc = Gf.Vec3d(1, 1, 1)

            for op in UsdGeom.Xformable(prim).GetOrderedXformOps():
                if op.GetOpType() == UsdGeom.XformOp.TypeScale:
                    sc = op.Get()

            out.append(build_collision.box(centre, (sc[0], sc[1], sc[2]), radius))
        elif prim.IsA(UsdGeom.Mesh):
            pts = UsdGeom.Mesh(prim).GetPointsAttr().Get() or []

            if len(pts) < 4:
                continue                        # not a hull; nothing to build

            verts = [(p[0], p[1], p[2]) for p in pts]
            counts = UsdGeom.Mesh(prim).GetFaceVertexCountsAttr().Get() or []
            idx = UsdGeom.Mesh(prim).GetFaceVertexIndicesAttr().Get() or []

            # The game's own planes win when they are present: they are exact, and a hull
            # extracted from BF3 has no faces to derive from.
            carried = prim.GetAttribute('bf3ConvexPlanes')

            if carried and carried.HasAuthoredValue() and carried.Get():
                # Havok's planes are POST-radius: plane_equations writes w = -(d + radius), so the
                # surface sits a convex radius further out than the vertices. Feeding them back raw
                # means no vertex lies on any plane and face matching drops them -- measured on the
                # radio tower, where every plane had 0 vertices at 1e-3 and 3-5 at 1e-2 against a
                # radius of 0.01. Undo the inflation so the planes describe the hull the vertices
                # actually form; build_collision re-applies it on the way out.
                out.append(build_collision.convex(
                    centre, verts,
                    [(p[0], p[1], p[2], -(p[3]) - radius) for p in carried.Get()], radius))
                continue

            # Otherwise derive one plane per face: normal from the winding, offset through its
            # first vertex.
            planes, at = [], 0

            for c in counts:
                f = [idx[at + k] for k in range(c)]
                at += c

                if c < 3:
                    continue

                a, b, d = (Gf.Vec3d(*verts[f[0]]), Gf.Vec3d(*verts[f[1]]), Gf.Vec3d(*verts[f[2]]))
                n = Gf.Cross(b - a, d - a)

                if n.GetLength() < 1e-9:
                    continue

                n = n.GetNormalized()
                planes.append((n[0], n[1], n[2], -(n[0] * a[0] + n[1] * a[1] + n[2] * a[2])))

            if not planes:
                continue                        # a hull with no faces is not a shape

            out.append(build_collision.convex(centre, verts, planes, radius))

    return out
