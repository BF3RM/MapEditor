#!/usr/bin/env python3
"""Get a soldier ONTO dust2 and report whether the collision holds him up.

The deploy screen is the only path to a team. Assigning `teamId` from the server's Engine:Update
instead WEDGES the server -- the log stops mid-tick and the process stays up producing nothing --
so the button has to be pressed, and Gameface elements have no .click(): dispatch a real mouse
sequence, the same way the soldier entry is selected.

Standing is then read off the server log rather than a screenshot: the Dust2 mod prints the
soldier's position every 3s, so a soldier who is held up reports a steady y and one who is not
falls until the mod respawns him.
"""
import re
import subprocess
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import cdp_eval                                          # noqa: E402

ADDR = 'localhost:8884'
LOG = '/var/home/powos/Games/VeniceUnleashed/instance/logs/server.log'

CLICK = """(function(sel){
  var els=document.querySelectorAll(sel), t=null;
  for(var i=0;i<els.length;i++){
    var c=(els[i].className||'').toString();
    if(c.indexOf('empty')===-1 && c.indexOf('disabled')===-1){t=els[i];break;}}
  if(!t) return JSON.stringify({clicked:false});
  var r=t.getBoundingClientRect(), cx=r.x+r.width/2, cy=r.y+r.height/2;
  ['mouseover','mousedown','mouseup','click'].forEach(function(e){
    t.dispatchEvent(new MouseEvent(e,{bubbles:true,cancelable:true,view:window,
                                      clientX:cx,clientY:cy,button:0}));});
  return JSON.stringify({clicked:true, text:(t.textContent||'').trim().slice(0,30)});})"""

# What the deploy control is called varies by UI build, so try the likely ones rather than
# hard-coding one and reporting "no deploy button" when it is simply named something else.
DEPLOY_SELECTORS = ['.deploy-button', '#deploy', '.deploy', 'button.deploy',
                    '[class*="deploy"]', '.spawn-button', '[class*="spawn-btn"]']


def probe(target):
    """Every button-ish element on a page, so a missing selector can be SEEN, not guessed at."""
    js = """(function(){var out=[];
      var els=document.querySelectorAll('button,[class*="button"],[class*="btn"],[class*="deploy"]');
      for(var i=0;i<els.length && out.length<25;i++){
        var e=els[i], r=e.getBoundingClientRect();
        out.push({tag:e.tagName, cls:String(e.className).slice(0,50),
                  txt:(e.textContent||'').trim().slice(0,24), w:Math.round(r.width)});}
      return JSON.stringify({url:location.href, n:els.length, els:out});})()"""
    return cdp_eval(ADDR, js, target=target)


def click(target, selector):
    return cdp_eval(ADDR, '(%s)(%s)' % (CLICK, repr(selector).replace("'", '"')), target=target)


def positions():
    out = subprocess.run(['grep', '-aoE', r'is at \(-?[0-9.]+,-?[0-9.]+,-?[0-9.]+\)', LOG],
                         capture_output=True, text=True).stdout.strip().splitlines()
    return [tuple(float(v) for v in re.findall(r'-?[0-9.]+', l)) for l in out]


def wait_for_ui(limit=40):
    """Block until the client's WebUI answers CDP, and say which pages it has.

    Clicking before this point is why runs failed: the client is still loading dust2's 271
    partitions, CDP does not answer at all, and every click attempt burns its own 30s timeout --
    so the whole click budget could be spent before the UI existed. A dead CDP is not a missing
    soldier list, it is a client that is still busy.
    """
    for i in range(limit):
        out = subprocess.run(['python3', '/var/lib/powos/src/lib/mods/vu-cdp.py',
                              '--addr', ADDR, 'targets'],
                             capture_output=True, text=True, timeout=60).stdout
        pages = [ln.split()[-1] for ln in out.splitlines() if 'webui://' in ln]

        if pages:
            print('[deploy] UI alive after %ds: %s' % (i * 5, pages), flush=True)
            return pages

        time.sleep(5)

    print('[deploy] UI never answered CDP', flush=True)
    return []


def main():
    wait_for_ui()

    for attempt in range(45):
        r = click('main/players', '.soldier-entry')

        if isinstance(r, dict) and r.get('clicked'):
            print('[deploy] soldier: %s' % r.get('text'), flush=True)
            break

        time.sleep(4)

    time.sleep(6)

    # Look on EVERY page, not just the soldier list. The deploy control lives on whichever WebUI
    # page the client has moved to, and hunting for it on main/players alone reported "no deploy
    # control matched" while the button was sitting on another target the whole time.
    targets = subprocess.run(['python3', '/var/lib/powos/src/lib/mods/vu-cdp.py',
                              '--addr', ADDR, 'targets'], capture_output=True, text=True).stdout
    pages = [ln.split()[-1] for ln in targets.splitlines() if 'webui://' in ln]
    print('[deploy] pages: %s' % pages, flush=True)

    pressed = False

    for page in pages:
        key = page.replace('webui://', '')
        print('[deploy] %s -> %s' % (key, str(probe(key))[:260]), flush=True)

        for sel in DEPLOY_SELECTORS:
            r = click(key, sel)

            if isinstance(r, dict) and r.get('clicked'):
                print('[deploy] pressed %s on %s -> %s' % (sel, key, r.get('text')), flush=True)
                pressed = True
                break

        if pressed:
            break

    if not pressed:
        print('[deploy] no deploy control matched on any page', flush=True)

    before = len(positions())

    # Keep clicking while waiting, rather than clicking once and hoping.
    #
    # A click reports clicked:true as soon as the element exists, which is not the same as the
    # click TAKING -- the soldier list is interactive before the client is ready to act on it, so
    # roughly half of all runs clicked successfully and then sat at the deploy screen forever. The
    # editor harness solved this the same way: re-press every few seconds until the thing you want
    # actually happens.
    for attempt in range(90):
        p = positions()

        if len(p) > before:
            break

        if attempt % 3 == 0:
            r = click('main/players', '.soldier-entry')

            if isinstance(r, dict) and r.get('clicked') and attempt:
                print('[deploy] re-clicked soldier at %ds' % (attempt * 3), flush=True)

        time.sleep(3)

    p = positions()[-12:]

    if not p:
        print('[deploy] soldier never reported a position — not spawned')
        return 1

    ys = [q[1] for q in p]
    print('[deploy] %d position samples, y: %s' % (len(p), ' '.join('%.1f' % y for y in ys)))
    held = max(ys) - min(ys) < 1.0 and min(ys) > 0.0
    print('[deploy] VERDICT: %s' % ('STANDING on collision at y=%.2f' % ys[-1] if held
                                    else 'falling / not supported'))
    return 0 if held else 2


if __name__ == '__main__':
    sys.exit(main())
