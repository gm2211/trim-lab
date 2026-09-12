const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html','utf8');
const modelStart=src.indexOf('"use strict";');
const modelEnd=src.indexOf('/* ---------------- coach ---------------- */',modelStart);
const flowStart=src.indexOf('function flowVel(');
const flowEnd=src.indexOf('function segX',flowStart);
assert.ok(modelStart>=0&&modelEnd>modelStart&&flowStart>=0&&flowEnd>flowStart);
const ctx=vm.createContext({});
vm.runInContext(src.slice(modelStart,modelEnd)+src.slice(flowStart,flowEnd)+
  '\nglobalThis.api={state,compute,flowVel,PANEL,KT};',ctx);
const api=ctx.api,defaults={...api.state};

function run(overrides={}) {
  Object.keys(api.state).forEach(key=>delete api.state[key]);
  Object.assign(api.state,defaults,overrides);
  const r=api.compute();
  return {...r,S:1};
}

const CASES=[
  ['close-hauled',{tws:12,posIdx:0,twaC:45,jsheetw:0}],
  ['beam reach',{tws:12,posIdx:2,twaC:90,jsheetw:0}],
  ['run',{tws:12,posIdx:4,twaC:165,sheet:.1,vang:.7,jsheet:.1,jsheetw:.75}],
  ['backed jib',{tws:12,posIdx:0,twaC:45,jsheet:.75,jsheetw:.75}],
  ['reefed main',{tws:20,posIdx:0,twaC:45,reef2:1}],
];

function freeStream(r,y) {
  const speed=r.aws*api.KT*Math.pow(Math.max(y,1)/10,.11),angle=r.awa*Math.PI/180;
  return [-Math.cos(angle)*speed,Math.sin(angle)*speed];
}

test('reduced-order dye field stays bounded and returns to freestream',()=>{
  for(const [name,controls] of CASES) {
    const r=run(controls);
    let nearInfluence=0;
    for(const y of [1.8,4,6.2,8.4]) for(let x=-12;x<=12;x+=.5) for(let z=-8;z<=8;z+=.5) {
      const velocity=api.flowVel(x,z,y,r),free=freeStream(r,y);
      const speed=Math.hypot(...velocity),freeSpeed=Math.hypot(...free);
      const along=(velocity[0]*free[0]+velocity[1]*free[1])/freeSpeed;
      assert.ok(speed<=1.600001*freeSpeed,`${name}: local flow exceeds induced-speed bound`);
      assert.ok(along>0,`${name}: dye flow reverses`);
      const distance=Math.hypot(x-1.5,z);
      if(distance>5) {
        const cosine=clamp((velocity[0]*free[0]+velocity[1]*free[1])/(speed*freeSpeed),-1,1);
        const turn=Math.acos(cosine)*180/Math.PI;
        assert.ok(turn<=15,`${name}: far-field turn is ${turn.toFixed(2)} degrees`);
      } else if(distance<2) {
        nearInfluence=Math.max(nearInfluence,Math.hypot(velocity[0]-free[0],velocity[1]-free[1])/freeSpeed);
      }
    }
    if(name!=='backed jib') assert.ok(nearInfluence>.01,`${name}: local sail influence disappeared`);
  }
});

test('port and starboard dye fields are exact mirrors',()=>{
  const r=run({tws:12,posIdx:1,twaC:60});
  for(const [x,z,y] of [[-4,-3,1.8],[0,2,4],[3.5,-.5,6.2],[8,5,8.4]]) {
    const starboard=api.flowVel(x,z,y,{...r,S:1});
    const port=api.flowVel(x,-z,y,{...r,S:-1});
    assert.equal(port[0],starboard[0]);
    assert.equal(port[1],-starboard[1]);
  }
});

test('lowered sails and zero wind produce no induced flow',()=>{
  const lowered=run({tws:12,mainhal:0,jhal:0});
  assert.ok(api.PANEL.H.every(row=>row.g.every(value=>value===0)),'lowered sail retained circulation');
  for(const point of [[0,0,1.8],[2,1,5],[8,-4,8.4]]) {
    const actual=api.flowVel(...point,lowered),expected=freeStream(lowered,point[2]);
    assert.equal(actual[0],expected[0]);assert.equal(actual[1],expected[1]);
  }
  const still={...lowered,aws:0};
  const row=api.PANEL.H[0],endpoints=row.center.flatMap((center,i)=>
    row.span[i].map(y=>[center[0],center[1],y]));
  for(const point of [[0,0,1.8],[2,1,5],[8,-4,8.4],...endpoints]) {
    const actual=api.flowVel(...point,still);
    assert.equal(actual[0],0);assert.equal(actual[1],0);
  }
});

test('backed jib carries no attached-flow circulation',()=>{
  const r=run({tws:12,posIdx:0,twaC:45,jsheet:.75,jsheetw:.75});
  assert.equal(r.jib.backed,true,'fixture did not back the jib');
  for(const row of api.PANEL.H)
    assert.ok(row.g.slice(row.split).every(value=>value===0),'backed jib retained bound circulation');
});

test('reefed field follows the shortened main geometry',()=>{
  run({tws:20,posIdx:0,twaC:45,reef2:1});
  const lower=api.PANEL.H.find(row=>row.y===6.2),upper=api.PANEL.H.find(row=>row.y===8.4);
  assert.equal(lower.split,4,'main disappeared below the reefed head');
  assert.equal(lower.polys.length,2,'lower field omitted a sail element');
  assert.equal(upper.split,0,'main circulation remained above the reefed head');
  assert.equal(upper.polys.length,1,'upper field retained main geometry');
  assert.ok(upper.element.every(index=>index===0),'single-jib station indices are inconsistent');
  assert.deepEqual(Array.from(upper.span[0]),[1.05,10.05]);
});

function clamp(value,lo,hi){ return Math.max(lo,Math.min(hi,value)); }
