const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test, beforeEach} = require('node:test');

const src = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const alertStart = src.indexOf('function nextMoveAlert');
const alertEnd = src.indexOf('\n\n/* ---------------- render:', alertStart);
const reasonStart = src.indexOf('function nextMoveReason');
const reasonEnd = src.indexOf('\n}\n// Use the largest remaining', reasonStart) + 2;
const renderStart = src.indexOf('function renderNext');
const renderEnd = src.indexOf('\n}\n\n/* ---------------- main update', renderStart) + 2;
assert.ok(alertStart >= 0 && alertEnd > alertStart && reasonEnd > reasonStart && renderEnd > renderStart);

const ctx = vm.createContext({});
vm.runInContext(`
  const state={twaC:60, posIdx:0, mainhal:1, jhal:1, jsheetw:0};
  const POS=[{twa:60}];
  const TRIM_KEYS=['sheet','trav','vang','outhaul','cunn','backstay','mainhal','jsheet','jsheetw','jcar','jhal'];
  let OPT=null, PREV_STATE=null, lastR=null;
  const els={};
  function $(id){ return els[id] ||= {className:'',textContent:'',innerHTML:''}; }
  function fmt1(v){return Number(v).toFixed(1);}
  function sideWord(){return 'windward';}
  function lineName(k){return k==='sheet'?'Mainsheet':k==='jhal'?'Jib halyard':k;}
  ${src.slice(alertStart,alertEnd)}
  ${src.slice(reasonStart,reasonEnd)}
  ${src.slice(renderStart,renderEnd)}
  globalThis.api={state,els,setOpt(v){OPT=v;},setPrev(v){PREV_STATE=v;},setLast(v){lastR=v;},nextMoveAlert,renderNext};
`, ctx);
const {state, els, setOpt, setPrev, setLast, nextMoveAlert, renderNext} = ctx.api;
const result = (overrides={}) => ({heel:10, jib:{wow:false}, main:{depth:.12,draft:.45,twist:18}, ...overrides});
function text(){ return {move:els.fxMove.textContent, sub:els.fxSub.textContent, cls:els.fxNext.className}; }
const baseline = {twaC:60, posIdx:0, mainhal:1, jhal:1, jsheetw:0,
  sheet:0, trav:0, vang:0, outhaul:0, cunn:0, backstay:0, jsheet:0, jcar:0};
beforeEach(()=>{
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state, baseline);
  setOpt(null); setPrev(null); setLast(null);
  Object.values(els).forEach(el=>{el.className=''; el.textContent=''; el.innerHTML='';});
});

test('urgent prerequisites take priority: course, hoist, backed jib',()=>{
  const r=result();
  state.twaC=10; assert.equal(nextMoveAlert(r)[0], 'Bear away to fill the sails.');
  assert.equal(nextMoveAlert(r)[1], "You're in irons: move the wind to at least the close-hauled mark before trimming.");
  state.twaC=60; state.mainhal=.2; assert.equal(nextMoveAlert(r)[0], 'Hoist the main halyard.');
  state.mainhal=1; state.jhal=.2; assert.equal(nextMoveAlert(r)[0], 'Hoist the jib halyard.');
  state.jhal=1; state.jsheetw=.5; assert.equal(nextMoveAlert(r)[0], 'Ease the windward jib sheet.');
  state.twaC=10; setOpt({sheet:0});
  renderNext(null,result({heel:30}));
  assert.equal(text().move, 'Bear away to fill the sails.');
  Object.assign(state,baseline);
  renderNext(null,result({heel:30}));
  assert.equal(text().move, 'Lower the traveler to reduce heel.');
});

test('backed jib alert is suppressed when the passed result says wing-on-wing',()=>{
  state.twaC=60; state.mainhal=1; state.jhal=1; state.jsheetw=.5;
  assert.equal(nextMoveAlert(result({jib:{wow:true}})), null);
});

test('renderNext shows initial guidance and solved state',()=>{
  renderNext(null,result());
  assert.match(text().move,/Finding your next move/);
  setOpt({...baseline});
  renderNext(null,result());
  assert.equal(text().move, "You're at the solver's best trim.");
  assert.match(text().cls,/good/);
});

test('recommendation chooses the next remaining line when the last move is on target',()=>{
  Object.assign(state,{sheet:0,trav:0,vang:0,outhaul:0,cunn:0,backstay:0,mainhal:1,jsheet:0,jsheetw:0,jcar:0,jhal:1});
  setOpt({sheet:0,trav:1,vang:0,outhaul:0,cunn:0,backstay:0,mainhal:1,jsheet:0,jsheetw:0,jcar:0,jhal:1});
  setPrev({sheet:0}); renderNext('sheet',result());
  assert.match(text().move,/Traveler up/);
});

test('reason uses the current result passed to renderNext',()=>{
  Object.assign(state,{sheet:0,trav:0,vang:0,outhaul:0,cunn:0,backstay:0,mainhal:1,jsheet:0,jsheetw:0,jcar:0,jhal:1});
  setOpt({sheet:0,trav:0,vang:0,outhaul:1,cunn:0,backstay:0,mainhal:1,jsheet:0,jsheetw:0,jcar:0,jhal:1});
  renderNext(null,{...result(),main:{depth:.27,draft:.45,twist:18}});
  assert.match(text().sub,/main's belly is 27%/);
});
