const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const src=fs.readFileSync(process.env.TRIM_SOURCE||'src-app.html','utf8');
const start=src.indexOf('"use strict";');
const end=src.indexOf('/* ---------------- coach ---------------- */',start);
const ctx=vm.createContext({});
vm.runInContext(src.slice(start,end)+'\nglobalThis.model={state,compute,RIG,backstayRig,mastOffsetAt,forestayPointAt};',ctx);
const {state,compute,RIG,backstayRig,mastOffsetAt,forestayPointAt}=ctx.model;
const defaults={...state};
function run(params={}){
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state,defaults,params);
  return compute();
}
test('backstay load bends the mast and tightens the forestay monotonically',()=>{
  let previous=backstayRig(0,16);
  for(let i=1;i<=100;i++){
    const next=backstayRig(i/100,16);
    for(const key of ['backstayTension','forestayTension','mastBend','mastHeadAft'])
      assert.ok(next[key]>previous[key],key);
    assert.ok(next.forestaySag<previous.forestaySag);
    previous=next;
  }
  assert.equal(backstayRig(0,16).backstayTension,600);
  assert.equal(previous.backstayTension,4000);
});
test('forestay sag follows wind pressure over tension and vanishes in still air',()=>{
  const light=backstayRig(.4,6),double=backstayRig(.4,12);
  assert.ok(Math.abs(double.forestaySag-4*light.forestaySag)<1e-12);
  assert.equal(light.mastBend,double.mastBend);
  assert.equal(backstayRig(.4,0).forestaySag,0);
  const firm=backstayRig(.8,6);
  assert.ok(Math.abs(light.forestaySag*light.forestayTension-firm.forestaySag*firm.forestayTension)<1e-10);
});
test('mast bending preserves gooseneck and masthead pins, with forward bow between',()=>{
  for(const b of [0,.35,1]){
    const rig=backstayRig(b,16),foot=RIG.boomY+.045,head=10.9;
    for(const y of [0,RIG.boomY,foot]) assert.equal(mastOffsetAt(y,rig),0);
    assert.equal(mastOffsetAt(head,rig),-rig.mastHeadAft);
    const midpoint=mastOffsetAt((foot+head)/2,rig);
    assert.ok(Math.abs(midpoint+rig.mastHeadAft/2-rig.mastBend)<1e-12);
    assert.ok(midpoint>0);
  }
});
test('forestay endpoints follow the mast while sag mirrors on either tack',()=>{
  for(const b of [0,1]){
    const rig=backstayRig(b,16);
    const tack=forestayPointAt(0,rig),head=forestayPointAt(1,rig);
    assert.equal(tack.x,3.72);assert.equal(tack.y,1.05);assert.equal(tack.z,0);
    assert.ok(Math.abs(head.x-(RIG.mastX+.03+mastOffsetAt(10.05,rig)))<1e-12);
    assert.equal(head.y,10.05);assert.equal(head.z,0);
    const starboard=forestayPointAt(.5,rig,1),port=forestayPointAt(.5,rig,-1);
    assert.equal(starboard.x,port.x);assert.equal(starboard.y,port.y);
    assert.equal(starboard.z,-port.z);assert.equal(starboard.z,rig.forestaySag);
  }
});
test('computed backstay effects reach both sails and rig at returned apparent wind',()=>{
  const loose=run({backstay:0}),tight=run({backstay:1});
  assert.ok(tight.main.depth<loose.main.depth-.02);
  assert.ok(tight.jib.depth<loose.jib.depth-.01);
  assert.ok(tight.main.draft>loose.main.draft);
  assert.notEqual(tight.speed,loose.speed);
  for(const r of [loose,tight]){
    assert.equal(r.main.rig,r.rig);assert.equal(r.jib.rig,r.rig);
    const expected=backstayRig(r===loose?0:1,r.aws);
    for(const key of Object.keys(expected)) assert.equal(r.rig[key],expected[key]);
  }
});
test('rig inputs and high wind remain bounded and easing restores the same shape',()=>{
  for(const b of [-1,0,.5,1,2,NaN,Infinity]) for(const wind of [-4,0,16,30,1000,NaN,Infinity]){
    const rig=backstayRig(b,wind);
    Object.values(rig).forEach(n=>assert.ok(Number.isFinite(n)&&n>=0));
    assert.ok(rig.mastBend<=.195+1e-12);
    assert.ok(rig.forestaySag<=.30);
  }
  const before=run({backstay:0});run({backstay:1});const after=run({backstay:0});
  assert.deepEqual(after.rig,before.rig);
  assert.equal(after.main.depth,before.main.depth);assert.equal(after.jib.depth,before.jib.depth);
});
