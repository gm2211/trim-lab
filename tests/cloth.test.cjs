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
const clothStart = src.indexOf('const CLOTH={};');
const clothEnd = src.indexOf('function tick3D', clothStart);
assert.ok(modelStart >= 0 && modelEnd > modelStart && sailStart >= 0 && sailEnd > sailStart);
assert.ok(clothStart >= 0 && clothEnd > clothStart, 'cloth solver source not found');

const ctx = vm.createContext({BABYLON});
vm.runInContext(
  src.slice(modelStart, modelEnd) +
  '\nfunction tackSign(){ return (state.twaSide||1)<0?-1:1; }\n' +
  'const V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);\n' +
  src.slice(sailStart, sailEnd) +
  src.slice(clothStart, clothEnd) +
  '\nglobalThis.model={state,compute,sailWindAt,sailPathArray,clothInit,clothRetarget,clothStep,clothRows,CLOTH,' +
    'clothResolveContacts:typeof clothResolveContacts==="function"?clothResolveContacts:null};',
  ctx,
);

const model = ctx.model;
const defaults = {...model.state};

function run(overrides = {}) {
  Object.keys(model.state).forEach(key => delete model.state[key]);
  Object.assign(model.state, defaults, overrides);
  return model.compute();
}

function resetCloth() {
  delete model.CLOTH.main;
  delete model.CLOTH.jib;
}

function shape(r, side, kind) {
  const common = kind === 'main'
    ? {boom: side * r.main.boom, twist: r.main.twist, depth: r.main.depth, draft: r.main.draft}
    : {clew: side * r.jib.clew, twist: r.jib.twist, depth: r.jib.depth, draft: r.jib.draft,
       wow: r.jib.wow};
  common.flip = side < 0 !== (kind === 'jib' && r.jib.wow);
  return common;
}

function initialize(r, side = 1) {
  resetCloth();
  const mainShape = shape(r, side, 'main');
  const jibShape = shape(r, side, 'jib');
  model.clothInit('main', model.sailPathArray('main', mainShape, true),
    model.sailPathArray('main', mainShape, false));
  model.clothInit('jib', model.sailPathArray('jib', jibShape, true),
    model.sailPathArray('jib', jibShape, false));
}

function retarget(r, side) {
  for (const kind of ['main', 'jib']) {
    const sailShape=shape(r,side,kind);
    model.clothRetarget(kind,model.sailPathArray(kind,sailShape,true),
      model.sailPathArray(kind,sailShape,false));
  }
}

function advance(r, steps, startStep = 0) {
  const dt=1/60;
  const anchors={};
  for (const kind of ['main','jib']) {
    const cloth=model.CLOTH[kind];
    anchors[kind]=cloth.p.map((p,i)=>cloth.w[i]===0?p.clone():null);
  }
  for (let step=1;step<=steps;step++) {
    const time=(startStep+step)*dt, wind=model.sailWindAt(r,time);
    model.clothStep('main',wind,dt,time);
    model.clothStep('jib',wind,dt,time);
    const before={};
    for (const kind of ['main','jib']) {
      const cloth=model.CLOTH[kind];
      before[kind]=cloth.p.map((p,i)=>[p.x,cloth.pp[i].x]);
    }
    model.clothResolveContacts();
    for (const kind of ['main','jib']) {
      const cloth=model.CLOTH[kind];
      for (let i=0;i<cloth.p.length;i++) {
        const dx=cloth.p[i].x-before[kind][i][0], dpx=cloth.pp[i].x-before[kind][i][1];
        if (Math.abs(dx-dpx)>1e-10) assert.fail(`${kind} contact injected velocity at particle ${i}`);
        const pin=anchors[kind][i];
        if (pin && (cloth.p[i].x!==pin.x || cloth.p[i].y!==pin.y || cloth.p[i].z!==pin.z ||
          cloth.pp[i].x!==pin.x || cloth.pp[i].y!==pin.y || cloth.pp[i].z!==pin.z)) {
          assert.fail(`${kind} contact moved pinned particle ${i}`);
        }
      }
    }
    if (step===1 || step%30===0 || step===steps) {
      const count=intersectionCount(model.clothRows('main'),model.clothRows('jib'));
      assert.equal(count,0,`${count} intersections at cloth step ${startStep+step}`);
    }
  }
}

function triangles(rows) {
  const out = [];
  for (let y = 0; y + 1 < rows.length; y++) {
    for (let x = 0; x + 1 < rows[y].length; x++) {
      const a = rows[y][x], b = rows[y][x + 1];
      const c = rows[y + 1][x], d = rows[y + 1][x + 1];
      out.push([a, c, b], [d, b, c]);
    }
  }
  return out;
}

function sub(a, b) {
  return {x:a.x-b.x, y:a.y-b.y, z:a.z-b.z};
}
function cross(a, b) {
  return {x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x};
}
function dot(a, b) {
  return a.x*b.x+a.y*b.y+a.z*b.z;
}

// Independent Moller-Trumbore oracle. Endpoints are excluded: touching hems
// are allowed, but a cloth edge passing through the other sail is not.
function segmentPiercesTriangle(p, q, tri, eps = 1e-7) {
  const [a, b, c] = tri;
  const dir = sub(q, p), edge1 = sub(b, a), edge2 = sub(c, a);
  const h = cross(dir, edge2), det = dot(edge1, h);
  if (Math.abs(det) < eps) return false;
  const inv = 1/det, s = sub(p, a), u = inv*dot(s, h);
  if (u <= eps || u >= 1-eps) return false;
  const v = inv*dot(dir, cross(s, edge1));
  if (v <= eps || u+v >= 1-eps) return false;
  const t = inv*dot(edge2, cross(s, edge1));
  return t > eps && t < 1-eps;
}

function trianglesIntersect(a, b) {
  for (let i = 0; i < 3; i++) if (segmentPiercesTriangle(a[i], a[(i+1)%3], b)) return true;
  for (let i = 0; i < 3; i++) if (segmentPiercesTriangle(b[i], b[(i+1)%3], a)) return true;
  return false;
}

function intersectionCount(mainRows, jibRows) {
  const main = triangles(mainRows), jib = triangles(jibRows);
  let count = 0;
  for (const a of main) for (const b of jib) if (trianglesIntersect(a, b)) count++;
  return count;
}

function barycentricYZ(p, tri, eps = 1e-9) {
  const [a, b, c] = tri;
  const den = (b.z-c.z)*(a.y-c.y)+(c.y-b.y)*(a.z-c.z);
  if (Math.abs(den) < eps) return null;
  const u = ((b.z-c.z)*(p.y-c.y)+(c.y-b.y)*(p.z-c.z))/den;
  const v = ((c.z-a.z)*(p.y-c.y)+(a.y-c.y)*(p.z-c.z))/den;
  const w = 1-u-v;
  return u >= -eps && v >= -eps && w >= -eps ? [u, v, w] : null;
}

function xAt(weights, tri) {
  return weights[0]*tri[0].x+weights[1]*tri[1].x+weights[2]*tri[2].x;
}

function projectedEdgeCross(a, b, c, d, eps = 1e-9) {
  const ay=b.y-a.y, az=b.z-a.z, cy=d.y-c.y, cz=d.z-c.z;
  const den=ay*cz-az*cy;
  if (Math.abs(den) < eps) return null;
  const py=c.y-a.y, pz=c.z-a.z;
  const t=(py*cz-pz*cy)/den, u=(py*az-pz*ay)/den;
  if (t < -eps || t > 1+eps || u < -eps || u > 1+eps) return null;
  return {y:a.y+t*ay, z:a.z+t*az};
}

function projectedClearance(mainRows, jibRows) {
  let minimum = Infinity, samples = 0;
  for (const main of triangles(mainRows)) for (const jib of triangles(jibRows)) {
    const candidates=[];
    for (const p of main) if (barycentricYZ(p,jib)) candidates.push({y:p.y,z:p.z});
    for (const p of jib) if (barycentricYZ(p,main)) candidates.push({y:p.y,z:p.z});
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
      const p=projectedEdgeCross(main[i],main[(i+1)%3],jib[j],jib[(j+1)%3]);
      if (p) candidates.push(p);
    }
    for (const p of candidates) {
      const wm=barycentricYZ(p,main), wj=barycentricYZ(p,jib);
      if (!wm || !wj) continue;
      minimum=Math.min(minimum,xAt(wj,jib)-xAt(wm,main));
      samples++;
    }
  }
  return {minimum,samples};
}

test('sail cloth geometry mirrors exactly across tacks', () => {
  const cases=[
    ['normal',run({twaC:60,twaSide:1,mainhal:.2,jhal:.2})],
    ['wing-on-wing',run({twaC:165,twaSide:1,jsheet:0,jsheetw:1,mainhal:.2,jhal:.2})],
  ];
  assert.equal(cases[1][1].jib.wow,true);
  for (const [pose,r] of cases) for (const full of [true,false]) {
    for (const kind of ['main', 'jib']) {
      const starboard = model.sailPathArray(kind, shape(r, 1, kind), full);
      const port = model.sailPathArray(kind, shape(r, -1, kind), full);
      for (let row = 0; row < starboard.length; row++) {
        for (let col = 0; col < starboard[row].length; col++) {
          const a = starboard[row][col], b = port[row][col];
          const at=`${pose} ${full?'cloth':'pins'} ${kind} ${row},${col}`;
          assert.ok(Math.abs(a.x-b.x) < 1e-10, `${at} x differs`);
          assert.ok(Math.abs(a.y-b.y) < 1e-10, `${at} y differs`);
          assert.ok(Math.abs(a.z+b.z) < 1e-10, `${at} z does not mirror`);
        }
      }
    }
  }
});

test('eased main cannot pass through a tightly sheeted jib', () => {
  assert.equal(typeof model.clothResolveContacts, 'function', 'cloth contact resolver missing');
  for (const side of [1,-1]) {
    const r = run({twaC:60, twaSide:side, sheet:0, jsheet:1, mainhal:1, jhal:1});
    initialize(r,side);
    advance(r,180);
    const clearance=projectedClearance(model.clothRows('main'), model.clothRows('jib'));
    assert.ok(clearance.samples > 0, 'sails never share a projected region');
    assert.ok(clearance.minimum > 1e-4, `jib crosses behind main by ${-clearance.minimum}m`);
  }
});

test('cloth contact survives a luffing tack transition', () => {
  assert.equal(typeof model.clothResolveContacts, 'function', 'cloth contact resolver missing');
  const starboard=run({twaC:15,twaSide:1,sheet:.25,jsheet:.8,mainhal:1,jhal:1});
  initialize(starboard,1);
  advance(starboard,60);
  const port=run({twaC:15,twaSide:-1,sheet:.25,jsheet:.8,mainhal:1,jhal:1});
  retarget(port,-1);
  advance(port,180,60);
});
