import io
import base64
import json
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
out = src.replace('<script id="lib-slot"></script>', '<script>'+lib+'</script>')
io.open('app.html','w',encoding='utf8').write(out)
io.open('docs/index.html','w',encoding='utf8').write(out)
print('built', len(out))
