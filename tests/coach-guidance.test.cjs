const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const physics = src.slice(src.indexOf('"use strict";'), src.indexOf('/* ---------------- coach ---------------- */'));
const optimizerStart = src.indexOf('function computeWith(params)');
const optimizer = src.slice(optimizerStart, src.indexOf('$("perfect").addEventListener', optimizerStart));
const coachStart = src.indexOf('function coachInstructions()');
const coach = src.slice(coachStart, src.indexOf('\nfunction coachParse', coachStart));
assert.ok([physics, optimizer, coach].every(Boolean), 'physics, optimizer and coach prompt are extractable');

function makeHarness() {
  const ctx = vm.createContext({console});
  vm.runInContext(`${physics}
let OPT=null, OPT_R=null, lastR=null;
const LINE_NAMES={sheet:'Mainsheet',trav:'Traveler',vang:'Boom vang',outhaul:'Outhaul',cunn:'Cunningham',backstay:'Backstay',mainhal:'Main halyard',jsheet:'Working jib sheet',jsheetw:'Windward jib sheet',jcar:'Jib car',jhal:'Jib halyard',reef1:'Reef 1',reef2:'Reef 2'};
const lineName=k=>LINE_NAMES[k];
const LINEMETA=Object.fromEntries(Object.keys(LINE_NAMES).map(k=>[k,{job:'real control'}]));
${optimizer}
${coach}
globalThis.api={state,POS,PANEL,compute,computeWith,solvePerfectTrim,coachInstructions,
  setResult(r){lastR=r;}, setCandidate(o,r){OPT=o;OPT_R=r;}};`, ctx);
  return ctx.api;
}

function snapshot(value) { return JSON.stringify(value); }

test('coach prompt uses live gust, heading, reef and off-wind objective without mutating state', () => {
  const api=makeHarness();
  Object.assign(api.state,{tws:24,gust:true,posIdx:0,twaC:125,reef1:1,reef2:0});
  const before=snapshot(api.state), r=api.compute({flow:false});
  api.setResult(r); api.setCandidate(null,null);
  const prompt=api.coachInstructions();

  assert.match(prompt,/effective true wind 30\.0 kt including the active gust/);
  assert.match(prompt,/true-wind angle 125°/);
  assert.match(prompt,/broad reach/);
  assert.doesNotMatch(prompt,/Close-hauled/);
  assert.match(prompt,/Selected main: Reef 1/);
  assert.match(prompt,/Optimization objective: boat speed on the selected heading/);
  assert.equal(snapshot(api.state),before);
});

test('coach prompt exposes only a fresh guided candidate and keeps questions read-only', () => {
  const api=makeHarness();
  Object.assign(api.state,{tws:12,gust:false,twaC:45,reef1:0,reef2:0});
  const before=snapshot(api.state), r=api.compute({flow:false});
  const solved=api.solvePerfectTrim(true), solvedResult=api.computeWith(solved);

  api.setResult(r); api.setCandidate(solved,null);
  let prompt=api.coachInstructions();
  assert.match(prompt,/No fresh simulator candidate is available/);
  assert.doesNotMatch(prompt,/SIMULATOR'S CURRENT GUIDED CANDIDATE/);

  api.setCandidate(solved,solvedResult);
  prompt=api.coachInstructions();
  assert.match(prompt,/SIMULATOR'S CURRENT GUIDED CANDIDATE: controls/);
  assert.match(prompt,/resulting shape/);
  assert.match(prompt,/Pure questions must be read-only: return null/);
  assert.match(prompt,/velocity made good to windward/);
  assert.match(prompt,/not perfect boat-specific truth/);
  assert.doesNotMatch(prompt,/\(target |copy the OPTIMIZER|OPTIMIZER'S CURRENT BEST|copy.*perfect/i);
  assert.equal(snapshot(api.state),before);
});
