const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js'),THREE=global.THREE=require(path.join(dir,'three.min.js'));
const Forge=require(path.join(dir,'module-forge.js'));global.ModuleForge=Forge;
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
global.WallThickness=require(path.join(dir,'wall-thickness.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(a,b,msg,tol=.055)=>assert(Math.abs(a-b)<tol,msg+': '+a+' vs '+b);
const orig=new THREE.Group(),src=new THREE.Mesh(new THREE.BoxGeometry(3,2,.3,4,3,2),
 new THREE.MeshStandardMaterial({color:'#f2ece1'}));
src.position.y=1;orig.add(src);
const originalGeometry=src.geometry,origValues=src.geometry.attributes.position.array.slice(),uv=src.geometry.attributes.uv.array.slice();
for(const kind of ['straight','corner','arc90','arc180'])for(const use of ['wall','foundation','roof']){
 const root=orig.clone(true),result=Forge.build(root,kind,use);
 assert(result.ok,'Auto-shape '+use+' '+kind+': '+result.reason);
 assert.equal(root.children.length,1,'One original GLB, no wall-copy tiling');
 assert.notEqual(root.children[0].geometry,originalGeometry,'Per-instance vertex geometry cloned');
 assert(root.children[0].geometry.getAttribute('uv'),'Parametric UV supplied');
 assert(root.children[0].geometry.getAttribute('pwbFittedUV'),'Fitted source UV supplied');
 assert.equal(root.userData.pwbModuleShape,kind);
 const a=root.children[0].geometry.attributes.uv;
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
 for(let i=0;i<a.count;i++){minU=Math.min(minU,a.getX(i));maxU=Math.max(maxU,a.getX(i));minV=Math.min(minV,a.getY(i));maxV=Math.max(maxV,a.getY(i));}
 near(minU,0,use+' '+kind+' U starts at 0');
 near(maxU,1,use+' '+kind+' U ends at 1');
 near(minV,0,use+' '+kind+' V starts at 0');
 near(maxV,1,use+' '+kind+' V ends at 1');
 near(Forge.base[use].height,new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y,'Standard height');
 if(use==='wall'){
  assert(root.userData.pwbModuleSockets.length===2,'Wall has two attachment sockets');
  const s=root.userData.pwbModuleSockets;
  if(kind==='straight'){near(s[0].point[0],-1,'Wall length 2m');near(s[1].point[0],1,'Wall length 2m')}
  if(kind==='arc90'){
   near(s[0].point[0],2,'Quarter radius 2m');near(s[1].point[2],2,'Quarter end radius');
   assert(BuildCurves.isArc('glb:stone',root),'Forge identifies curved wall for socket snapping');
   const sockets=BuildCurves.localSockets(root,'glb:stone');assert(sockets?.length===2);
   near(sockets[0].out.z,-1,'Correct starting outward tangent');
  }
  if(kind==='arc180')near(s[1].point[0],-2,'Semicircle diameter 4m');
  if(kind==='corner'){
   const arms=BuildJoin.cornerArms(root,'glb:stone','corner');
   assert(arms?.length===2,'Fitted GLB corner has two true legs for magnetic joins');
  }
 }
}
assert.deepEqual(Array.from(originalGeometry.attributes.position.array),Array.from(origValues),
 'Original GLB vertices must never mutate');
assert.deepEqual(Array.from(originalGeometry.attributes.uv.array),Array.from(uv),
 'Original GLB UV must never mutate');
const skinned=new THREE.Group();
skinned.add(new THREE.SkinnedMesh(originalGeometry,new THREE.MeshStandardMaterial()));
assert.equal(Forge.build(skinned,'arc90','wall').ok,false,'Rigged characters must be rejected');
const paint=fs.readFileSync(path.join(dir,'surface-paint.js'),'utf8');
assert(paint.includes('pwbModuleUV=pwbFittedUV'),'Curved GLB fitted UV is connected to shader');
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
for(const id of ['btnForgeModule','forgeShape','forgeUse'])assert(html.includes('id="'+id+'"'),'Make module UI attached');
const world=fs.readFileSync(path.join(dir,'world.js'),'utf8');
assert(world.includes('setModuleShape(shape,use=null)')&&world.includes('moduleShape:this.placementModuleShape'),'Shape saved in placed object');
assert(world.includes('moduleShape:e.moduleShape'),'Shape restored from saved project');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
assert(app.includes("moduleShape:entry?.data?.moduleShape"),'Save formed module as preset');
assert(app.includes('setModuleShape(preset.moduleShape,preset.moduleUse)'),'Load fitted preset');
console.log('Original Phoenix Builder: single GLB fit to wall/corner/quarter/semicircle/tile/roof OK');
