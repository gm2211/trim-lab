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
const {state,compute,setWindBearing,initManeuver,computeInstantaneous,stepManeuver,KT}=ctx.model,defaults={...state};
function reset(o={}){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,defaults,o);}
function heave(side=1,tws=12){
  reset({tws,twaSide:-side,twaC:45,jsheet:.75,jsheetw:0,sheet:.85,tiller:0,gust:false});
  const motion=initManeuver();
  setWindBearing(side*45);motion.bearing=side*45;
  Object.assign(state,{sheet:.4,tiller:side*30});
  return motion;
}
function advance(motion,seconds){for(let t=0;t<seconds-1e-9;t+=.05)stepManeuver(motion,.05);return motion;}

test('instantaneous result uses current surge and lateral apparent wind',()=>{
  reset({twaSide:1,twaC:55});
  const still=computeInstantaneous({bearing:55,surge:0,sway:0,yawRate:0,heel:0});
  const moving=computeInstantaneous({bearing:55,surge:2,sway:.5,yawRate:0,heel:0});
  assert.equal(still.speed,0);assert.equal(moving.speed,2/KT);assert.notEqual(moving.awa,still.awa);
});

test('instantaneous forces retain the steady sail slot interaction',()=>{
  reset({twaSide:1,twaC:55});
  const steady=compute({flow:false});
  const instant=computeInstantaneous({bearing:55,surge:steady.speed*KT,sway:0,yawRate:0,heel:steady.heel});
  for(const key of ['drive','side'])
    assert.ok(Math.abs(instant.forces[key]-steady.forces[key])<1e-9,
      `${key}: instantaneous ${instant.forces[key]} steady ${steady.forces[key]}`);
});

test('backed jib, eased main and leeward tiller settle dynamically on mirrored tacks',()=>{
  const a=advance(heave(1),120),b=advance(heave(-1),120);
  for(const m of [a,b]){assert.ok(Math.abs(m.bearing)>35&&Math.abs(m.bearing)<80);assert.ok(m.surge>.25&&m.surge<1.5);assert.ok(Math.abs(m.sway)>.15);assert.ok(Math.abs(m.yawRate)<.05);}
  assert.ok(Math.abs(a.bearing+b.bearing)<.02);assert.ok(Math.abs(a.surge-b.surge)<.02);assert.ok(Math.abs(a.sway+b.sway)<.02);
});

test('a tiller-driven tack carries its physical jib sheet into a hove-to balance',()=>{
  for(const side of [1,-1]){
    reset({tws:12,twaSide:side,twaC:45,jsheet:.75,jsheetw:0,sheet:.85,tiller:side*35,gust:false});
    const m=initManeuver(),startSpeed=m.surge;let crossed=false,crossTime=null,previous=m.bearing;
    for(let t=0;t<180;t+=.05){
      if(!crossed&&previous*side>0&&previous*side<10&&m.bearing*side<=0&&m.surge>0){
        crossed=true;crossTime=t;state.sheet=.65;state.tiller=-side*35;
      }
      previous=m.bearing;stepManeuver(m,.05);
    }
    assert.ok(crossed,`tack ${side} did not cross head to wind from ${startSpeed} m/s`);
    assert.ok(crossTime<30,`tack ${side} took ${crossTime}s`);
    assert.equal(state.jsheet,0);assert.equal(state.jsheetw,.75);
    const r=computeInstantaneous(m);assert.equal(r.jib.backed,true);
    assert.ok(Math.abs(m.bearing)>35&&Math.abs(m.bearing)<55,`bearing ${m.bearing}`);
    assert.ok(m.surge>.5&&m.surge<1.1);assert.ok(Math.abs(m.sway)>.35);assert.ok(Math.abs(m.yawRate)<.01);
  }
});

test('rudder has no authority without water flow',()=>{
  const m=heave(1);Object.assign(m,{surge:0,sway:0,yawRate:0});
  const q=stepManeuver(m,.05);assert.ok(Math.abs(q.forces.rudder.side)<1e-12);assert.ok(Math.abs(q.forces.rudder.yaw)<1e-12);
});

test('zero-wind hull, keel and rudder forces dissipate motion',()=>{
  const energy=q=>.5*1180*q.surge*q.surge+.5*(1180*1.1)*q.sway*q.sway
    +.5*(1180*4.2)*Math.pow(q.yawRate*Math.PI/180,2);
  for(const surge of [-1,1])for(const tiller of [-35,0,35]){
    reset({tws:0,mainhal:0,jhal:0,tiller,twaSide:1,twaC:60});
    const m={bearing:60,surge,sway:.5,yawRate:8,heel:0},before=energy(m);
    advance(m,10);assert.ok(energy(m)<before*.75,`${surge}, ${tiller}: ${energy(m)} >= ${before}`);
  }
});

test('backed force blends continuously as the windward sheet takes the clew',()=>{
  reset({twaSide:1,twaC:55,jsheet:0,jsheetw:0,jcar:.5});
  let previous=null;
  for(let trim=.30;trim<=.55;trim+=.005){state.jsheetw=trim;const r=computeInstantaneous({bearing:55,surge:1,sway:0,yawRate:0,heel:4});
    if(previous)assert.ok(Math.abs(r.forces.drive-previous)<12,`force jump at ${trim}`);previous=r.forces.drive;}
});

test('hove-to balance recovers after a gust',()=>{
  const m=advance(heave(1),60),base={bearing:m.bearing,surge:m.surge,sway:m.sway};
  state.gust=true;advance(m,20);state.gust=false;advance(m,40);
  assert.ok(Math.abs(m.bearing-base.bearing)<3);assert.ok(Math.abs(m.surge-base.surge)<.15);assert.ok(Math.abs(m.sway-base.sway)<.15);
});

test('the same physical setup has a stable force balance across moderate winds',()=>{
  for(const tws of [8,12,18]){const m=heave(1,tws);advance(m,120);
    assert.ok(m.bearing>45&&m.bearing<90,`${tws} kt bearing ${m.bearing}`);
    assert.ok(m.surge>0&&m.surge<2,`${tws} kt surge ${m.surge}`);
    assert.ok(m.sway>.15&&Math.abs(m.yawRate)<.08);
  }
});

test('closer-to-wind heave-to trim returns after heading and speed perturbations',()=>{
  const m=heave(1,12);Object.assign(state,{sheet:.65,tiller:35});advance(m,120);
  const balance={bearing:m.bearing,surge:m.surge,sway:m.sway};
  assert.ok(balance.bearing>40&&balance.bearing<46,`bearing ${balance.bearing}`);
  assert.ok(balance.surge>.75&&balance.surge<.9,`surge ${balance.surge}`);
  assert.ok(balance.sway>.45&&balance.sway<.65,`sway ${balance.sway}`);
  m.bearing+=5;m.surge+=.2;advance(m,60);
  assert.ok(Math.abs(m.bearing-balance.bearing)<1);
  assert.ok(Math.abs(m.surge-balance.surge)<.03);
  assert.ok(Math.abs(m.sway-balance.sway)<.03);
  assert.ok(Math.abs(m.yawRate)<.01);
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
