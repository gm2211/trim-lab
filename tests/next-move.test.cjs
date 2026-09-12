const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test, beforeEach} = require('node:test');

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const physics = src.slice(src.indexOf('"use strict";'), src.indexOf('/* ---------------- coach ---------------- */'));
const alertStart = src.indexOf('function nextMoveAlert');
const alert = src.slice(alertStart, src.indexOf('\n\n/* ---------------- render:', alertStart));
const reasonStart = src.indexOf('function nextMoveReason');
const reason = src.slice(reasonStart, src.indexOf('\n// A recommendation belongs', reasonStart));
const renderStart = src.indexOf('function renderNext');
const render = src.slice(renderStart, src.indexOf('\n\n/* ---------------- main update', renderStart));
const optimizerStart = src.indexOf('function computeWith(params)');
const optimizer = src.slice(optimizerStart, src.indexOf('$("perfect").addEventListener', optimizerStart));
assert.ok([physics, alert, reason, render, optimizer].every(Boolean), 'model and guidance source are extractable');

function makeHarness() {
  const els = {};
  const document = {getElementById(id) { return els[id] ||= {className:'', textContent:'', innerHTML:''}; }};
  const ctx = vm.createContext({document, console, els});
  vm.runInContext(`${physics}\nlet OPT=null,OPT_R=null,OPT_MOVE=null,lastR=null,PREV_STATE=null;\nconst lineName=k=>({sheet:'Mainsheet',trav:'Traveler',vang:'Boom vang',outhaul:'Outhaul',cunn:'Cunningham',backstay:'Backstay',mainhal:'Main halyard',jsheet:'Working jib sheet',jsheetw:'Windward jib sheet',jcar:'Jib car',jhal:'Jib halyard'}[k]||k);\nconst sideWord=()=> 'windward';\n${optimizer}\n${alert}\n${reason}\n${render}\nglobalThis.api={state,POS,PANEL,compute,computeWith,solvePerfectTrim,chooseTrimMove,trimObjective,trimProgress,trimContext,nextMoveAlert,nextMoveReason,renderNext,els,setGuidance(opt,move){OPT=opt;OPT_MOVE=move;},setPrevious(v){PREV_STATE=v;}};`, ctx);
  return ctx.api;
}

const api = makeHarness();
const defaults = {...api.state};
function reset(overrides={}) {
  Object.keys(api.state).forEach(k=>delete api.state[k]);
  Object.assign(api.state, defaults, overrides);
  api.setGuidance(null, null);
  api.setPrevious(null);
  Object.values(api.els).forEach(el=>{ el.className=''; el.textContent=''; el.innerHTML=''; });
  return api.compute({flow:false});
}
function shown() { return {move:api.els.fxMove.textContent, sub:api.els.fxSub.textContent, cls:api.els.fxNext.className}; }

beforeEach(()=>reset());

test('urgent guidance prioritizes no wind, in-irons recovery, hoists and a backed jib',()=>{
  let r=reset({tws:0,twaC:45});
  assert.match(api.nextMoveAlert(r)[0],/Wait for wind/);
  r=reset({tws:12,twaC:25});
  assert.match(api.nextMoveAlert(r)[1],/back the jib.*release it.*Build speed/i);
  r=reset({twaC:45,mainhal:.2});
  assert.match(api.nextMoveAlert(r)[0],/Hoist the main/);
  r=reset({twaC:45,jhal:.2});
  assert.match(api.nextMoveAlert(r)[0],/Hoist the jib/);
  r=reset({twaC:60,jsheet:.75,jsheetw:.9});
  assert.equal(r.jib.backed,true);
  assert.match(api.nextMoveAlert(r)[0],/Ease the .*jib sheet/);
});

test('excessive load produces an immediate relief or reef instruction',()=>{
  const r=reset({tws:30,twaC:45,sheet:1,trav:1,vang:1,outhaul:0,backstay:0});
  assert.ok(r.heel>26 || r.helm>8, `expected excessive load, got ${r.heel} heel / ${r.helm} helm`);
  assert.match(api.nextMoveAlert(r).join(' '),/Ease the mainsheet|Lower the traveler|reef/i);
});

test('move selection ranks actual one-control gains rather than target distance',()=>{
  const r=reset({tws:12,twaC:90,sheet:.9,trav:1,vang:.1,outhaul:.5,jsheet:.9,jcar:1});
  const move=api.chooseTrimMove(r,{...api.state,trav:-1});
  assert.ok(move.changes && move.gain>.015);
  if(Object.keys(move.changes).length===1){
    const max=Math.max(...Object.values(move.effects));
    assert.ok(Math.abs(move.gain-max)<1e-9, `${move.gain} was not the best actual trial ${max}`);
  }
  assert.ok(api.trimObjective(move.after)>api.trimObjective(r));
});

test('rendered recommendation reports the measured move and its resulting benefit',()=>{
  const r=reset({tws:12,twaC:90,sheet:.9,trav:1,vang:.1,jsheet:.9,jcar:1});
  const opt=api.solvePerfectTrim(true), move=api.chooseTrimMove(r,opt);
  assert.ok(move.changes);
  api.setGuidance(opt,move);
  api.renderNext(null,r);
  const text=shown();
  for(const key of Object.keys(move.changes)) assert.match(text.move,new RegExp(key==='trav'?'traveler':key==='jcar'?'jib car':key.includes('jsheet')?'jib sheet':key,'i'));
  assert.match(text.sub,/Estimated|Heel|Helm load|better shape/i);
  assert.doesNotMatch(text.move,/perfect|best trim/i);
});

test('no useful move is described without claiming a unique perfect trim',()=>{
  const r=reset();
  api.setGuidance({...api.state},{changes:null,after:r,gain:0,effects:{}});
  api.renderNext(null,r);
  assert.match(shown().move,/No useful small adjustment/);
  assert.doesNotMatch(shown().move+shown().sub,/perfect|best trim/i);
});

module.exports={makeHarness};
