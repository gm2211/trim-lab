import io
import base64
import json
import gzip
from pathlib import Path
src = io.open('src-app.html', encoding='utf8').read()
lib = io.open('babylon.lib.js', encoding='utf8').read()
rc = io.open('ropecolor.b64', encoding='utf8').read().replace('\n','')
rn = io.open('ropenormal.b64', encoding='utf8').read().replace('\n','')
lib = lib + '\nwindow.__ROPE_COLOR="data:image/jpeg;base64,'+rc+'";'
lib = lib + '\nwindow.__ROPE_NORMAL="data:image/jpeg;base64,'+rn+'";'
materials = {}
for name in ('gelcoat', 'sailcloth', 'nonskid', 'braid'):
    materials[name] = {}
    for channel in ('normal', 'roughness'):
        data = Path('assets/materials', name+'-'+channel+'.png').read_bytes()
        materials[name][channel] = 'data:image/png;base64,'+base64.b64encode(data).decode('ascii')
lib += '\nwindow.__MARINE_MATERIALS='+json.dumps(materials, separators=(',', ':'))+';'
boat = gzip.compress(Path('assets/boat/meshes.json').read_bytes(), mtime=0)
lib += '\nwindow.__BOAT_GZIP="'+base64.b64encode(boat).decode('ascii')+'";'
out = src.replace('<script id="lib-slot"></script>', '<script>'+lib+'</script>')
# Import the committed ESM bundle from an embedded data URL: built pages remain self-contained.
byos = base64.b64encode(Path('vendor/byos/byos.js').read_bytes()).decode('ascii')
out = out.replace('<script id="byos-slot"></script>', '<script>window.__byosReady=import("data:text/javascript;base64,'+byos+'").catch(()=>null);</script>')
io.open('app.html','w',encoding='utf8').write(out)
io.open('docs/index.html','w',encoding='utf8').write(out)
print('built', len(out))
