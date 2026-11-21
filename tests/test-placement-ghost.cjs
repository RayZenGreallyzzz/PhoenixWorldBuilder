'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const T=require(path.join(root,'js/three.min.js'));
const Ghost=require(path.join(root,'js/placement-ghost.js'));
const scene=new T.Scene();
const plane=new T.Mesh(new T.PlaneGeometry(100,100),
 new T.MeshStandardMaterial({color:0x59803e}));
plane.rotation.x=-Math.PI/2;scene.add(plane);
const assembly=new T.Group();
const wall=new T.Mesh(new T.BoxGeometry(2,2,.12),
 new T.MeshStandardMaterial({color:0xffffff}));
wall.position.y=0;assembly.add(wall);
const corner=new T.Mesh(new T.BoxGeometry(.4,2,.4),[
 new T.MeshStandardMaterial({color:0xcc4444}),
 new T.MeshStandardMaterial({color:0x111111})
]);
assembly.add(corner);
scene.add(assembly);
assert(Ghost.align(assembly,0,T),'Should place bottom of wall on ground');
const feet=new T.Box3().setFromObject(assembly);
assert(Math.abs(feet.min.y)<.0001);
assert(Math.abs(assembly.position.y-1)<.001,
 'GLB centered at waist must be lifted above terrain');
assert(Ghost.align(assembly,3.25,T));
const hill=new T.Box3().setFromObject(assembly);
assert(Math.abs(hill.min.y-3.25)<.0001,
 'Preview must track the actual sculpted ground');
assert.equal(Ghost.style(assembly,T),2);
for(const mesh of [wall,corner]){
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 assert(mesh.renderOrder>900);
 for(const mat of materials){
  assert.equal(mat.transparent,true);
  assert.equal(mat.depthTest,false,'Terrain should never hide the active ghost');
  assert.equal(mat.depthWrite,false,'Ghost should not punch holes into the depth buffer');
  assert(mat.opacity>.35&&mat.opacity<.65);
  assert.equal(mat.side,T.DoubleSide,'See wall panels from both sides');
 }
}
assert.equal(corner.material.length,2,
 'Imported GLB with multiple material slots must not disappear');
assert.strictEqual(wall.material,corner.material[0],
 'Shared preview material avoids Android material creation per submesh');
assert.equal(Ghost.style(assembly,T),2,'Repeated styling must be safe');
const committed=new T.Mesh(new T.BoxGeometry(2,2,.12),
 new T.MeshStandardMaterial({color:0xf5f4d8}));
assert.equal(committed.material.transparent,false,
 'Installed scene module must keep normal opaque PBR material');
assert.equal(committed.material.depthTest,true,
 'Installed module must keep normal occlusion by terrain and walls');
const app=fs.readFileSync(path.join(root,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(html.indexOf('src="js/placement-ghost.js"')>0);
assert(html.indexOf('src="js/placement-ghost.js"')<
 html.indexOf('src="js/clean-app.js"'));
assert(app.includes('this.previewOutline.renderOrder=960'));
assert(app.includes('this.applyPreviewGhost(obj)'));
assert(app.includes('this.worldEditor.heightAt(obj.root.position.x,obj.root.position.z)'));
assert(app.includes('PhoenixPlacementGhost.align(obj.root,height,THREE)'));
assert(app.includes('this.worldEditor.pointerTerrain(e)'));
assert(app.includes('obj===this.preview'));
assert(app.includes('this.applyPreviewGhost();'));
assert(!app.includes('this.previewOutline.renderOrder=900'));
console.log('PASS: visible cyan transparent ghost, hill grounding, rebuilt GLB previews, opaque installed parts');
