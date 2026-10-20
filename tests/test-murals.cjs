const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(root,'three.min.js'));
global.BuildSnap=require(path.join(root,'build-snap.js'));
global.DecalLayer=require(path.join(root,'decal-layer.js'));
global.MuralLayout=require(path.join(root,'mural-layout.js'));
vm.runInThisContext(fs.readFileSync(path.join(root,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const world=Object.create(WorldBuilder.prototype);
Object.assign(world,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),
 textures:new Map(),nextId:1,undo:[],mode:'build',floorLevel:0,
 placement:null,placementCategory:null,selected:null});
world.onChanged=()=>{};world.onSelected=()=>{};world.highlight={setFromObject(){},visible:false};
world.categoryForKind=kind=>kind==='wall'?'wall':'prop';
const wall=(id,x,z=0,rot=0)=>world.instantiate('wall',{
 id,pos:[x,0,z],rot,scale:1,category:'wall',storey:0});
const first=wall(1,0),middle=wall(2,2),last=wall(3,4);
const separate=wall(4,11),perp=wall(5,6,0,90);
const result=MuralLayout.collect(world,first,'front');
assert.equal(result.length,3,'All touching coplanar wall panels share one mural');
const crops=new Map(result.map(x=>[x.entry.data.id,x.crop]));
const close=(n,m)=>assert(Math.abs(n-m)<.001,'Expected '+m+', got '+n);
close(crops.get(1)[0],0);close(crops.get(1)[2],1/3);
close(crops.get(2)[0],1/3);close(crops.get(2)[2],2/3);
close(crops.get(3)[0],2/3);close(crops.get(3)[2],1);
assert(!crops.has(4),'Detached wall cannot be painted');
assert(!crops.has(5),'Perpendicular wall cannot share the flat picture');
const tex=new THREE.DataTexture(new Uint8Array(4*4*4).fill(255),4,4,THREE.RGBAFormat);
tex.needsUpdate=true;world.textures.set('emblem:panorama',tex);
world.remember=()=>{};
for(const x of result){
 x.entry.data.decals=DecalLayer.normalize([{id:'mural:one',muralId:'mural:one',
  texture:'emblem:panorama',face:'front',crop:x.crop,fit:'fill',size:1,x:.5,y:.5}]);
 world.applyAppearance(x.entry);
}
assert.equal(world.objects.length,5,'Mural creates zero geometry modules');
const mat=middle.mesh.children[0].material,shader={
 uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
 fragmentShader:'#include <common>\n#include <alphatest_fragment>'};
mat.onBeforeCompile(shader);
assert(shader.fragmentShader.includes('pwbDecalCrop0'));
close(shader.uniforms.pwbDecalCrop0.value.x,1/3);
close(shader.uniforms.pwbDecalCrop0.value.z,2/3);
const snapshot=world.snapshot();
assert.equal(snapshot.objects[1].decals[0].muralId,'mural:one');
assert.equal(snapshot.objects[1].decals[0].crop.length,4);
let cropsDuringExport=[];
global.document={createElement:tag=>{
 assert.equal(tag,'canvas');
 const obj={width:512,height:512};
 obj.getContext=()=>({fillRect(){},drawImage(...args){cropsDuringExport.push(args)},
 save(){},restore(){},translate(){},rotate(){},
 set fillStyle(v){},set globalAlpha(v){},set globalCompositeOperation(v){}});
 obj.toBlob=fn=>fn(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));
 return obj;
}};
vm.runInThisContext(fs.readFileSync(path.join(root,'export-glb.js'),'utf8')+'\nglobal.SceneExporter=SceneExporter');
(async()=>{
 await SceneExporter.build(world,{houseOnly:true});
 assert(cropsDuringExport.some(args=>args.length===9),
  'Each wall must export a cropped part of the original image');
 const html=fs.readFileSync(path.join(root,'../index.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'decal-ui.js'),'utf8');
 for(const s of ['btnMural','mural-layout.js'])assert(html.includes(s));
 assert(ui.includes('MuralLayout.collect')&&ui.includes("api.world.remember()"),
  'Mural application must use shared layout with a single Undo snapshot');
 console.log('Continuous image across three walls, exclude detached panels, shader UVs, GLB crops OK');
})().catch(err=>{console.error(err);process.exitCode=1});
