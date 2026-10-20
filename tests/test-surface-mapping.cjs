const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.SurfacePaint=require(path.join(d,'surface-paint.js'));
vm.runInThisContext(fs.readFileSync(path.join(d,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
vm.runInThisContext(fs.readFileSync(path.join(d,'export-glb.js'),'utf8')+'\nglobal.SceneExporter=SceneExporter');
const w=Object.create(WorldBuilder.prototype);
Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
 nextId:1,ghost:null,selected:null,moveTarget:null,mode:'build',placement:null,
 placementCategory:null,placementRotation:0,placementScale:1,smartSnap:false,
 joinMode:'free',autoThickness:true,placementLift:0,
 floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',undo:[]});
w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};
w.heightAt=()=>0;w.updateGameGhost=()=>{};w.highlight={setFromObject(){},visible:false};
w.categoryForKind=id=>id==='floor'?'foundation':id;
const geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
geo.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1],3));
w.terrain={geometry:geo};
const art=new THREE.DataTexture(new Uint8Array(8*4*4).fill(255),8,4,THREE.RGBAFormat);
art.needsUpdate=true;
w.textures.set('tex:wood',art);
const wall=w.instantiate('wall',{id:1,pos:[0,0,9],rot:0,scale:1,category:'wall',storey:0});
const floor=(id,x,z=0,level=0)=>w.instantiate('floor',{id,pos:[x,level*2.6,z],rot:0,scale:1,category:'foundation',storey:level});
const one=floor(2,0),two=floor(3,2),three=floor(4,4),isolated=floor(5,9);
const upper=floor(6,2,0,1);
const group=SurfacePaint.joinedFloors(w,one);
assert.equal(group.length,3,'Only the three touching first-floor slabs form one paint region');
assert(group.every(x=>x.region.every((n,i)=>Math.abs(n-group[0].region[i])<1e-9)));
assert.equal(group[0].region[0],-1);
assert.equal(group[0].region[2],5);
assert.equal(group[0].region[1],-1);
assert.equal(group[0].region[3],1);
assert.equal(w.applyJoinedFloorFinish(one,'tex:wood',{faithful:true}),3);
assert.equal(one.data.surfacePaint.top.mode,'joined');
assert.equal(one.data.surfacePaint.top.texture,'tex:wood');
assert.deepEqual(two.data.surfacePaint.top.region,one.data.surfacePaint.top.region);
assert.equal(isolated.data.surfacePaint,undefined,'Detached slab remains unchanged');
assert.equal(upper.data.surfacePaint,undefined,'Different storey remains unchanged');
assert.equal(w.objects.length,6,'One texture across floor adds no geometry');

const modes=['repeat','tile','module','joined'];
for(const mode of modes){
 let finish=SurfacePaint.update({},'top','texture','tex:wood');
 finish=SurfacePaint.update(finish,'top','mode',mode);
 finish=SurfacePaint.update(finish,'top','tileMeters',2.4);
 finish=SurfacePaint.update(finish,'top','faithful',true);
 const box=floor(10+modes.indexOf(mode),15+modes.indexOf(mode)*3,0,0);
 box.data.surfacePaint=finish;w.applyAppearance(box);
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
  fragmentShader:'#include <common>\n#include <map_fragment>\n#include <color_fragment>'};
 box.mesh.children[0].material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.pwbModetop.value,modes.indexOf(mode));
 assert.equal(shader.uniforms.pwbMeterstop.value,2.4);
 assert.equal(shader.uniforms.pwbFaithfultop.value,1);
 assert(shader.fragmentShader.includes('pwbRead('));
 assert(shader.fragmentShader.includes('pwbColor('));
 assert(shader.vertexShader.includes('pwbToRoot'));
 assert.equal(box.mesh.children.length,1,'No extra paint mesh');
}
assert.equal(SurfacePaint.update({},'all','mode','module').all.mode,'module');
assert.equal(SurfacePaint.update({},'all','tileMeters',100).all.tileMeters,40);
assert.equal(SurfacePaint.update({},'all','tileMeters',.01).all.tileMeters,.1);
const snap=w.snapshot();
assert.equal(snap.objects.find(x=>x.id===2).surfacePaint.top.mode,'joined');
assert.equal(snap.objects.find(x=>x.id===2).surfacePaint.top.faithful,true);
let recordedUV=[];
const original=global.document;
global.document={createElement:tag=>{
 assert.equal(tag,'canvas');
 const cv={width:8,height:4};cv.getContext=()=>({drawImage(){},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){}});
 cv.toBlob=done=>done(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));
 return cv;
}};
(async()=>{
 const buffer=await (await SceneExporter.build(w,{houseOnly:true})).arrayBuffer();
 const bytes=new Uint8Array(buffer),dv=new DataView(buffer);
 const json=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+dv.getUint32(12,true))));
 assert.equal(json.meshes.length,w.objects.length,'Export retains module count for all modes');
 const valid=json.meshes.some(m=>m.primitives.some(p=>p.attributes.TEXCOORD_0!==undefined));
 assert(valid,'Paint export includes mapped UV');
 for(const id of ['surfaceMode','gameSurfaceMode','surfaceTileMeters','gameSurfaceTileMeters',
  'surfaceFaithful','gameSurfaceFaithful','btnJoinedFloor','btnGameJoinedFloor'])
  assert(fs.readFileSync(path.join(d,'../index.html'),'utf8').includes('id="'+id+'"'),'Missing texture mapping UI '+id);
 const app=fs.readFileSync(path.join(d,'app.js'),'utf8');
 assert(app.includes("w.applyJoinedFloorFinish(")&&app.includes("SurfacePaint.update(skin,surfaceScope,'mode'"));
 console.log('Four texture mapping modes, connected floor crop, project persistence and GLB export OK');
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>global.document=original);
