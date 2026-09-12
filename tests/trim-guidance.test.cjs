const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function makeHarness(){
  const src=fs.readFileSync(process.env.TRIM_SOURCE||'src-app.html','utf8');
  const physics=src.slice(src.indexOf('"use strict";'),src.indexOf('/* ---------------- coach ---------------- */'));
  const alertStart=src.indexOf('function nextMoveAlert');
  const alert=src.slice(alertStart,src.indexOf('\n\n/* ---------------- render:',alertStart));
  const reasonStart=src.indexOf('function nextMoveReason');
  const reason=src.slice(reasonStart,src.indexOf('\n// A recommendation belongs',reasonStart));
  const renderStart=src.indexOf('function renderNext');
  const render=src.slice(renderStart,src.indexOf('\n\n/* ---------------- main update',renderStart));
  const start=src.indexOf('function computeWith(params)');
  const optimizer=src.slice(start,src.indexOf('$("perfect").addEventListener',start));
  assert.ok(physics&&optimizer&&alert&&reason&&render,'physics, optimizer and guidance source are extractable');
  const els={};
  const ctx=vm.createContext({console,els,document:{getElementById(id){return els[id]||=( {className:'',textContent:'',innerHTML:''});}}});
  vm.runInContext(`${physics}\nlet OPT=null,OPT_R=null,OPT_MOVE=null,lastR=null,PREV_STATE=null;\nconst lineName=k=>({sheet:'Mainsheet',trav:'Traveler',vang:'Boom vang',outhaul:'Outhaul',cunn:'Cunningham',backstay:'Backstay',mainhal:'Main halyard',jsheet:'Working jib sheet',jsheetw:'Windward jib sheet',jcar:'Jib car',jhal:'Jib halyard',reef1:'Reef 1',reef2:'Reef 2'}[k]||k);\nconst sideWord=()=> 'windward';\n${optimizer}\n${alert}\n${reason}\n${render}\nglobalThis.api={state,POS,PANEL,compute,computeWith,solvePerfectTrim,chooseTrimMove,trimObjective,trimProgress,trimContext,trimDepthBand,TRIM_KEYS,nextMoveAlert,nextMoveReason,renderNext,els,setGuidance(opt,move,r){OPT=opt;OPT_MOVE=move;lastR=r;}};`,ctx);
  return ctx.api;
}
const api=makeHarness(),defaults={...api.state};
function reset(overrides={}){Object.keys(api.state).forEach(k=>delete api.state[k]);Object.assign(api.state,defaults,overrides);return api.compute({flow:false});}
function finite(v){if(typeof v==='number')assert.ok(Number.isFinite(v));else if(v&&typeof v==='object')Object.values(v).forEach(finite);}

test('all teaching winds, headings and both tacks produce finite classified guidance inputs',()=>{
  const expected=new Map([[0,'in irons'],[25,'in irons'],[45,'close-hauled'],[60,'close reach'],[90,'beam reach'],[125,'broad reach'],[165,'run'],[178,'run']]);
  for(const tws of [4,8,12,18,24]) for(const twaC of expected.keys()) for(const twaSide of [-1,1]){
    const r=reset({tws,twaC,twaSide,gust:false});
    finite(r);
    assert.equal(api.trimContext(r).point,expected.get(twaC),`${tws} kt at ${twaC} on tack ${twaSide}`);
  }
  for(const twaC of expected.keys()) for(const twaSide of [-1,1]){
    const r=reset({tws:24,gust:true,twaC,twaSide});
    assert.equal(r.tws,30);finite(r);
  }
});

test('quick optimization holds heading while full upwind optimization may select VMG angle',()=>{
  reset({tws:12,twaC:45,posIdx:0});
  const quick=api.solvePerfectTrim(true),full=api.solvePerfectTrim(false);
  assert.equal(quick.__twa,null);
  assert.ok([40,43,45,46,49,52].includes(full.__twa),`unexpected VMG heading ${full.__twa}`);
  const quickResult=api.computeWith(quick),fullResult=api.computeWith(full);
  assert.equal(quickResult.twa,45);
  assert.equal(fullResult.twa,full.__twa);
  assert.ok(api.trimProgress(fullResult,true)>=api.trimProgress(quickResult,true)-.03);
});

test('optimizer preserves manual reef choice and never depowers by lowering halyards',()=>{
  for(const reef of [{reef1:1,reef2:0,level:1},{reef1:1,reef2:1,level:2}]){
    reset({tws:24,twaC:45,...reef});
    const before={reef1:api.state.reef1,reef2:api.state.reef2},opt=api.solvePerfectTrim(true);
    assert.deepEqual({reef1:api.state.reef1,reef2:api.state.reef2},before);
    assert.equal(api.computeWith(opt).main.reef,reef.level);
    assert.ok(opt.mainhal>=.35&&opt.jhal>=.35,`halyards ${opt.mainhal}/${opt.jhal}`);
    assert.ok(!Object.hasOwn(opt,'reef1')&&!Object.hasOwn(opt,'reef2'));
  }
});

test('computeWith restores all simulator and panel state',()=>{
  reset({tws:12,twaC:60,twaSide:-1,reef1:1});
  api.state.transient='keep';
  const stateBefore=JSON.stringify(api.state),panelBefore={ok:api.PANEL.ok,fM:api.PANEL.fM,fJ:api.PANEL.fJ,vor:api.PANEL.vor,g:api.PANEL.g,H:api.PANEL.H};
  api.computeWith({tws:24,twaOv:165,sheet:0,reef2:1,__ignored:3});
  assert.equal(JSON.stringify(api.state),stateBefore);
  assert.equal(api.PANEL.ok,panelBefore.ok);assert.equal(api.PANEL.fM,panelBefore.fM);assert.equal(api.PANEL.fJ,panelBefore.fJ);
  assert.strictEqual(api.PANEL.vor,panelBefore.vor);assert.strictEqual(api.PANEL.g,panelBefore.g);assert.strictEqual(api.PANEL.H,panelBefore.H);
});

test('optimized shape uses bounded upwind depth and stays fuller downwind than heavy-air upwind',()=>{
  reset({tws:12,twaC:45,posIdx:0,reef1:0,reef2:0});
  const moderate=api.computeWith(api.solvePerfectTrim(true)),band=api.trimDepthBand(moderate);
  assert.ok(moderate.main.depth>=band.lo-.006&&moderate.main.depth<=band.hi+.006,`moderate depth ${moderate.main.depth}, band ${band.lo}-${band.hi}`);
  assert.ok(moderate.main.depth>.07&&moderate.main.depth<.17,'upwind depth should be shaped, not an extreme');
  reset({tws:24,twaC:45,posIdx:0});
  const heavy=api.computeWith(api.solvePerfectTrim(true));
  reset({tws:12,twaC:165,posIdx:4});
  const run=api.computeWith(api.solvePerfectTrim(true));
  assert.ok(run.main.depth>heavy.main.depth+.01,`run ${run.main.depth} should be fuller than heavy upwind ${heavy.main.depth}`);
});

test('chosen guidance move produces a real objective improvement from poor trim',()=>{
  for(const setup of [
    {tws:12,twaC:45,posIdx:0,sheet:.2,trav:-1,vang:0,outhaul:1,jsheet:.2,jcar:1},
    {tws:12,twaC:90,posIdx:2,sheet:.9,trav:1,vang:0,jsheet:.9,jcar:1},
    {tws:12,twaC:165,posIdx:4,sheet:.8,vang:0,jsheet:.8,jsheetw:0}
  ]){
    const r=reset(setup),opt=api.solvePerfectTrim(true),move=api.chooseTrimMove(r,opt);
    assert.ok(move.changes,`no move for ${setup.twaC}°`);
    assert.ok(move.gain>.015,`insignificant gain ${move.gain} for ${setup.twaC}°`);
    assert.ok(api.trimObjective(move.after)>api.trimObjective(r));
  }
});

test('solve, choose and render remain feasible across every sailing point and wind band',()=>{
  for(const tws of [4,8,12,18,24,30]) for(const twaC of [45,60,90,125,165,178]){
    const posIdx=twaC===45?0:twaC===60?1:twaC===90?2:twaC===125?3:4;
    const r=reset({tws,twaC,posIdx,gust:false,reef1:0,reef2:0}),base=api.trimObjective(r);
    const opt=api.solvePerfectTrim(true),solved=api.computeWith(opt),move=api.chooseTrimMove(r,opt);
    assert.equal(opt.__twa,null,`quick solve changed ${twaC}° heading at ${tws} kt`);
    assert.equal(solved.twa,twaC);
    assert.ok(opt.mainhal>=.35&&opt.jhal>=.35,`partial hoist at ${tws} kt / ${twaC}°`);
    assert.ok(opt.jsheetw<=.25||solved.jib.wow,`windward sheet backs jib at ${tws} kt / ${twaC}°`);
    assert.ok(api.trimObjective(solved)>=base-1e-5,`optimized objective regressed at ${tws} kt / ${twaC}°`);
    if(move.changes){
      assert.ok(move.gain>.015&&api.trimObjective(move.after)>base,`chosen move has no actual gain at ${tws} kt / ${twaC}°`);
    }else assert.equal(move.gain,0);
    api.setGuidance(opt,move,r);api.renderNext(null,r);
    const copy=api.els.fxMove.textContent+' '+api.els.fxSub.textContent;
    assert.ok(copy.trim()&&!/undefined|NaN/.test(copy),`bad rendered guidance at ${tws} kt / ${twaC}°: ${copy}`);
  }
});

test('representative optimizer results are symmetric across tacks',()=>{
  for(const setup of [{tws:8,twaC:45,posIdx:0},{tws:18,twaC:90,posIdx:2},{tws:24,twaC:165,posIdx:4}]){
    reset({...setup,twaSide:1});const star=api.solvePerfectTrim(true),rs=api.computeWith(star);
    reset({...setup,twaSide:-1});const port=api.solvePerfectTrim(true),rp=api.computeWith(port);
    for(const k of api.TRIM_KEYS) assert.ok(Math.abs(star[k]-port[k])<1e-9,`${k} differs by tack at ${setup.twaC}°`);
    assert.ok(Math.abs(rs.speed-rp.speed)<1e-9&&Math.abs(rs.heel-rp.heel)<1e-9);
  }
});

test('zero wind and in-irons solves return the current controls without mutation',()=>{
  for(const setup of [{tws:0,twaC:45,posIdx:0},{tws:12,twaC:0,posIdx:0},{tws:12,twaC:25,posIdx:0}]){
    reset({...setup,sheet:.31,trav:-.42,outhaul:.67,reef1:1});
    const before=JSON.stringify(api.state),opt=api.solvePerfectTrim(true);
    assert.equal(JSON.stringify(api.state),before);
    for(const k of api.TRIM_KEYS) assert.equal(opt[k],api.state[k],`${k} changed for ${setup.tws} kt / ${setup.twaC}°`);
    assert.equal(opt.__twa,null);
  }
});

test('actual heading overrides stale point selector in optimization and copy',()=>{
  const r=reset({tws:12,posIdx:0,twaC:125});
  assert.equal(api.trimContext(r).point,'broad reach');
  const opt=api.solvePerfectTrim(true),move=api.chooseTrimMove(r,opt);
  assert.equal(api.computeWith(opt).twa,125);
  api.setGuidance(opt,move,r);api.renderNext(null,r);
  assert.doesNotMatch(api.els.fxMove.textContent+api.els.fxSub.textContent,/close-hauled/i);
});

test('every line explanation is usable in both directions across sailing contexts',()=>{
  const keys=[...api.TRIM_KEYS,'reef1','reef2'];
  for(const setup of [{tws:4,twaC:45,posIdx:0},{tws:12,twaC:90,posIdx:2},{tws:24,twaC:165,posIdx:4}]){
    const r=reset(setup);
    for(const key of keys) for(const direction of [-1,1]){
      const current=api.state[key],value=Math.max(0,Math.min(1,current+direction*.12));
      const after=api.computeWith({[key]:value});
      const copy=api.nextMoveReason(key,direction,r,after);
      assert.equal(typeof copy,'string');assert.ok(copy.trim()&&!/undefined|NaN/.test(copy),`${key} ${direction} at ${setup.twaC}°: ${copy}`);
    }
  }
  const r=reset({tws:12,twaC:90,posIdx:2});
  assert.match(api.nextMoveReason('jcar',1,r,api.computeWith({jcar:.8})),/telltale|leech/i);
  assert.match(api.nextMoveReason('jsheetw',1,r,api.computeWith({jsheetw:.4})),/windward|back/i);
  assert.match(api.nextMoveReason('jsheet',-1,r,api.computeWith({jsheet:.3})),/telltale/i);
});

test('wing-on-wing can be recommended as a paired move across its local plateau',()=>{
  const r=reset({tws:18,twaC:165,posIdx:4,sheet:.15,trav:0,vang:.8,outhaul:.4,cunn:0,backstay:0,mainhal:.9,jsheet:.38,jsheetw:0,jcar:.25,jhal:.6});
  const opt=api.solvePerfectTrim(true),move=api.chooseTrimMove(r,opt);
  assert.equal(api.computeWith(opt).jib.wow,true);
  assert.deepEqual(Object.keys(move.changes).sort(),['jsheet','jsheetw']);
  assert.equal(move.after.jib.wow,true);assert.ok(move.gain>.025);
  api.setGuidance(opt,move,r);api.renderNext(null,r);
  assert.match(api.els.fxSub.textContent,/Together.*other side of the main/i);
});

test('unrelieved heavy load escalates to reef advice',()=>{
  const r=reset({tws:30,twaC:45,posIdx:0,sheet:0,trav:-1,vang:0,outhaul:1,backstay:1,cunn:1,mainhal:1,jhal:1,reef1:0,reef2:0});
  if(r.heel>26||r.helm>8){
    const copy=api.nextMoveAlert(r).join(' ');
    assert.match(copy,/reef|reduce sail/i);
  }else{
    const loaded=reset({tws:30,twaC:45,posIdx:0,sheet:1,trav:1,vang:1,outhaul:0,backstay:0,cunn:0});
    assert.match(api.nextMoveAlert(loaded).join(' '),/reduce load|reef/i);
  }
});
