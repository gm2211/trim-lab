const assert=require('node:assert/strict');
const fs=require('node:fs');
const {test}=require('node:test');

test('built pages embed the pinned shared module without external runtime imports',async()=>{
  const page=fs.readFileSync('app.html','utf8');
  assert.equal(page,fs.readFileSync('docs/index.html','utf8'));
  const encoded=page.match(/window\.__byosReady=import\("data:text\/javascript;base64,([A-Za-z0-9+/=]+)"\)/)?.[1];
  assert.ok(encoded,'embedded module exists');
  const bundle=fs.readFileSync('vendor/byos/byos.js','utf8');
  assert.equal(Buffer.from(encoded,'base64').toString(),bundle);
  const api=await import('data:text/javascript;base64,'+encoded);
  assert.equal(typeof api.claude,'function');
  assert.equal(typeof api.openrouter,'function');
  assert.equal(api.claudeCredentialAllowed('sk-ant-api-synthetic'),true);
  assert.equal(api.claudeCredentialAllowed('sk-ant-oat-synthetic'),false);
  assert.match(fs.readFileSync('vendor/byos/REVISION','utf8'),/^commit=[a-f0-9]{40}\n/);
  assert.doesNotMatch(page,/<script id="(?:byos|lib)-slot">/);
});

test('retired OAuth UI and relay cannot initiate subscription authentication',()=>{
  const source=fs.readFileSync('src-app.html','utf8');
  assert.doesNotMatch(source,/oauth\/token|oauth\/authorize|claudeSignIn|oauthBegin|oauthExchange|oauthRefresh/);
  assert.equal(fs.existsSync('relay/worker.js'),false);
  assert.match(source,/claudePolicy/);
});
