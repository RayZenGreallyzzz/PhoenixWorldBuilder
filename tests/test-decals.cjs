const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const assets=path.join(__dirname,'../app/src/main/assets'),dir=path.join(assets,'js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.SurfacePaint=require(path.join(dir,'surface-paint.js'));
global.DecalLayer=require(path.join(dir,'decal-layer.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
vm.runInThisContext(fs.readFileSync(path.join(dir,'export-glb.js'),'utf8')+'\nglobal.SceneExporter=SceneExporter');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,ghost:null,selected:null,moveTarget:null,mode:'build',placement:null,
 placementCategory:null,placementRotation:0,placementScale:1,smartSnap:false,joinMode:'auto',
 placementSurfacePaint:{},placementDecals:[],floorLevel:0,storeyHeight:2.6,
 snap:2,currentPaint:'#dedede',yaw:0});
w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
w.undo=[];w.heightAt=()=>0;w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};w.updateGameGhost=()=>{};
w.highlight={setFromObject(){},visible:false};w.categoryForKind=id=>id==='wall'?'wall':id==='floor'?'foundation':'prop';
const terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));terrain.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1],3));w.terrain={geometry:terrain};
const tex=new THREE.DataTexture(new Uint8Array([255,200,0,255,255,200,0,0,255,200,0,255,255,200,0,0]),2,2,THREE.RGBAFormat);
tex.needsUpdate=true;w.textures.set('emblem:sigil',tex);
const first=w.instantiate('wall',{id:10,pos:[0,0,0],rot:0,scale:1,category:'wall',surfacePaint:{all:{color:'#ffffff'}}});
const neighbor=w.instantiate('wall',{id:11,pos:[3,0,0],rot:0,scale:1,category:'wall',surfacePaint:{all:{color:'#ffffff'}}});
const decal={id:'d1',texture:'emblem:sigil',face:'front',x:.5,y:.5,size:.6,rotation:25,opacity:.7};
const second={...decal,id:'d2',face:'back',x:.25,y:.75,opacity:1};
w.updateDecals(first,[decal,second]);
assert.equal(w.objects.length,2,'Emblems must never create separate meshes');
assert.equal(first.mesh.children.length,1,'One original wall mesh');
assert.equal(neighbor.data.decals,undefined,'Other walls must not be modified');
assert.equal(first.data.decals.length,2,'Two emblems on distinct faces');
const mat=first.mesh.children[0].material;
const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
 fragmentShader:'#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <alphatest_fragment>'};
mat.onBeforeCompile(shader);
assert.equal(shader.uniforms.pwbDecalActive0.value,1);
assert.equal(shader.uniforms.pwbDecalActive1.value,1);
assert.strictEqual(shader.uniforms.pwbDecalMap0.value,tex);
assert(shader.fragmentShader.includes('pwbDecalMap0'));
assert(shader.fragmentShader.includes('pwbEnabledall'),'Original surface paint still applied');
assert(shader.vertexShader.includes('pwbDecalPos'));
assert(shader.fragmentShader.includes('pixel.a*pwbDecalOpacity'));
for(let i=0;i<7;i++)w.updateDecals(first,[{...decal,size:.5+i*.06}]);
const testShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
 fragmentShader:'#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <alphatest_fragment>'};
first.mesh.children[0].material.onBeforeCompile(testShader);
assert.equal((testShader.fragmentShader.match(/uniform sampler2D pwbDecalMap0;/g)||[]).length,1,'Shader injection must not multiply with slider changes');
assert.equal((testShader.fragmentShader.match(/uniform sampler2D pwbTextureall;/g)||[]).length,1,'Paint shader must not accumulate');
w.updateDecals(first,[decal,second]);
const snapshot=w.snapshot();
assert.equal(snapshot.objects[0].decals.length,2);
assert.equal(snapshot.objects[0].decals[0].rotation,25);
assert.equal(snapshot.objects[0].decals[1].face,'back');
let draws=[];
global.document={createElement:tag=>{
 assert.equal(tag,'canvas');
 const c={width:512,height:512};c.getContext=()=>({
  fillRect(){},drawImage(){draws.push(true)},save(){},restore(){},translate(){},rotate(){},
  set fillStyle(v){},set globalAlpha(v){},set globalCompositeOperation(v){}
 });
 c.toBlob=callback=>callback(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));
 return c;
}};
(async()=>{
 await w.restore(snapshot);
 assert.equal(w.objects.length,2);
 assert.equal(w.objects[0].data.decals.length,2,'Emblems survive save/load round-trip');
 const bytes=new Uint8Array(await (await SceneExporter.build(w,{houseOnly:true})).arrayBuffer());
 const json=new DataView(bytes.buffer);
 const gltf=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+json.getUint32(12,true))));
 assert.equal(gltf.meshes.length,2,'Export must retain original module count');
 assert.equal(gltf.nodes.length,2,'Export must retain original number of GLB nodes');
 assert(gltf.images.length>=2,'Emblems on front and back bake to embedded GLB images');
 assert(gltf.meshes[0].primitives.length>=4,'Face UVs should split by decal without duplicate geometry');
 const total=gltf.meshes[0].primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count,0);
 assert.equal(total,36,'Emblem overlay must reuse original 12 triangles');
 const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
 for(const id of ['btnCatalogEmblems','decalFace','decalSize','decalRotation','decalOpacity','btnDecalText','fileEmblem','btnGameEmblems','decalActive'])assert(html.includes('id="'+id+'"'),'Missing emblem UI: '+id);
 assert(html.indexOf('decal-layer.js')<html.indexOf('decal-ui.js'));
 assert(html.indexOf('decal-ui.js')<html.indexOf('app.js'));
 assert(app.includes("for(const obj of project.objects)for(const decal of(obj.decals||[]))"),'Project/ZIP must include emblem texture dependencies');
 assert(!app.includes('setTimeout(()=>saveLocal('),'Must not restore world autosaving');
 console.log('Two emblems, text/PNG UI, shader composition, original triangle count, GLB bake and manual-save project roundtrip OK');
})().catch(error=>{console.error(error);process.exitCode=1});
