const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const src=fs.readFileSync(process.env.TRIM_SOURCE||'src-app.html','utf8');
const start=src.indexOf('"use strict";'),end=src.indexOf('/* ---------------- coach ---------------- */',start);
const bearing=src.match(/function setWindBearing\(a\)[\s\S]+?\n}/)?.[0];
assert.ok(bearing,'bearing helper extractable');
const ctx=vm.createContext({});
vm.runInContext(src.slice(start,end)+`
function tackSign(){return (state.twaSide||1)<0?-1:1;}\n${bearing}
globalThis.model={state,compute,setWindBearing,initManeuver,computeInstantaneous,stepManeuver,KT};`,ctx);
const {state,compute,initManeuver,computeInstantaneous,stepManeuver,KT}=ctx.model,defaults={...state};
function reset(o={}){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,defaults,o);}
function heave(side=1){
  reset({twaSide:side,twaC:45,jsheet:0,jsheetw:.75,sheet:.5,tiller:side*25,gust:false});
  const motion=initManeuver();motion.bearing=side*45;return motion;
}
function advance(motion,seconds){for(let t=0;t<seconds-1e-9;t+=.05)stepManeuver(motion,.05);return motion;}

test('instantaneous result uses current surge and lateral apparent wind',()=>{
  reset({twaSide:1,twaC:55});
  const still=computeInstantaneous({bearing:55,surge:0,sway:0,yawRate:0,heel:0});
  const moving=computeInstantaneous({bearing:55,surge:2,sway:.5,yawRate:0,heel:0});
  assert.equal(still.speed,0);assert.equal(moving.speed,2/KT);assert.notEqual(moving.awa,still.awa);
});

test('backed jib, eased main and leeward tiller settle dynamically on mirrored tacks',()=>{
  const a=advance(heave(1),120),b=advance(heave(-1),120);
  for(const m of [a,b]){assert.ok(Math.abs(m.bearing)>35&&Math.abs(m.bearing)<80);assert.ok(m.surge>.25&&m.surge<1.5);assert.ok(Math.abs(m.sway)>.15);assert.ok(Math.abs(m.yawRate)<.05);}
  assert.ok(Math.abs(a.bearing+b.bearing)<.02);assert.ok(Math.abs(a.surge-b.surge)<.02);assert.ok(Math.abs(a.sway+b.sway)<.02);
});

test('rudder has no authority without water flow',()=>{
  const m=heave(1);Object.assign(m,{surge:0,sway:0,yawRate:0});
  const q=stepManeuver(m,.05);assert.ok(Math.abs(q.forces.rudder.side)<1e-12);assert.ok(Math.abs(q.forces.rudder.yaw)<1e-12);
});

test('hove-to balance recovers after a gust',()=>{
  const m=advance(heave(1),60),base={bearing:m.bearing,surge:m.surge,sway:m.sway};
  state.gust=true;advance(m,20);state.gust=false;advance(m,40);
  assert.ok(Math.abs(m.bearing-base.bearing)<3);assert.ok(Math.abs(m.surge-base.surge)<.15);assert.ok(Math.abs(m.sway-base.sway)<.15);
});

test('freeing the backed sheet and centering helm exits and accelerates',()=>{
  const m=advance(heave(1),60),slow=m.surge;
  Object.assign(state,{jsheet:.75,jsheetw:0,sheet:.75,tiller:0});advance(m,30);
  const r=computeInstantaneous(m);assert.equal(r.jib.backed,false);assert.ok(m.surge>slow+.2);assert.ok(Math.abs(m.bearing)<170);
});

test('stern crossing wraps bearing and preserves physical sheets without false heave-to',()=>{
  reset({twaSide:1,twaC:178,jsheet:.75,jsheetw:0,tiller:0});
  const m={bearing:179,surge:0,sway:0,yawRate:30,heel:0};stepManeuver(m,.05);
  assert.ok(m.bearing<0&&m.bearing>-180);assert.equal(state.jsheet,0);assert.equal(state.jsheetw,.75);
  assert.equal(computeInstantaneous(m).jib.backed,false);
});
