#!/usr/bin/env python3
"""Spawn blueprints one at a time and name the one that kills a realm.

"Took me 2 sec to crash it spawning random stuff." Some blueprints cannot be instantiated at all --
MapEditor already refuses weapons and gameplay/level_setups for exactly that reason (GH #393) --
but that list was built by hand and is clearly incomplete: the recorded crash session had
Vehicles/common/DefaultMissileHUD and VE_MotionBlurRadius_Small in it.

Progress is written to disk BEFORE each spawn, so when a realm dies the last line names the
blueprint that did it. Re-running resumes after the recorded ones, so a sweep survives the crashes
it is looking for.

    spawn_sweep_e2e.py --filter Vehicles/common
    spawn_sweep_e2e.py --limit 40
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor    # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402

PROGRESS = 'spawn_sweep_progress.jsonl'


def blueprint_names(filt):
    r = cdp_eval(A.ADDR, """(function(){var e=window.editor,out=[];
    var all=e.blueprintManager.blueprints.values();
    for(var i=0;i<all.length;i++){var b=all[i];
     if(b&&b.name&&String(b.name).indexOf(%s)!==-1) out.push(String(b.name));}
    return JSON.stringify({n:out});})()""" % json.dumps(filt))
    return r.get('n', []) if isinstance(r, dict) else []


def spawn(name, guid):
    return cdp_eval(A.ADDR, """(function(){try{
      var e=window.editor, NAME=%s, bp=null;
      var all=e.blueprintManager.blueprints.values();
      for(var i=0;i<all.length;i++){ if(String(all[i].name)===NAME){bp=all[i];break;} }
      if(!bp) return JSON.stringify({err:'not found'});
      var v=(typeof bp.getDefaultVariation==='function')?bp.getDefaultVariation():0;
      var p=(e.freeCam&&e.freeCam.transform&&e.freeCam.transform.trans)?
            e.freeCam.transform.trans:{x:0,y:80,z:0};
      window.vext.SendCommand({type:'SpawnGameObjectCommand', sender:'', gameObjectTransferData:{
        guid:%s, name:bp.name,
        blueprintCtrRef:{typeName:bp.typeName,name:bp.name,
                         partitionGuid:String(bp.partitionGuid),instanceGuid:String(bp.instanceGuid)},
        parentData:{guid:'00000000-0000-0000-0000-000000000000',typeName:'custom_root',
                    primaryInstanceGuid:'00000000-0000-0000-0000-000000000000',
                    partitionGuid:'00000000-0000-0000-0000-000000000000'},
        transform:{left:{x:1,y:0,z:0},up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1},
                   trans:{x:p.x,y:p.y+3,z:p.z}},
        variation:v, isDeleted:false, isEnabled:true}});
      return JSON.stringify({sent:true, type:bp.typeName});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (json.dumps(name), json.dumps(guid)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--filter', default='Vehicles/common')
    ap.add_argument('--limit', type=int, default=25)
    args = ap.parse_args()

    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    done = set()
    if os.path.exists(PROGRESS):
        for line in open(PROGRESS):
            try:
                done.add(json.loads(line)['name'])
            except Exception:
                pass

    names = [n for n in blueprint_names(args.filter) if n not in done][:args.limit]
    print('%d blueprint(s) matching %r, %d already recorded' % (len(names), args.filter, len(done)))

    with open(PROGRESS, 'a') as fh:
        for i, name in enumerate(names):
            # Record BEFORE spawning: if this one kills the realm, its name is already on disk.
            fh.write(json.dumps({'name': name, 'result': 'attempting'}) + '\n')
            fh.flush()
            os.fsync(fh.fileno())

            r = spawn(name, 'ED170122-7777-0000-0000-5%011X' % i)
            time.sleep(3)

            s, c = server_alive(), client_alive(A.ADDR)

            if not s or not c:
                print('  %-52s KILLED (server=%s client=%s)' % (name[:52], s, c))
                fh.write(json.dumps({'name': name, 'result': 'killed',
                                     'server': s, 'client': c}) + '\n')
                fh.flush()
                return 1

            print('  %-52s ok  %s' % (name[:52], json.dumps(r)[:40]), flush=True)
            fh.write(json.dumps({'name': name, 'result': 'ok'}) + '\n')

    print('\nSURVIVED: %d blueprints spawned' % len(names))
    return 0


if __name__ == '__main__':
    sys.exit(main())
