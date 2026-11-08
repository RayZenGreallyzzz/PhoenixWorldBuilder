/* Offline outliner regression: scene labels, floor filtering, hide/lock,
 * persistence, game manifest and GLB extras. No Android or WebGL required.
 */
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
const S=require(path.join(base,'js/scene-manager.js'));
const Workflow=require(path.join(base,'js/building-workflow.js'));
assert.equal(S.cleanName('  <Кухня>   '),'Кухня');
assert.equal(S.cleanName(' \x00Стена\x1f '),'Стена');
assert.equal(S.cleanName('x'.repeat(100)).length,64);
const make=(id,storey,label,kind='wall')=>({
 id,storey,kind,category:kind==='floor'?'floor':'wall',label,
 hidden:false,locked:false,root:{visible:true}
});
const entries=[
 make(3,1,'Спальня · штукатурка'),
 make(1,0,'Наружная стена'),
 make(4,1,'Пол спальни','floor'),
 make(2,0,'Кухня камень')
];
assert.deepEqual(S.results(entries).rows.map(e=>e.id),[1,2,3,4],
 'List should be grouped by floor then object ID');
assert.deepEqual(S.results(entries,{storey:'current',current:1}).rows.map(e=>e.id),
 [3,4],'Current floor filter');
assert.deepEqual(S.results(entries,{query:'кухня'}).rows.map(e=>e.id),[2]);
assert.deepEqual(S.results(entries,{query:'4'}).rows.map(e=>e.id),[4]);
const short=S.results(entries,{limit:2});
assert.equal(short.total,4);assert(short.truncated);
assert.deepEqual(short.rows.map(e=>e.id),[1,2]);
assert.equal(S.displayName(make(99,0,''),'Каменная стена'),'Каменная стена');
S.apply(entries[1],{label:'<Фасад>',hidden:true,locked:true});
assert.equal(entries[1].label,'Фасад');
assert(entries[1].hidden&&entries[1].locked&&!entries[1].root.visible);
assert(!S.editingAllowed(entries[1]));
assert(S.editingAllowed(entries[2]));
S.apply(entries[1],{hidden:false});
assert(entries[1].root.visible&&entries[1].locked,
 'Showing an object should preserve its lock');
S.apply(entries[1],{locked:false});assert(S.editingAllowed(entries[1]));
S.apply(entries[0],{hidden:true});
const save=entries.map(e=>({id:e.id,storey:e.storey,kind:e.kind,
 category:e.category,label:e.label,hidden:e.hidden,locked:e.locked,
 position:[0,0,0],rotation:{x:0,y:0,z:0}}));
const restored=save.map(e=>S.apply({...e,root:{visible:true}},e));
assert.equal(restored[0].root.visible,false,'Saved hidden state must restore');
assert.equal(restored[1].label,'Фасад','Saved label must restore');
const manifest=Workflow.gameManifest({objects:save});
assert.equal(manifest.objects.length,3,'Game JSON skips only invisible objects');
assert(!manifest.objects.some(o=>o.id===3));
assert(manifest.objects.some(o=>o.id===1&&o.label==='Фасад'));
assert.deepEqual(manifest.floors,[0,1]);
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8'),
 html=fs.readFileSync(path.join(base,'index.html'),'utf8'),
 css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
for(const id of ['sceneManagerPanel','sceneSearch','sceneFloorFilter',
 'sceneManagerStatus','sceneRows','sceneName','btnSceneRename'])
 assert(html.includes('id="'+id+'"'),'Outliner needs UI '+id);
assert(html.indexOf('js/scene-manager.js')<html.indexOf('js/clean-app.js'));
for(const token of ['renderSceneManager(){','sceneFlag(id,property,value){',
 'selectSceneObject(id){','renameSceneObject(){','syncSceneLockedUI(){',
 'SceneManager.cleanName(config.label)','locked:config.locked===true',
 'hidden:config.hidden===true','label:SceneManager.cleanName(obj.label)',
 'this.entries.filter(obj=>!obj.hidden).map(obj=>','if(!this.canEditObject())return;',
 "SceneManager.editingAllowed(this.selected)?this.selected:null",
 'this.gizmo.start(e)','SceneManager.apply(obj,{[property]:value})'])
 assert(app.includes(token),'Outliner missing expected integration: '+token);
assert(css.includes('sceneManagerToggle'),'Mobile outliner needs touch targets');
// Node-mode GLB exporter must carry the same stable ID and friendly name
// as the saved scene and GameScene JSON.
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
const ctx=vm.createContext({THREE:T,Blob,TextEncoder,TextDecoder,
 Uint8Array,Uint16Array,Uint32Array,Float32Array,ArrayBuffer,DataView,Math,console});
vm.runInContext(fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8'),ctx);
const Exp=vm.runInContext('SceneExporter',ctx);
const model=new T.Group();
model.add(new T.Mesh(new T.BoxGeometry(2,2,.2),new T.MeshStandardMaterial()));
(async()=>{
 const blob=await Exp.build({objects:[{mesh:model,data:{id:8,kind:'wall',
  category:'wall',storey:2,label:'Главный фасад',suggestedCollider:'static-mesh'}}]},
  {houseOnly:true,keepWorldCoordinates:true});
 const bytes=new Uint8Array(await blob.arrayBuffer()),d=new DataView(bytes.buffer);
 assert.equal(d.getUint32(0,true),0x46546c67);
 const length=d.getUint32(12,true),json=JSON.parse(
  new TextDecoder().decode(bytes.subarray(20,20+length)));
 assert.equal(json.nodes[0].extras.phoenix.id,8);
 assert.equal(json.nodes[0].extras.phoenix.label,'Главный фасад');
 console.log('Scene manager: search, floors, labels, hide/lock, persistence, game JSON and GLB extras OK');
})().catch(e=>{console.error(e);process.exitCode=1});
