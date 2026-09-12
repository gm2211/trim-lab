const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
global.window={};require('../babylon.lib.js');const BABYLON=window.BABYLON;
const src=fs.readFileSync(process.env.TRIM_SOURCE||'src-app.html','utf8');
const start=src.indexOf('"use strict";'),end=src.indexOf('/* ---------------- coach ---------------- */',start);
const bearing=src.match(/function setWindBearing\(a\)[\s\S]+?\n}/)?.[0];
const sailStart=src.indexOf('function sailPathArray'),sailEnd=src.indexOf('function sceneFrameDelta',sailStart);
assert.ok(bearing&&sailStart>=0&&sailEnd>sailStart,'tack source is extractable');
const ctx=vm.createContext({BABYLON});
vm.runInContext(src.slice(start,end)+`
function tackSign(){return (state.twaSide||1)<0?-1:1;}const V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);
${bearing}\n${src.slice(sailStart,sailEnd)}
globalThis.model={state,compute,jibLead,jibSheetLength,jibClewLimits,segForces,BOAT,KT,setWindBearing,sailPathArray};`,ctx);
const {state,compute,jibLead,jibSheetLength,jibClewLimits,segForces,BOAT,KT,setWindBearing,sailPathArray}=ctx.model;
const defaults={...state};
function reset(o={}){Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,defaults,o);}
const physical=()=>state.twaSide>0?{port:state.jsheet,starboard:state.jsheetw}:{port:state.jsheetw,starboard:state.jsheet};

test('tack preserves the cleated physical sheet, length, shape and backs the jib',()=>{
  reset({twaSide:1,twaC:45,jsheet:.75,jsheetw:0,jcar:.5});
  const sheets=physical(),length=jibSheetLength(.75,.5),before=compute();setWindBearing(-45);
  const r=compute(),q=jibClewLimits(r.jib,state,-1),lead=jibLead(.5);
  assert.deepEqual(physical(),sheets);assert.equal(state.jsheet,0);assert.equal(state.jsheetw,.75);
  assert.equal(r.jib.backed,true);assert.equal(r.jib.wow,false);assert.ok(r.jib.clew<0);
  assert.ok(Math.abs(q.windLength-length)<1e-10);assert.ok(lead.dist(-r.jib.clew)<=q.windLength+1e-8);
  assert.equal(r.jib.leech,before.jib.leech);assert.equal(r.jib.twist,before.jib.twist);assert.equal(r.jib.depth,before.jib.depth);
});

test('reverse crossing restores roles without moving either physical sheet',()=>{
  reset({twaSide:1,twaC:45,jsheet:.75,jsheetw:.1});const before=physical();
  setWindBearing(-45);setWindBearing(45);assert.deepEqual(physical(),before);
  assert.equal(state.jsheet,.75);assert.equal(state.jsheetw,.1);
});

test('both directions of stern crossing preserve physical sheets and shape',()=>{
  reset({twaSide:1,twaC:165,jsheet:.05,jsheetw:.6,jcar:.5});let before=physical();setWindBearing(-165);
  let r=compute();assert.deepEqual(physical(),before);assert.equal(r.jib.wow,false);assert.equal(r.jib.backed,false);
  reset({twaSide:1,twaC:165,jsheet:.75,jsheetw:0,jcar:.5});before=physical();const shape=compute(),length=jibSheetLength(.75,.5);
  setWindBearing(-178);r=compute();const q=jibClewLimits(r.jib,state,-1);
  assert.deepEqual(physical(),before);assert.equal(r.jib.wow,true);assert.equal(r.jib.backed,false);
  assert.equal(q.loadedSide,1);assert.ok(Math.abs(q.length-length)<1e-10);
  assert.equal(r.jib.leech,shape.jib.leech);assert.equal(r.jib.twist,shape.jib.twist);assert.equal(r.jib.depth,shape.jib.depth);
});

test('backed pressure pushes aft and leeward and reduces equilibrium speed',()=>{
  reset({twaSide:1,twaC:45,jsheet:.75,jsheetw:0});const normal=compute();setWindBearing(-45);const r=compute();
  const f=segForces({...r.jib,boom:r.jib.clew},BOAT.jib,12*KT,45,r.speed*KT,0,1,1,1,false);
  assert.ok(f.drive<0);assert.ok(f.side>0);assert.ok(f.hm>0);assert.ok(r.speed<normal.speed);
});

test('backed camber points leeward on both tacks',()=>{
  for(const side of [1,-1]){reset({twaSide:side,twaC:45,jsheet:0,jsheetw:.75,jcar:.5});const r=compute();
    const rows=sailPathArray('jib',{clew:side*r.jib.clew,twist:r.jib.twist,depth:r.jib.depth,draft:r.jib.draft,wow:false,flip:side<0},true);
    const row=rows[5],chord=BABYLON.Vector3.Lerp(row[0],row.at(-1),.5),camber=row[6].subtract(chord);
    assert.equal(r.jib.backed,true);assert.ok(camber.z*side>0);}
});

test('fully eased opposite sheet permits the intended wide clew angle',()=>{
  for(const jcar of [0,.5,1]){
    reset({twaC:125,jsheet:0,jsheetw:0,jcar});const r=compute(),q=jibClewLimits(r.jib,state,1);
    assert.equal(q.constraintConflict,false);assert.ok(Math.abs(q.max-78)<1e-8,`car ${jcar}: maximum ${q.max}`);
    assert.ok(r.jib.clew>70,`car ${jcar}: clew ${r.jib.clew}`);
  }
});

test('constraint conflicts are explicit while ordinary states remain compatible',()=>{
  for(const o of [{twaC:45,jsheet:.75,jsheetw:0,jcar:0},{twaC:90,jsheet:.4,jsheetw:0,jcar:.5},{twaC:165,jsheet:.05,jsheetw:.6,jcar:1}]){
    reset(o);const r=compute();assert.equal(jibClewLimits(r.jib,state,1).constraintConflict,false);}
  reset({twaC:45,jsheet:.9,jsheetw:.9,jcar:.5});const r=compute();assert.equal(jibClewLimits(r.jib,state,1).constraintConflict,true);
});
