const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

global.window = {};
require('../babylon.lib.js');
const BABYLON = window.BABYLON;
const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const start = src.indexOf('function vangTackle');
const end = src.indexOf('function tick3D', start);
assert.ok(start >= 0 && end > start, 'vang helper source not found');
const ctx = vm.createContext({BABYLON});
vm.runInContext(`
  const V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t;
  ${src.slice(start,end)}
  globalThis.model={vangTackle,V3};
`, ctx);
const {vangTackle,V3} = ctx.model;

function length(points) {
  let total=0;
  for(let i=1;i<points.length;i++) total += BABYLON.Vector3.Distance(points[i-1],points[i]);
  return total;
}
function segmentDistance(p,a,b) {
  const ab=b.subtract(a), d=ab.lengthSquared();
  const u=Math.max(0,Math.min(1,BABYLON.Vector3.Dot(p.subtract(a),ab)/d));
  return BABYLON.Vector3.Distance(p,a.add(ab.scale(u)));
}
function boomAnchors(deg) {
  const d=deg*Math.PI/180;
  const bottom=V3(1.42,1.12,0);
  const top=V3(1.5,1.8,0).add(V3(-Math.cos(d),0,Math.sin(d)).scale(1.15)).add(V3(0,-.05,0));
  return {bottom,top};
}

test('vang purchase remains offset from rigid support on both tacks',()=>{
  for(const side of [-1,1]) for(const deg of [-88,-45,0,45,88]) {
    const {bottom,top}=boomAnchors(side*deg);
    const q=vangTackle(bottom,top,1,0,0);
    assert.ok(Math.abs(q.low.subtract(bottom).length()-.135)<1e-10);
    assert.ok(Math.abs(q.high.subtract(top).length()-.135)<1e-10);
    assert.ok(Math.abs(BABYLON.Vector3.Dot(q.low.subtract(bottom),q.axis))<1e-10);
    assert.ok(Math.abs(BABYLON.Vector3.Dot(q.high.subtract(top),q.axis))<1e-10);
    assert.equal(q.falls.length,2);
    assert.ok(q.falls.every(f=>f.length===17 && f.every(p=>[p.x,p.y,p.z].every(Number.isFinite))));
  }
});

test('vang falls clear the rigid support including highlighted rope radius',()=>{
  for(const side of [-1,1]) for(const deg of [-88,-30,0,30,88]) {
    const {bottom,top}=boomAnchors(side*deg);
    const q=vangTackle(bottom,top,1,0,0);
    const minimum=Math.min(...q.falls.flatMap(f=>f.map(p=>segmentDistance(p,bottom,top))));
    assert.ok(minimum>.037+.008, `clearance ${minimum} at tack ${side}, angle ${deg}`);
  }
});

test('easing adds bounded sag while endpoints stay fixed',()=>{
  const {bottom,top}=boomAnchors(55);
  const tight=vangTackle(bottom,top,1,0,0);
  const eased=vangTackle(bottom,top,0,12,18);
  for(let k=0;k<2;k++) {
    assert.ok(BABYLON.Vector3.Distance(tight.falls[k][0],eased.falls[k][0])<1e-12);
    assert.ok(BABYLON.Vector3.Distance(tight.falls[k].at(-1),eased.falls[k].at(-1))<1e-12);
    assert.ok(length(eased.falls[k])>length(tight.falls[k])+.01);
    assert.ok(Math.min(...eased.falls[k].map((p,i)=>p.y-tight.falls[k][i].y))<-.1);
  }
});

test('tight vang is stable with zero wind regardless of time',()=>{
  const {bottom,top}=boomAnchors(-72);
  const a=vangTackle(bottom,top,1,0,0), b=vangTackle(bottom,top,1,100,0);
  for(let k=0;k<2;k++) for(let i=0;i<a.falls[k].length;i++)
    assert.ok(BABYLON.Vector3.Distance(a.falls[k][i],b.falls[k][i])<1e-12);
});
