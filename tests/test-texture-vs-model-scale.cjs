const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(root,'three.min.js'));
global.SurfacePaint=require(path.join(root,'surface-paint.js'));
vm.runInThisContext(fs.readFileSync(path.join(root,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,selected:null,ghost:null,placement:null,placementCategory:null,placementRotation:0,
 placementScale:1,smartSnap:false,mode:'build',floorLevel:0,storeyHeight:2.6,
 joinMode:'free',snap:2,currentPaint:'#ffffff',undo:[],placementSurfacePaint:{}});
w.heightAt=()=>0;w.onSelected=()=>{};w.onSnapChanged=()=>{};w.onChanged=()=>{};
w.updateGameGhost=()=>{};w.highlight={setFromObject(){},visible:false};
w.categoryForKind=k=>k==='floor'?'foundation':k;
const terrainGeo=new THREE.BufferGeometry();
terrainGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0],3));
terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1,1,1,1],3));
w.terrain={geometry:terrainGeo};
const tex=new THREE.DataTexture(new Uint8Array(4*4*4).fill(255),4,4,THREE.RGBAFormat);
w.textures.set('tex:ornament',tex);
const item=w.instantiate('floor',{id:1,pos:[3,0,6],rot:0,scale:1,
 category:'foundation',storey:0});
w.selected=item;
const base=new THREE.Box3().setFromObject(item.mesh).getSize(new THREE.Vector3());
const originalScale=item.mesh.scale.clone(),originalPos=item.mesh.position.clone();
const originalCoords=Array.from(item.mesh.children[0].geometry.attributes.position.array);
for(const mapping of ['tile','module','repeat','joined']){
 w.updateSurfacePaint(item,'top','mode',mapping);
 w.updateSurfacePaint(item,'top','texture','tex:ornament');
 for(const imageScale of [.25,1,1.5,4]){
  w.updateSurfacePaint(item,'top','imageScale',imageScale);
  assert.deepEqual(item.mesh.scale.toArray(),originalScale.toArray(),
   mapping+' '+imageScale+' image zoom MUST NOT change mesh scaling');
  assert.deepEqual(item.mesh.position.toArray(),originalPos.toArray(),
   'Texture controls MUST NOT reposition the object');
  const size=new THREE.Box3().setFromObject(item.mesh).getSize(new THREE.Vector3());
  assert(Math.abs(size.x-base.x)<1e-8&&Math.abs(size.y-base.y)<1e-8&&Math.abs(size.z-base.z)<1e-8,
   mapping+' '+imageScale+' MUST NOT alter slab width, length or thickness');
  assert.deepEqual(Array.from(item.mesh.children[0].geometry.attributes.position.array),originalCoords,
   'Image-only scaling MUST NOT rewrite vertices');
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
   fragmentShader:'#include <common>\n#include <map_fragment>\n#include <color_fragment>'};
  item.mesh.children[0].material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.pwbImageScaletop.value,imageScale);
  assert(shader.fragmentShader.includes('uv=vec2(.5)+(uv-vec2(.5))/max(.25,imageScale);'));
 }
}
const snapshot=w.snapshot();
assert.equal(snapshot.objects[0].surfacePaint.top.imageScale,4,
 'Project saves image zoom independently from object scale');
assert.equal(snapshot.objects[0].scale,1);
const html=fs.readFileSync(path.join(root,'../index.html'),'utf8');
for(const id of ['surfaceImageScale','gameSurfaceImageScale','btnModelScaleReset'])assert(html.includes('id="'+id+'"'));
assert(html.includes('Изменить размер 3D-модели (включая толщину)'), 'Warning must clearly label real mesh scaling');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert(app.includes("assignSurfacePaint('imageScale',surfaceImageScale)"),'Image slider updates finish, not geometry');
assert(app.includes("w.updateSurfacePaint(entry,surfaceScope,property,value)"),'Finish updates are per selected material');
assert(app.includes("entry.mesh.scale.set(1,entry.data.thicknessY||1,1)"),'Quick reset returns model to original xz scaling');
console.log('Stretch zoom preserves object width, length, thickness and vertex positions. UI warns about real geometry scaling.');
