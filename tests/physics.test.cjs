const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const start = src.indexOf('"use strict";');
const end = src.indexOf('/* ---------------- coach ---------------- */', start);
const ctx = vm.createContext({});
vm.runInContext(src.slice(start, end) + '\nglobalThis.model={state,compute,KT,BOAT,RIG,mainSheetSpan,mainBoomLimits,stepBoom,sailWindAt,luffPressure};', ctx);
const {state,compute,KT,mainBoomLimits,stepBoom,sailWindAt,luffPressure}=ctx.model;
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

function boomLimits(r){
  return mainBoomLimits(state.sheet,-state.trav*ctx.model.RIG.travelerHalfWidth);
}
function integrateBoom(r, controls, seconds, dt=1/60){
  const limits=mainBoomLimits(controls.sheet,-controls.trav*ctx.model.RIG.travelerHalfWidth);
  const motion={angle:r.main.boom,velocity:0};
  const samples=[];
  for(let t=dt;t<=seconds+1e-9;t+=dt){
    stepBoom(motion,r,controls,1,dt,t,limits);
    samples.push(motion.angle);
  }
  return {motion,samples,limits};
}
test('boom stays inside mainsheet limits while luffing',()=>{
  const r=run({twaC:15});
  assert.equal(r.main.luff,true);
  const q=integrateBoom(r,state,4);
  assert.ok(q.limits.min<q.limits.max);
  assert.ok(q.samples.every(a=>Number.isFinite(a)&&a>=q.limits.min-1e-9&&a<=q.limits.max+1e-9));
});
test('luffing pressure excites boom motion',()=>{
  const r=run({twaC:15});
  const q=integrateBoom(r,{...state,vang:0},2);
  assert.ok(Math.max(...q.samples)-Math.min(...q.samples)>.1,
    `boom displacement ${Math.max(...q.samples)-Math.min(...q.samples)}`);
  assert.ok(Math.abs(q.motion.velocity)>1e-4);
});
test('lowered sail has no wind-driven boom excitation',()=>{
  const r=run({twaC:15,mainhal:0});
  const q=integrateBoom(r,{...state,mainhal:0},2);
  assert.ok(Math.max(...q.samples)-Math.min(...q.samples)<.01);
  assert.ok(Math.abs(q.motion.velocity)<.01);
});
test('boom tack mirroring is antisymmetric',()=>{
  const r=run({twaC:15});
  const q=boomLimits(r), a={angle:r.main.boom,velocity:0}, b={angle:-r.main.boom,velocity:0};
  for(let i=1;i<=120;i++){
    stepBoom(a,r,state,1,1/60,i/60,q);
    stepBoom(b,r,state,-1,1/60,i/60,{min:-q.max,max:-q.min,length:q.length});
  }
  assert.ok(Math.abs(a.angle+b.angle)<1e-9);
  assert.ok(Math.abs(a.velocity+b.velocity)<1e-9);
});
test('boom integration is stable across timestep partitioning',()=>{
  const r=run({twaC:15});
  const q=boomLimits(r), a={angle:r.main.boom,velocity:0}, b={angle:r.main.boom,velocity:0};
  stepBoom(a,r,state,1,.5,.5,q);
  for(let i=1;i<=30;i++) stepBoom(b,r,state,1,1/60,i/60,q);
  assert.ok(Math.abs(a.angle-b.angle)<.02, `angle difference ${Math.abs(a.angle-b.angle)}`);
  assert.ok(Math.abs(a.velocity-b.velocity)<.002, `velocity difference ${Math.abs(a.velocity-b.velocity)}`);
});
test('zero wind produces no boom excitation',()=>{
  const r=run({twaC:45,tws:0});
  // Zero apparent wind is exact input to this reduced dynamic model, even
  // though the steady solver keeps a tiny numerical residual speed.
  const still={...r,aws:0};
  const q=integrateBoom(still,{...state,mainhal:1},2);
  assert.ok(Math.max(...q.samples)-Math.min(...q.samples)<1e-8);
  assert.ok(Math.abs(q.motion.velocity)<1e-8);
});
test('tight sheet restricts luffing boom swing',()=>{
  const eased=run({twaC:15,sheet:.5});
  const tight=run({twaC:15,sheet:1});
  const qe=integrateBoom(eased,{...state,sheet:.5,vang:0},3);
  const qt=integrateBoom(tight,{...state,sheet:1,vang:0},3);
  const easedRange=Math.max(...qe.samples)-Math.min(...qe.samples);
  const tightRange=Math.max(...qt.samples)-Math.min(...qt.samples);
  assert.ok(qt.limits.max-qt.limits.min<qe.limits.max-qe.limits.min);
  assert.ok(tightRange<easedRange*.2, `tight ${tightRange}, eased ${easedRange}`);
});
test('vang damps boom angular velocity',()=>{
  const r0=run({twaC:45,sheet:.5});
  const r={...r0,aws:0};
  const limits=mainBoomLimits(.5,0);
  const loose={angle:r.main.boom,velocity:.5}, tight={angle:r.main.boom,velocity:.5};
  stepBoom(loose,r,{...state,sheet:.5,vang:0},1,1/60,1/60,limits);
  stepBoom(tight,r,{...state,sheet:.5,vang:1},1,1/60,1/60,limits);
  assert.ok(Math.abs(tight.velocity)<Math.abs(loose.velocity),
    `vang velocities ${tight.velocity}, ${loose.velocity}`);
});
test('main boom limits match sheet span numerically',()=>{
  const {mainSheetSpan}=ctx.model;
  for(const sheet of [0,.5,1]) for(const carZ of [-.78,0,.78]){
    const q=mainBoomLimits(sheet,carZ);
    assert.ok(Number.isFinite(q.min)&&Number.isFinite(q.max)&&Number.isFinite(q.length));
    assert.ok(q.min<=q.max+1e-9);
    if(q.max-q.min>1e-5){
      assert.ok(mainSheetSpan(q.min,carZ)<=q.length+1e-6);
      assert.ok(mainSheetSpan(q.max,carZ)<=q.length+1e-6);
    } else assert.ok(mainSheetSpan(q.min,carZ)>=q.length-1e-6);
  }
});
test('computed boom angle respects tackle limits across courses',()=>{
  for(const twaC of [0,15,45,90,165]) for(const sheet of [0,.5,1]) for(const trav of [-1,0,1]){
    const r=run({twaC,sheet,trav});
    const q=mainBoomLimits(sheet,-trav*ctx.model.RIG.travelerHalfWidth);
    assert.ok(r.main.boom>=q.min-1e-8&&r.main.boom<=q.max+1e-8,
      `boom ${r.main.boom} outside [${q.min},${q.max}] at twa ${twaC}, sheet ${sheet}, traveler ${trav}`);
  }
});
