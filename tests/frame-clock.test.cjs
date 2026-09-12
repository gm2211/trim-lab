const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('src-app.html', 'utf8');
const start = src.indexOf('function sceneFrameDelta(');
const end = src.indexOf('async function ensure3D', start);
const ctx = vm.createContext({});
vm.runInContext(src.slice(start, end), ctx);
const step = ctx.sceneFrameDelta;

for (const hz of [30, 60, 120, 144, 240]) {
  test(`${hz} Hz display keeps elapsed time and caps scene work at 60 FPS`, () => {
    const clock = {};
    const frames = [];
    for(let i=0;i<=hz*4;i++){
      const dt=step(clock,i*1000/hz,true);
      if(dt!==null) frames.push(dt);
    }
    assert.ok(frames.length<=241);
    assert.ok(frames.length>=Math.min(hz,60)*4);
    assert.ok(Math.abs(frames.slice(1).reduce((a,b)=>a+b,0)-4)<1e-8);
  });
}
test('hidden scene drops elapsed idle time and resumes immediately', () => {
  const clock={};
  step(clock,0,true);
  assert.equal(step(clock,8,true),null);
  assert.equal(step(clock,100,false),null);
  assert.equal(step(clock,60000,true),1/60);
  assert.equal(step(clock,60008,true),null);
});
test('late frames preserve elapsed time without a catch-up burst', () => {
  const clock={};
  step(clock,0,true);
  assert.equal(step(clock,1000,true),1);
  assert.equal(step(clock,1001,true),null);
  assert.equal(step(clock,1002,true),null);
});
