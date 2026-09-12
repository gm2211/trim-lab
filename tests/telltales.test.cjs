const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

global.window = {};
require('../babylon.lib.js');
const BABYLON = window.BABYLON;

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const modelStart = src.indexOf('"use strict";');
const modelEnd = src.indexOf('/* ---------------- coach ---------------- */', modelStart);
const sailStart = src.indexOf('function sailPathArray');
const sailEnd = src.indexOf('async function ensure3D', sailStart);
const telltaleStart = src.indexOf('const TT_SEG=');
const telltaleEnd = src.indexOf('/* ---- position-based-dynamics sail cloth', telltaleStart);
assert.ok(modelStart >= 0 && modelEnd > modelStart, 'trim model source not found');
assert.ok(sailStart >= 0 && sailEnd > sailStart, 'sail geometry source not found');
assert.ok(telltaleStart >= 0 && telltaleEnd > telltaleStart, 'telltale source not found');

const runtime = {BABYLON, B3:{}};
const ctx = vm.createContext(runtime);
vm.runInContext(
  src.slice(modelStart, modelEnd) +
  '\nconst V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);\n' +
  'function tackSign(){return (state.twaSide||1)<0?-1:1;}\n' +
  src.slice(sailStart, sailEnd) +
  '\nlet B3=globalThis.B3, testAoa=0;\n' +
  'function rowAoaAt(){return testAoa;}\n' +
  src.slice(telltaleStart, telltaleEnd) +
  '\nglobalThis.api={state,compute,sailPathArray,stepTelltales,yarn,yarnClearCloth,' +
    'TT_SEG,TT_SIDES,TT_JIB_ROWS,TT_JIB_IX,TT_RADIUS,TT_OFF,' +
    'setTestAoa:value=>{testAoa=value;}};',
  ctx,
);

const api = ctx.api;
const defaults = {...api.state};

function run(overrides = {}) {
  Object.keys(api.state).forEach(key => delete api.state[key]);
  Object.assign(api.state, defaults, overrides);
  return api.compute();
}

function sailRows(r, side, kind) {
  const shape = kind === 'main'
    ? {boom:side*r.main.boom, twist:r.main.twist, depth:r.main.depth,
       draft:r.main.draft, flip:side < 0}
    : {clew:side*r.jib.clew, twist:r.jib.twist, depth:r.jib.depth,
       draft:r.jib.draft, wow:false, flip:side < 0};
  return api.sailPathArray(kind, shape, true);
}

function meshStub() {
  return {
    enabled:true,
    setEnabled(value) { this.enabled = value; },
    isEnabled() { return this.enabled; },
    updateVerticesData() {},
  };
}

function bank(slots) {
  const length=slots*api.TT_SEG*api.TT_SIDES*3;
  return {mesh:meshStub(), pos:new Float32Array(length), normals:new Float32Array(length)};
}

function freshTelltales() {
  runtime.B3.tt={red:bank(3), grn:bank(3), lch:bank(4), st:[], on:true};
  for(let i=0;i<10;i++) runtime.B3.tt.st.push({lift:0,stall:0,seed:i*2.4});
  runtime.B3.heelCur=0;
  runtime.B3.t=3.25;
  return runtime.B3.tt;
}

function ringCenter(yarnBank, slot, ring) {
  const center=new BABYLON.Vector3(0,0,0);
  for(let side=0;side<api.TT_SIDES;side++) {
    const o=((slot*api.TT_SEG+ring)*api.TT_SIDES+side)*3;
    center.x+=yarnBank.pos[o]; center.y+=yarnBank.pos[o+1]; center.z+=yarnBank.pos[o+2];
  }
  return center.scale(1/api.TT_SIDES);
}

function stepCase(side, aoaError, dt=1) {
  const r=run({twaSide:side, twaC:45, mainhal:.9, jhal:.9});
  const main=sailRows(r,side,'main'), jib=sailRows(r,side,'jib');
  const tt=freshTelltales();
  api.setTestAoa(r.idl.aoa-4+aoaError);
  api.stepTelltales(main,jib,r,dt);
  return {r,main,jib,tt};
}

function localNormal(rows, iy, ix) {
  const T=rows[iy][ix+1].subtract(rows[iy][ix-1]).normalize();
  const U=rows[iy+1][ix].subtract(rows[iy-1][ix]).normalize();
  return BABYLON.Vector3.Cross(U,T).normalize();
}

test('red stays on the port face and green on starboard on both tacks', () => {
  for(const side of [1,-1]) {
    const {jib,tt}=stepCase(side,0,0);
    for(let slot=0;slot<api.TT_JIB_ROWS.length;slot++) {
      const anchor=jib[api.TT_JIB_ROWS[slot]][api.TT_JIB_IX];
      const red=ringCenter(tt.red,slot,0), green=ringCenter(tt.grn,slot,0);
      assert.ok(red.z-anchor.z > api.TT_RADIUS,
        `tack ${side}, row ${slot}: red is not clear of the port face`);
      assert.ok(green.z-anchor.z < -api.TT_RADIUS,
        `tack ${side}, row ${slot}: green is not clear of the starboard face`);
    }
  }
});

test('windward lift and leeward stall mirror between physical yarn colors', () => {
  const stateFor=(result,slot,color)=>{
    const N=localNormal(result.jib,api.TT_JIB_ROWS[slot],api.TT_JIB_IX);
    const portSign=N.z>=0?1:-1, sign=color==='red'?portSign:-portSign;
    return result.tt.st[slot*2+(sign>0?0:1)];
  };
  for(const aoaError of [-8,13]) {
    const starboard=stepCase(1,aoaError),port=stepCase(-1,aoaError);
    let active=false;
    for(let slot=0;slot<api.TT_JIB_ROWS.length;slot++) {
      const sr=stateFor(starboard,slot,'red'),sg=stateFor(starboard,slot,'grn');
      const pr=stateFor(port,slot,'red'),pg=stateFor(port,slot,'grn');
      assert.deepEqual([sr.lift,sr.stall],[pg.lift,pg.stall],
        `row ${slot}: starboard red does not mirror port green`);
      assert.deepEqual([sg.lift,sg.stall],[pr.lift,pr.stall],
        `row ${slot}: starboard green does not mirror port red`);
      active ||= aoaError<0 ? Math.max(sr.lift,sg.lift)>.99 : Math.max(sr.stall,sg.stall)>.99;
    }
    assert.ok(active,`${aoaError<0?'lift':'stall'} fixture did not activate a yarn`);
  }
});

test('tube normals and radii stay finite and independent of the camera', () => {
  const {r,main,jib,tt}=stepCase(1,8,1);
  const before={red:Array.from(tt.red.pos),grn:Array.from(tt.grn.pos),lch:Array.from(tt.lch.pos)};
  const states=tt.st.map(value=>({...value}));
  runtime.B3.cam={radius:2,activeCamera:{unexpected:true}};
  api.stepTelltales(main,jib,r,0);
  runtime.B3.cam={radius:40};
  api.stepTelltales(main,jib,r,0);
  assert.deepEqual(tt.st,states,'dt=0 changed telltale airflow state');
  for(const name of ['red','grn','lch']) {
    const yarnBank=tt[name];
    assert.deepEqual(Array.from(yarnBank.pos),before[name],`${name} geometry changed with camera`);
    assert.ok(Array.from(yarnBank.pos).every(Number.isFinite),`${name} contains a non-finite vertex`);
    assert.ok(Array.from(yarnBank.normals).every(Number.isFinite),`${name} contains a non-finite normal`);
    const slots=name==='lch'?4:3;
    for(let slot=0;slot<slots;slot++) for(let ring=0;ring<api.TT_SEG;ring++) {
      const center=ringCenter(yarnBank,slot,ring);
      const radii=[];
      for(let side=0;side<api.TT_SIDES;side++) {
        const o=((slot*api.TT_SEG+ring)*api.TT_SIDES+side)*3;
        const vertex=new BABYLON.Vector3(yarnBank.pos[o],yarnBank.pos[o+1],yarnBank.pos[o+2]);
        const normal=new BABYLON.Vector3(yarnBank.normals[o],yarnBank.normals[o+1],yarnBank.normals[o+2]);
        radii.push(BABYLON.Vector3.Distance(vertex,center));
        assert.ok(Math.abs(normal.length()-1)<2e-6,
          `${name} slot ${slot}, ring ${ring}: non-unit normal`);
      }
      assert.ok(Math.min(...radii)>0 && Math.max(...radii)<=api.TT_RADIUS+2e-6,
        `${name} slot ${slot}, ring ${ring}: tube radius is out of bounds`);
      assert.ok(Math.max(...radii)-Math.min(...radii)<2e-6,
        `${name} slot ${slot}, ring ${ring}: cross-section is not round`);
    }
  }
});

function triangles(rows) {
  const result=[];
  for(let y=0;y<rows.length-1;y++) for(let x=0;x<rows[y].length-1;x++) {
    const a=rows[y][x],b=rows[y+1][x],c=rows[y][x+1],d=rows[y+1][x+1];
    result.push([a,b,c],[d,c,b]);
  }
  return result;
}

// Signed clearance from p to the triangle along direction N. Positive means p
// is already outside on the N side; null means the projected point misses it.
function clearanceAlong(p,N,[a,b,c]) {
  const e1=b.subtract(a),e2=c.subtract(a),plane=BABYLON.Vector3.Cross(e1,e2);
  const planeLength=plane.length(),denom=BABYLON.Vector3.Dot(plane,N);
  if(planeLength<1e-12||Math.abs(denom)<1e-12) return null;
  const distance=BABYLON.Vector3.Dot(plane,a.subtract(p))/denom;
  const q=p.add(N.scale(distance)).subtract(a);
  const aa=BABYLON.Vector3.Dot(e1,e1),ab=BABYLON.Vector3.Dot(e1,e2),bb=BABYLON.Vector3.Dot(e2,e2);
  const qa=BABYLON.Vector3.Dot(q,e1),qb=BABYLON.Vector3.Dot(q,e2),det=aa*bb-ab*ab;
  if(det<1e-12) return null;
  const u=(bb*qa-ab*qb)/det,v=(aa*qb-ab*qa)/det;
  if(u < -1e-6 || v < -1e-6 || u+v > 1+1e-6) return null;
  return -distance*Math.abs(denom)/planeLength;
}

test('centerline follows a bent sail without penetrating the cloth', () => {
  const rows=Array.from({length:5},(_,iy)=>Array.from({length:9},(_,ix)=>{
    const x=(ix-3)*.08, progress=Math.max(0,Math.min(1,x/.24));
    return new BABYLON.Vector3(x,(iy-2)*.15,-.032*Math.sin(progress*Math.PI/2)**2);
  }));
  const iy=2,ix=3,A=rows[iy][ix];
  const T=rows[iy][ix+1].subtract(rows[iy][ix-1]).normalize();
  const U=rows[iy+1][ix].subtract(rows[iy-1][ix]).normalize();
  const N=BABYLON.Vector3.Cross(U,T).normalize(),tris=triangles(rows);
  const raw=Array.from({length:api.TT_SEG},(_,k)=>
    A.add(N.scale(api.TT_OFF)).add(T.scale(.24*k/(api.TT_SEG-1))));
  const rawMinimum=Math.min(...raw.flatMap(p=>tris.map(tri=>clearanceAlong(p,N,tri)).filter(v=>v!==null)));
  assert.ok(rawMinimum<api.TT_RADIUS, 'bent fixture does not challenge a straight yarn');

  const yarnBank=bank(1);
  runtime.B3.t=2;
  api.yarn(yarnBank,0,A,T,N,U,new BABYLON.Vector3(0,-1,0),.24,api.TT_OFF,
    {lift:0,stall:0,seed:0},rows,iy,ix);
  for(let ring=0;ring<api.TT_SEG;ring++) {
    const center=ringCenter(yarnBank,0,ring);
    const candidates=tris.map(tri=>clearanceAlong(center,N,tri)).filter(v=>v!==null);
    assert.ok(candidates.length>0, `ring ${ring} has no cloth projection`);
    assert.ok(Math.min(...candidates)>=api.TT_OFF-2e-6,
      `ring ${ring} is only ${Math.min(...candidates)} m outside the cloth`);
  }
});
