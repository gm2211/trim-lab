import io
src = io.open('src-app.html', encoding='utf8').read()
lib = io.open('babylon.lib.js', encoding='utf8').read()
out = src.replace('<script id="lib-slot"></script>', '<script>'+lib+'</script>')
io.open('app.html','w',encoding='utf8').write(out)
io.open('docs/index.html','w',encoding='utf8').write(out)
print('built', len(out))
