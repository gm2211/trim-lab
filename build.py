import io
src = io.open('src-app.html', encoding='utf8').read()
lib = io.open('babylon.lib.js', encoding='utf8').read()
rc = io.open('ropecolor.b64', encoding='utf8').read().replace('\n','')
rn = io.open('ropenormal.b64', encoding='utf8').read().replace('\n','')
lib = lib + '\nwindow.__ROPE_COLOR="data:image/jpeg;base64,'+rc+'";'
lib = lib + '\nwindow.__ROPE_NORMAL="data:image/jpeg;base64,'+rn+'";'
drills = io.open('drills-gen.json', encoding='utf8').read()
out = src.replace('<script id="lib-slot"></script>',
    '<script>'+lib+'</script>\n<script>window.__GEN_DRILLS='+drills+';</script>')
io.open('app.html','w',encoding='utf8').write(out)
io.open('docs/index.html','w',encoding='utf8').write(out)
print('built', len(out))
