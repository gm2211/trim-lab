const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const start = src.indexOf('"use strict";');
const end = src.indexOf('/* ---------------- coach ---------------- */', start);
const ctx = vm.createContext({});
vm.runInContext(src.slice(start, end) + '\nglobalThis.model={state,compute,KT,BOAT,RIG,mainSheetSpan};', ctx);
const {state,compute,KT}=ctx.model;
const defaults={...state};
function run(overrides={}) {
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state,defaults,overrides);
  return compute();
}
function finite(value) {
  if(typeof value==='number') assert.ok(Number.isFinite(value), `non-finite ${value}`);
  else if(value && typeof value==='object') Object.values(value).forEach(finite);
}
test('photo-referenced rig retains a stable default sailing equilibrium',()=>{
  const r=run();
  assert.ok(r.speed>4.8 && r.speed<5.6);
  assert.ok(r.heel>6.5 && r.heel<9.5);
});
test('lowered sails generate no sustained speed',()=>{
  const r=run({mainhal:0,jhal:0});
  assert.ok(r.speed<.01, `bare poles speed ${r.speed}`);
  assert.ok(r.heel<.01);
});
test('zero heading and zero override remain head to wind',()=>{
  for(const params of [{twaC:0},{twaC:90,twaOv:0}]){
    const r=run(params);
    assert.equal(r.twa,0); assert.equal(r.awa,0); assert.ok(r.speed<.01);
  }
});
test('apparent wind matches returned speed and heel',()=>{
  for(const twa of [2,45,90,165,178]){
    const r=run({twaC:twa});
    const x=r.tws*KT*Math.cos(twa*Math.PI/180)+r.speed*KT;
    const y=r.tws*KT*Math.sin(twa*Math.PI/180)*Math.cos(r.heel*Math.PI/180);
    assert.ok(Math.abs(r.aws-Math.hypot(x,y)/KT)<1e-8);
    assert.ok(Math.abs(r.awa-Math.atan2(y,x)*180/Math.PI)<1e-8);
  }
});
test('main halyard tension moves draft forward above full hoist',()=>{
  const loose=run({mainhal:.4}), tight=run({mainhal:1});
  assert.ok(tight.main.draft<loose.main.draft-.05);
});
test('downwind jib score uses the jib projection',()=>{
  const r=run({twaC:165,sheet:.95,jsheet:0,jcar:.4});
  assert.ok(r.off);
  const projection=Math.min(1,Math.sin((Math.min(95,Math.abs(r.jib.boom)+r.jib.twist*.4)+8)*Math.PI/180)*1.05);
  const expected=projection*Math.exp(-(((r.jib.twist-24)/14)**2));
  assert.ok(Math.abs(r.jib.eff-expected)<1e-10, `jib score ${r.jib.eff}, expected ${expected}`);
});
test('windward traveler can bring boom across centerline',()=>{
  const r=run({sheet:1,trav:1});
  assert.ok(r.main.boom<0);
});
test('tack mirroring leaves symmetric equilibrium unchanged',()=>{
  const starboard=run({twaC:60,twaSide:1});
  const port=run({twaC:60,twaSide:-1});
  assert.equal(port.speed,starboard.speed); assert.equal(port.heel,starboard.heel);
});
test('wind, heading, hoist and trim extremes remain finite and bounded',()=>{
  for(const tws of [0,4,12,24,30]) for(const twaC of [0,2,25,45,90,125,165,178])
    for(const trim of [0,.5,1]){
      const r=run({tws,twaC,sheet:trim,jsheet:trim,jsheetw:1-trim,vang:trim,jcar:trim,mainhal:trim,jhal:trim});
      finite(r); assert.ok(r.speed>=0 && r.speed<=4.2/KT);
      assert.ok(r.heel>=0 && r.heel<=40);
    }
});

test('tackle span is symmetric and grows as boom eases',()=>{
  const {RIG,mainSheetSpan}=ctx.model;
  assert.ok(RIG.travelerX<RIG.rudderX);
  for(const angle of [0,10,30,60,80]){
    assert.equal(mainSheetSpan(angle,.5),mainSheetSpan(-angle,-.5));
    if(angle) assert.ok(mainSheetSpan(angle,0)>mainSheetSpan(0,0));
  }
});
test('Blender export uses the same rigging geometry as physics',()=>{
  const asset=JSON.parse(fs.readFileSync('assets/boat/meshes.json','utf8'));
  assert.deepEqual(asset.layout,JSON.parse(JSON.stringify(ctx.model.RIG)));
});
