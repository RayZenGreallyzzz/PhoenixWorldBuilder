/* Floor/wall placement: 4 arrow directions, centring and persisted UV
 * coordinates. Runs without Android/WebGL as a deterministic Node regression.
 */
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const THREE=global.THREE;
const Placement=require(path.join(base,'js/texture-placement.js'));
const Geometry=require(path.join(base,'js/clean-geometry.js'));
const Workshop=require(path.join(base,'js/surface-workshop.js'));
const Materials=require(path.join(base,'js/surface-materials.js'));
const near=(v,expected)=>assert(Math.abs(v-expected)<.00001,
 String(v)+' must equal '+String(expected));
const current={offsetU:.2,offsetV:-.15};
assert.deepEqual(Placement.move(current,'left',.05),{offsetU:.25,offsetV:-.15});
assert.deepEqual(Placement.move(current,'right',.05),{offsetU:.15,offsetV:-.15});
assert.deepEqual(Placement.move(current,'up',.05),{offsetU:.2,offsetV:-.2});
assert.deepEqual(Placement.move(current,'down',.05),{offsetU:.2,offsetV:-.1});
assert.deepEqual(Placement.move(current,'reset',.25),{offsetU:0,offsetV:0});
assert.equal(current.offsetU,.2,'Offsets must be immutable');
assert.deepEqual(Placement.move({offsetU:0,offsetV:0},'right',.05),
 {offsetU:-.05,offsetV:0},'Negative U makes artwork move right');
let state={offsetU:0,offsetV:0};
for(let i=0;i<10;i++)state=Placement.move(state,'left',.01);
assert.equal(state.offsetU,.1,'Repeated 1% nudges must not float-drift');
for(let i=0;i<10;i++)state=Placement.move(state,'right',.01);
assert.equal(state.offsetU,0,'Arrows must be reversible');
for(const kind of ['wall','floor']){
 const root=Geometry.create(kind),mesh=root.children.find(m=>m.isMesh);
 assert(mesh,'Need geometric '+kind);
 const source=mesh.geometry,original=Array.from(source.getAttribute('uv').array);
 const desc={mapping:'repeat',style:'brick',repeat:1,tileMeters:1,
  offsetU:0,offsetV:0};
 const first=Workshop.project(root,mesh,source,desc,kind);
 assert(first,'Need '+kind+' initial UV');
 const baseline=Array.from(first.getAttribute('uv').array);
 first.dispose();
 const changed=Placement.move(Placement.move(desc,'right',.1),'up',.05);
 const shifted=Workshop.project(root,mesh,source,changed,kind);
 const actual=shifted.getAttribute('uv').array;
 assert.equal(actual.length,baseline.length);
 for(let i=0;i<actual.length;i+=2){
  near(actual[i]-baseline[i],-.1);
  near(actual[i+1]-baseline[i+1],-.05);
 }
 shifted.dispose();
 // The artwork placement must work equally on rotated/translated modules.
 root.position.set(7.25,1,-2.75);root.rotation.y=Math.PI*.37;
 root.updateMatrixWorld(true,true);
 const turned=Workshop.project(root,mesh,source,changed,kind);
 const uv=turned.getAttribute('uv').array;
 for(let i=0;i<uv.length;i++)near(uv[i],actual[i]);
 turned.dispose();
 assert.deepEqual(Array.from(source.getAttribute('uv').array),original,
  'Imported / template '+kind+' source geometry must not change');
 const normalized=Materials.normalize({...changed,color:'#ffffff'});
 near(normalized.offsetU,-.1);near(normalized.offsetV,-.05);
 const saved=JSON.parse(JSON.stringify(normalized));
 near(saved.offsetU,-.1);near(saved.offsetV,-.05);
}
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
for(const id of ['textureShiftUp','textureShiftDown','textureShiftLeft',
 'textureShiftRight','textureShiftReset','textureAlignStep','texturePlacementTarget'])
 assert(html.includes('id="'+id+'"'),'Missing texture positioning UI '+id);
assert(html.indexOf('js/texture-placement.js')<html.indexOf('js/clean-app.js'));
assert(app.includes('shiftTexture(direction){'),'The UI must move the selected texture');
assert(app.includes('this.applySurfaceTo(obj);'),'Texture move needs immediate render');
assert(app.includes('obj.surface=SurfaceMaterials.normalize(TexturePlacement.move(style,direction,step))'),
 'Offsets must be written to the selected object for project/GLB export');
assert(app.includes("['floor','wall'].includes(obj.category)"),
 'Texture placement should work on floor and wall, not move unrelated objects');
console.log('Floor/wall texture arrows, UV sign, step, reset and persistence OK');
