const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const clamp = src.match(/const clamp =[^;]+;/)?.[0];
const rad = src.match(/const rad =[^;]+;/)?.[0];
const kt = src.match(/const KT=[^;]+;/)?.[0];
const helper = src.match(/function stepJibSheetSpan[\s\S]+?\n}\n(?=function compute\()/)?.[0];
assert.ok(clamp && rad && kt && helper, 'jib sheet dynamics source is extractable');
const ctx = vm.createContext({});
vm.runInContext(`${clamp}\n${rad}\n${kt}\n${helper}\nglobalThis.stepJibSheetSpan=stepJibSheetSpan;`, ctx);
const step = ctx.stepJibSheetSpan;

const A={x:0,y:1,z:0}, B={x:2,y:1,z:0};
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
const snapshot=s=>s.points.map(p=>({...p}));
const assertFinite=s=>assert.ok(s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
const assertPinned=(s,a=A,b=B)=>{
  for(const k of ['x','y','z']){
    assert.equal(s.points[0][k],a[k]); assert.equal(s.points.at(-1)[k],b[k]);
  }
};
const assertLengthBound=(s,tol=2e-3)=>{
  const used=s.points.slice(1).reduce((sum,p,i)=>sum+distance(s.points[i],p),0);
  assert.ok(used<=s.length+tol, `used ${used}, paid ${s.length}`);
};

test('initializes sixteen straight spans and freezes at zero dt',()=>{
  const s=step(null,A,B,2.8,{aws:12,awa:45},0,0,1);
  assert.equal(s.points.length,17);
  assertPinned(s);
  const before=snapshot(s);
  step(s,A,B,2.8,{aws:12,awa:45},0,10,1);
  for(let i=0;i<s.points.length;i++) assert.ok(distance(s.points[i],before[i])<1e-12);
});

test('zero dt transports the frozen curve with endpoint changes',()=>{
  const s=step(null,A,B,2.8,{aws:0,awa:0},0,0,1);
  for(let i=0;i<120;i++) step(s,A,B,2.8,{aws:10,awa:55},1/60,(i+1)/60,1);
  const before=snapshot(s),a2={x:.2,y:1.1,z:-.1},b2={x:2.4,y:.9,z:.3};
  step(s,a2,b2,2.8,{aws:10,awa:55},0,3,1);
  assertPinned(s,a2,b2);
  for(let i=1;i<16;i++){
    const u=i/16;
    assert.ok(distance(s.points[i],{
      x:before[i].x+.2*(1-u)+.4*u,
      y:before[i].y+.1*(1-u)-.1*u,
      z:before[i].z-.1*(1-u)+.3*u,
    })<1e-12);
  }
});

test('taut sheet remains nearly straight under load',()=>{
  const s=step(null,A,B,2,{aws:18,awa:60},0,0,1);
  for(let i=0;i<360;i++) step(s,A,B,2,{aws:18,awa:60},1/60,(i+1)/60,1);
  assertFinite(s); assertPinned(s); assertLengthBound(s,3e-3);
  assert.ok(Math.max(...s.points.map(p=>Math.hypot(p.y-1,p.z)))<.08);
});

test('slack sheet moves visibly while respecting paid length',()=>{
  const s=step(null,A,B,3.2,{aws:14,awa:55},0,0,1),start=snapshot(s);
  let excursion=0;
  for(let i=0;i<300;i++){
    step(s,A,B,3.2,{aws:14,awa:55},1/60,(i+1)/60,1);
    excursion=Math.max(excursion,...s.points.map((p,j)=>distance(p,start[j])));
    assertFinite(s); assertPinned(s); assertLengthBound(s,4e-3);
  }
  assert.ok(excursion>.15, `excursion ${excursion}`);
});

test('no-wind line settles without a perpetual forced wobble',()=>{
  const s=step(null,A,B,2.8,{aws:0,awa:80},0,0,1);
  for(let i=0;i<1200;i++) step(s,A,B,2.8,{aws:0,awa:80},1/60,(i+1)/60,1);
  const settled=snapshot(s);
  for(let i=1200;i<1320;i++) step(s,A,B,2.8,{aws:0,awa:80},1/60,(i+1)/60,1);
  const drift=Math.max(...s.points.map((p,i)=>distance(p,settled[i])));
  assertFinite(s); assertPinned(s); assertLengthBound(s,4e-3);
  assert.ok(drift<.015, `settled drift ${drift}`);
});

test('length changes and large frame times stay finite and constrained',()=>{
  const s=step(null,A,B,3.5,{aws:20,awa:100},0,0,-1);
  for(let i=0;i<60;i++) step(s,A,B,3.5,{aws:20,awa:100},1/30,(i+1)/30,-1);
  for(let i=0;i<60;i++) step(s,A,B,2.15,{aws:20,awa:100},.5,2+(i+1)/30,-1);
  assertFinite(s); assertPinned(s); assertLengthBound(s,4e-3);
  assert.equal(s.length,2.15);
});

test('optional contact floor keeps internal rope points above the deck',()=>{
  const floorAt=p=>.35+.08*Math.cos(p.x);
  const s=step(null,{x:0,y:.8,z:0},{x:2,y:.8,z:0},3.2,{aws:0,awa:0,floorAt},0,0,1);
  for(let i=0;i<600;i++) step(s,{x:0,y:.8,z:0},{x:2,y:.8,z:0},3.2,{aws:0,awa:0,floorAt},1/60,(i+1)/60,1);
  assert.ok(s.points.slice(1,-1).every(p=>p.y>=floorAt(p)-1e-9));
  assertPinned(s,{x:0,y:.8,z:0},{x:2,y:.8,z:0});
  assertFinite(s); assertLengthBound(s,5e-3);
});

test('paid length wins when deck clearance is geometrically impossible',()=>{
  const lowA={x:0,y:0,z:0},lowB={x:2,y:0,z:0},floorAt=()=>1;
  const s=step(null,lowA,lowB,2,{aws:0,awa:0,floorAt},0,0,1);
  for(let i=0;i<120;i++) step(s,lowA,lowB,2,{aws:0,awa:0,floorAt},1/60,(i+1)/60,1);
  assertPinned(s,lowA,lowB); assertFinite(s); assertLengthBound(s,1e-4);
  assert.ok(s.points.slice(1,-1).some(p=>p.y<floorAt(p)), 'contact remains best effort');
});

test('nonfinite inputs cannot poison the span state',()=>{
  const s=step(null,{x:NaN,y:Infinity,z:0},{x:2,y:1,z:-Infinity},NaN,{aws:Infinity,awa:NaN},1/60,Infinity,1);
  assertFinite(s);
  assert.equal(s.length,distance(s.points[0],s.points.at(-1)));
});
