"""Prove an edit made to a CLOSURE entity in USD reaches the shipped partition."""
import json, os, sys
sys.path.insert(0,'/var/home/powos/Games/VeniceUnleashed/instance/Admin/Mods/MapEditor/tools/usd')
from pxr import Usd
import closure_export, level_entities

# Author a small closure slice, edit one scalar, read it back through level_entities.read().
stage = Usd.Stage.CreateInMemory()
n, counts = closure_export.author(stage, '/tmp/closure', 60)
tmp = '/tmp/closure_edit.usda'
stage.GetRootLayer().Export(tmp)

st = Usd.Stage.Open(tmp)
target = None
for prim in st.Traverse():
    blob = prim.GetCustomDataByKey('bf3Entity')
    if not blob:
        continue
    for a in prim.GetAttributes():
        nm = a.GetName()
        if nm.startswith('bf3') and isinstance(a.Get(), float) and a.Get() not in (0.0,):
            target = (prim, a, json.loads(blob))
            break
    if target:
        break

prim, attr, rec = target
old = attr.Get()
attr.Set(old + 7.5)
st.GetRootLayer().Export(tmp)
print('edited %s.%s  %s -> %s' % (rec['type'], attr.GetName(), old, old + 7.5))

back = level_entities.read(tmp)
part = rec['partition']
changes = back.get(part) or {}
got = changes.get(rec['instance'])
field = attr.GetName()[3:]
print('partition key in read(): %s' % ('FOUND' if part in back else 'MISSING'))
print('instance in changes    : %s' % ('FOUND' if got else 'MISSING'))
if got:
    print('value carried back     : %r (want %r)' % (got.get(field), old + 7.5))
    print('RESULT %s' % ('PASS' if abs(float(got.get(field, 0)) - (old + 7.5)) < 1e-6 else 'FAIL'))
else:
    print('RESULT FAIL')
