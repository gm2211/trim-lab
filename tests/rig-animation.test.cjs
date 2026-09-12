const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
global.window={};
require('../babylon.lib.js');
const BABYLON=window.BABYLON;
const src=fs.readFileSync(process.env.TRIM_SOURCE||'src-app.html','utf8');
const modelStart=src.indexOf('"use strict";');
const modelEnd=src.indexOf('/* ---------------- coach ---------------- */',modelStart);
const sailStart=src.indexOf('function sailPathArray');
const sailEnd=src.indexOf('async function ensure3D',sailStart);
assert.ok(modelStart>=0&&modelEnd>modelStart&&sailStart>=0&&sailEnd>sailStart);
const ctx=vm.createContext({BABYLON});
vm.runInContext(src.slice(modelStart,modelEnd)+
  '\nconst V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);\n'+src.slice(sailStart,sailEnd)+
  '\nglobalThis.model={state,RIG,backstayRig,mastOffsetAt,forestayPointAt,sailPathArray,stepRigDisplay,prepareMastMesh};',ctx);
const {state,RIG,backstayRig,mastOffsetAt,forestayPointAt,sailPathArray,stepRigDisplay,prepareMastMesh}=ctx.model;
const defaults={...state};
function close(actual,expected,tolerance=1e-10){
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
}
function advance(current,target,seconds,hz){
  for(let i=0;i<seconds*hz;i++) current=stepRigDisplay(current,target,1/hz);
  return current;
}
test('rig animation advances equally across display frame rates',()=>{
  const loose=backstayRig(0,16),tight=backstayRig(1,16);
  const a=advance(loose,tight,.5,30),b=advance(loose,tight,.5,120);
  for(const key of Object.keys(tight)) close(a[key],b[key]);
  assert.ok(a.mastBend>loose.mastBend&&a.mastBend<tight.mastBend);
  assert.ok(a.forestaySag<loose.forestaySag&&a.forestaySag>tight.forestaySag);
});
test('easing reverses rig movement and converges exactly to relaxed geometry',()=>{
  const loose=backstayRig(0,16),tight=backstayRig(1,16);
  const loaded=advance(loose,tight,1,60),easing=stepRigDisplay(loaded,loose,1/60);
  assert.ok(easing.mastBend<loaded.mastBend);
  assert.ok(easing.forestaySag>loaded.forestaySag);
  const restored=advance(easing,loose,8,60);
  for(const key of Object.keys(loose)) assert.equal(restored[key],loose[key]);
});
test('zero elapsed time freezes rig, including near-settled values',()=>{
  const loose=backstayRig(0,16),tight=backstayRig(1,16);
  const frozen=stepRigDisplay(loose,tight,0);
  for(const key of Object.keys(loose)) assert.equal(frozen[key],loose[key]);
  const nearby={...tight,mastBend:tight.mastBend-1e-8};
  assert.equal(stepRigDisplay(nearby,tight,0).mastBend,nearby.mastBend);
});
test('initialization and paused or reduced-motion snapping show final rig',()=>{
  const loose=backstayRig(0,16),tight=backstayRig(1,16);
  for(const displayed of [stepRigDisplay(null,tight,0),stepRigDisplay(loose,tight,0,true)]){
    assert.notEqual(displayed,tight);
    for(const key of Object.keys(tight)) assert.equal(displayed[key],tight[key]);
  }
});
test('mast mesh subdivision adds bendable rings and preserves finite bounded geometry',()=>{
  const assets=JSON.parse(fs.readFileSync('assets/boat/meshes.json','utf8')).assets.mast;
  let total=0;
  // The committed WebGL-only Babylon bundle excludes NullEngine. This adapter
  // exercises real subdivision math on exported mesh buffers; browser scene
  // tests cover Babylon's GPU upload, deformation and rendered integration.
  for(const asset of assets){
    const buffers={
      [BABYLON.VertexBuffer.PositionKind]:asset.positions,
      [BABYLON.VertexBuffer.NormalKind]:asset.normals,
      [BABYLON.VertexBuffer.UVKind]:asset.uvs,
    };
    const mesh={indices:asset.indices,
      getVerticesData(kind){return buffers[kind];},
      setVerticesData(kind,values){buffers[kind]=values;},
      getIndices(){return this.indices;},
      setIndices(values){this.indices=values;},
    };
    const prepared=prepareMastMesh(mesh),positions=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const normals=mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind),uvs=mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    total+=positions.length/3;
    assert.equal(prepared.rest.length,positions.length);
    assert.equal(prepared.positions.length,positions.length);
    assert.equal(normals.length,positions.length);
    assert.equal(uvs.length,positions.length/3*2);
    for(const values of [positions,normals,uvs]) for(const n of values) assert.ok(Number.isFinite(n));
    const heights=new Set();
    for(let i=1;i<positions.length;i+=3) heights.add(positions[i].toFixed(4));
    assert.ok(heights.size>25,`only ${heights.size} height rings`);
    for(let axis=0;axis<3;axis++){
      const original=asset.positions.filter((_,i)=>i%3===axis),actual=Array.from(positions).filter((_,i)=>i%3===axis);
      close(Math.min(...actual),Math.min(...original),1e-6);
      close(Math.max(...actual),Math.max(...original),1e-6);
    }
    const indices=mesh.getIndices();
    for(const index of indices) assert.ok(Number.isInteger(index)&&index>=0&&index<positions.length/3);
    for(let i=0;i<indices.length;i+=3){
      const ys=[0,1,2].map(j=>positions[indices[i+j]*3+1]);
      assert.ok(Math.max(...ys)-Math.min(...ys)<=.300001,'long face still cannot follow mast bow');
    }
  }
  assert.ok(total<10000,`mast has ${total} vertices`);
});
test('sail luffs follow explicit displayed rig across hoists, Cunningham, tacks and wing modes',()=>{
  const rig=backstayRig(1,16);
  try{
    for(const hoist of [0,.15,.35,1]) for(const forceFull of [false,true]) for(const cunn of [0,1])
      for(const side of [-1,1]) for(const wow of [false,true]) for(const kind of ['main','jib']){
        Object.assign(state,defaults,{mainhal:hoist,jhal:hoist,backstay:0,cunn});
        const flip=(side<0)!==(kind==='jib'&&wow);
        const shape={rig,boom:side*20,clew:side*20,twist:15,depth:.12,draft:.43,flip,wow};
        const rows=sailPathArray(kind,shape,forceFull);
        const hoistFraction=forceFull?1:Math.min(hoist/.35,1);
        const heightFraction=Math.max(.12,hoistFraction);
        for(let iy=0;iy<rows.length;iy++){
          const hf=iy/(rows.length-1),u=hf*heightFraction,p=rows[iy][0];
          if(kind==='main'){
            const lowerLuffTravel=.20*cunn*hoistFraction*(hf/.1)*Math.exp(1-hf/.1)*(1-hf);
            close(p.y,RIG.boomY+.045+9*u-lowerLuffTravel);
            close(p.x,RIG.mastX+mastOffsetAt(p.y,rig));close(p.z,0);
          }else{
            const expected=forestayPointAt(u,rig,side);
            for(const axis of ['x','y','z']) close(p[axis],expected[axis]);
          }
        }
      }
  }finally{Object.assign(state,defaults);}
});
