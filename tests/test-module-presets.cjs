const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const folder=path.join(__dirname,'../app/src/main/assets');
const app=fs.readFileSync(path.join(folder,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
for(const id of ['btnSavePreset','btnGameSavePreset'])assert(html.includes('id="'+id+'"'),'Missing save module button '+id);
assert(html.includes('data-filter="my"'),'Missing My Modules category');
assert(app.includes("PRESET_KEY='my-module-presets-v1'"),'Unique persistent catalogue key');
assert(app.includes("await dbOp('catalog',PRESET_KEY"),'Immediate IndexedDB commit of user presets');
assert(app.includes("storedPresets=await dbOp('catalog',PRESET_KEY)"),'Restore presets on app start');
assert(app.includes("if(kind==='preset')await chooseModulePreset(id)"),'Catalog opens user preset');
assert(!app.includes('setTimeout(()=>saveLocal('),'Do not reenable scene autosaving');
const start=app.indexOf("const PRESET_KEY='my-module-presets-v1';");
const end=app.indexOf('const GALLERY_SIZE=20;',start);
assert(start>=0&&end>start);
let record=[],feedback=[],viewRender=0;
const entry={kind:'wall',data:{category:'wall',scale:1.2,dimensionScale:{x:1.5,y:1,z:.55},surfacePaint:{all:{color:'#ffffff'},top:{texture:'tex:wood.png'},bottom:{texture:'tex:marble.png'}}}};
const state={
 localStore:{},modulePresets:new Map(),surfaceTarget:()=>entry,
 w:{placement:'wall',placementCategory:'wall',placementScale:1,placementSurfacePaint:{},currentPaint:'#cccccc',
  categoryForKind:()=> 'wall',setPlacement(kind,cat){this.placement=kind;this.placementCategory=cat;this.ghost=null},
  select(){},ghost:null,mode:'build'},
 BUILTINS:[['wall','Стена','wall']],
 savedMeta:new Map(),
 prompt:()=>'Белая стена с деревом сверху',
 toast:s=>feedback.push(s),
 fmtName:s=>s,
 dbOp:async (store,key,val)=>{
  assert.equal(store,'catalog');
  assert.equal(key,'my-module-presets-v1');
  if(val===undefined)return record;
  record=structuredClone(val);
  return true;
 },
 SurfacePaint:{faces:['all','top','bottom'],applyToRoot(){}},
 loadTexture:async()=>({}),
 cacheFromDB:async()=>({}),
 refreshConstructionUI(){},updateSurfaceUI(){},
 currentFilter:'all',catalogMode:'models',catalogPage:0,
 $all:()=>[{classList:{toggle(){}}}],
 $:()=>({classList:{remove(){}}}),
 renderLibrary:()=>{viewRender++},
 document:{body:{classList:{remove(){}}}},
 confirm:()=>true,
 console
};
const context=vm.createContext(state);
vm.runInContext(app.slice(start,end)+'\nthis.funcs={saveModulePreset,chooseModulePreset,deleteModulePreset}',context);
(async()=>{
 await context.funcs.saveModulePreset();
 assert.equal(record.length,1,'Preset persisted independently after button click');
 assert.equal(record[0].sourceKind,'wall');
 assert.equal(record[0].scale,1.2);
 assert.equal(record[0].dimensionScale.z,.55,'Fitted wall thickness saved in My Modules');
 assert.equal(record[0].surfacePaint.top.texture,'tex:wood.png');
 assert.equal(record[0].surfacePaint.bottom.texture,'tex:marble.png');
 const id=record[0].id;
 state.modulePresets=new Map(record.map(p=>[p.id,p]));
 state.surfaceTarget=()=>null;
 await context.funcs.chooseModulePreset(id);
 assert.equal(state.w.placement,'wall');
 assert.equal(state.w.placementScale,1.2);
 assert.equal(state.w.placementAxes.x,1.5);
 assert.equal(state.w.placementAxes.z,.55,'Fitted dimensions reapplied when picking saved module');
 assert.equal(state.w.placementSurfacePaint.bottom.texture,'tex:marble.png');
 assert.equal(state.w.placementSurfacePaint.top.texture,'tex:wood.png');
 await context.funcs.deleteModulePreset(id);
 assert.equal(record.length,0,'Delete only removes catalogue preset');
 assert(viewRender>=2);
 console.log('My Modules independently saves, restores and reapplies top/bottom PNG without scene autosave');
})().catch(e=>{console.error(e);process.exitCode=1});
