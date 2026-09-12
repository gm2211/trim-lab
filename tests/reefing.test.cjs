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
const sailEnd = src.indexOf('function sceneFrameDelta', sailStart);
const trimStart = src.indexOf('function computeWith');
const trimEnd = src.indexOf('$("perfect").addEventListener', trimStart);
const renderStart = src.indexOf('function sectionPath');
const renderMarker = src.indexOf('render: deck view', renderStart);
const renderEnd = src.indexOf('*/', renderMarker) + 2;
const twistStart = src.indexOf('function renderTwist');
const twistEnd = src.indexOf('function heelArc', twistStart);
assert.ok(modelStart >= 0 && modelEnd > modelStart);
assert.ok(sailStart >= 0 && sailEnd > sailStart);
assert.ok(trimStart >= 0 && trimEnd > trimStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart);
assert.ok(twistStart >= 0 && twistEnd > twistStart);
const ctx = vm.createContext({
  BABYLON,
  document: {getElementById(id) { return this.nodes[id] || (this.nodes[id] = {innerHTML:'', textContent:''}); }, nodes: {}},
});
vm.runInContext(
  src.slice(modelStart, modelEnd) +
  src.slice(trimStart, trimEnd) +
  'const V3=(x,y,z)=>new BABYLON.Vector3(x,y,z);\n' +
  'function tackSign(){return (state.twaSide||1)<0?-1:1;}\n' +
  'function tgt(r){return {mt:r.main.twist,md:r.main.depth,mdr:r.main.draft,jt:r.jib.twist,jd:r.jib.depth};}\n' +
  src.slice(sailStart, sailEnd) +
  src.slice(renderStart, renderEnd) +
  src.slice(twistStart, twistEnd) +
  '\nglobalThis.model={state,compute,mainReef,sailPathArray,solvePerfectTrim,BOAT,RIG};' +
  '\nglobalThis.renderTwist=renderTwist; globalThis.renderSections=renderSections;',
  ctx,
);
const model = ctx.model;
const defaults = {...model.state};

function run(overrides = {}) {
  Object.keys(model.state).forEach(key => delete model.state[key]);
  Object.assign(model.state, defaults, overrides);
  return model.compute();
}

function integralAbove(f) {
  const primitive = x => x - .9 * Math.pow(x, 2.05) / 2.05;
  return (primitive(1) - primitive(f)) / primitive(1);
}

test('reef controls default released and highest set line wins', () => {
  assert.equal(defaults.reef1, 0);
  assert.equal(defaults.reef2, 0);
  for (const [reef1, reef2, level] of [[0, 0, 0], [1, 0, 1], [0, 1, 2], [1, 1, 2]]) {
    const r = model.mainReef({reef1, reef2});
    assert.equal(r.level, level);
  }
});

test('mainReef exposes the specified reef geometry and integrated area scale', () => {
  const expected = [
    {level: 0, fraction: 0},
    {level: 1, fraction: .16},
    {level: 2, fraction: .30},
  ];
  for (const {level, fraction} of expected) {
    const r = model.mainReef({reef1: level >= 1 ? 1 : 0, reef2: level >= 2 ? 1 : 0});
    assert.equal(r.level, level);
    assert.equal(r.fraction, fraction);
    assert.equal(r.height, 1 - fraction);
    assert.ok(Math.abs(r.foot - (1 - .9 * Math.pow(fraction, 1.05))) < 1e-12);
    assert.ok(Math.abs(r.areaScale - integralAbove(fraction)) < 1e-12);
  }
});

test('computed main reports reef level and reduced area and span', () => {
  const full = run();
  const reef1 = run({reef1: 1});
  const reef2 = run({reef2: 1});
  assert.equal(full.main.reef, 0);
  assert.equal(reef1.main.reef, 1);
  assert.equal(reef2.main.reef, 2);
  assert.ok(reef1.main.area < full.main.area);
  assert.ok(reef2.main.area < reef1.main.area);
  assert.ok(reef1.main.span < full.main.span);
  assert.ok(reef2.main.span < reef1.main.span);
});

function shape(r) {
  return {boom: r.main.boom, twist: r.main.twist, depth: r.main.depth, draft: r.main.draft};
}

test('cropped main path has a lower head, shorter foot, and remains on the boom', () => {
  const fullResult = run();
  const full = model.sailPathArray('main', shape(fullResult), true);
  const reefResult = run({reef2: 1});
  const reef = model.sailPathArray('main', shape(reefResult), true);
  const baseY = model.RIG.boomY + .045;
  assert.ok(reef.at(-1)[0].y < full.at(-1)[0].y);
  assert.ok(reef[0][0].y >= baseY - 1e-12);
  assert.ok(Math.abs(reef[0].at(-1).y - baseY) < 1e-12);
  const fullFoot = full[0][0].subtract(full[0].at(-1)).length();
  const reefFoot = reef[0][0].subtract(reef[0].at(-1)).length();
  assert.ok(reefFoot < fullFoot);
});

test('main halyard hoist remains relative to reef height', () => {
  const fullResult = run({mainhal: .175});
  const fullPath = model.sailPathArray('main', shape(fullResult), false);
  const reef = run({reef1: 1, mainhal: .175});
  const path = model.sailPathArray('main', shape(reef), false);
  const fullHeight = fullPath.at(-1)[0].y - (model.RIG.boomY + .045);
  const observedHeight = path.at(-1)[0].y - (model.RIG.boomY + .045);
  assert.ok(Math.abs(observedHeight / fullHeight - model.mainReef().height) < 1e-9,
    `observed ${observedHeight} full ${fullHeight} reef height ${model.mainReef().height}`);
});

test('reefing reduces heel in 24 knots and dropped sails stay dropped', () => {
  const full = run({tws: 24, twaC: 45});
  const reefed = run({tws: 24, twaC: 45, reef2: 1});
  assert.ok(reefed.heel < full.heel, `reef heel ${reefed.heel}, full ${full.heel}`);
  for (const reef of [0, 1]) {
    const r = run({reef1: reef, reef2: reef, mainhal: 0, jhal: 0});
    assert.ok(r.speed < .01);
    assert.ok(r.heel < .01);
  }
});

test('reef choice is reversible on both tacks and defaults restore', () => {
  const starboard = run({twaC: 60, twaSide: 1, reef1: 1});
  const port = run({twaC: 60, twaSide: -1, reef1: 1});
  assert.equal(starboard.main.reef, 1);
  assert.equal(port.main.reef, 1);
  assert.equal(port.speed, starboard.speed);
  assert.equal(port.heel, starboard.heel);
  const restored = run();
  assert.equal(restored.main.reef, 0);
  assert.equal(model.state.reef1, defaults.reef1);
  assert.equal(model.state.reef2, defaults.reef2);
});

test('perfect trim keeps the selected reef while searching feasible trim', () => {
  run({tws: 24, twaC: 45, reef2: 1});
  const before = model.mainReef(model.state).level;
  const params = model.solvePerfectTrim(true);
  assert.equal(before, 2);
  assert.equal(model.mainReef(model.state).level, 2);
  if (Object.hasOwn(params, 'reef1')) assert.equal(params.reef1, model.state.reef1);
  if (Object.hasOwn(params, 'reef2')) assert.equal(params.reef2, model.state.reef2);
});

function renderWithReef(name, result, reef2) {
  model.state.reef1 = 0;
  model.state.reef2 = reef2;
  ctx.document.nodes[name] = {innerHTML: '', textContent: ''};
  if (name === 'svg-twist') ctx.renderTwist(result);
  else ctx.renderSections(result);
  return ctx.document.nodes[name].innerHTML;
}

function jibTwistLines(svg) {
  return [...svg.matchAll(/<line[^>]*stroke="var\(--teal\)"[^>]*>/g)].map(m => m[0]);
}

function jibSectionPaths(svg) {
  const paths = [...svg.matchAll(/<path class="sailpath"[^>]*>/g)].map(m => m[0]);
  return paths.filter((_, i) => i % 4 >= 2);
}

test('reefing does not alter jib geometry in twist or section renderers', () => {
  const fixed = run({twaC: 60, reef1: 0, reef2: 0});
  const twistFull = renderWithReef('svg-twist', fixed, 0);
  const twistReef = renderWithReef('svg-twist', fixed, 1);
  assert.deepEqual(jibTwistLines(twistReef), jibTwistLines(twistFull));
  const sectionsFull = renderWithReef('svg-sections', fixed, 0);
  const sectionsReef = renderWithReef('svg-sections', fixed, 1);
  assert.deepEqual(jibSectionPaths(sectionsReef), jibSectionPaths(sectionsFull));
});
