/* User regression: quarter-circle texture paints only half; walk around
 * the house and outside/inside wall faces change after cutting openings.
 * Verify actual triangle GROUPS, not just the classification helper.
 */
const assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
global.SurfaceWorkshop=require(path.join(base,'js/surface-workshop.js'));
const W=require(path.join(base,'js/wall-openings.js'));
global.document={createElement(name){
 assert.equal(name,'canvas');return {width:0,height:0,getContext(){return {
 fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},
 bezierCurveTo(){},stroke(){}}}};
}};
const M=require(path.join(base,'js/surface-materials.js'));
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const sides={front:{style:'stone',mapping:'repeat',tileMeters:.8},
 back:{style:'plaster',mapping:'repeat',tileMeters:.8}};
function geometryAt(mesh,i){
 const g=mesh.geometry,pos=g.getAttribute('position'),index=g.index;
 const v=new T.Vector3(),points=[];
 for(let j=0;j<3;j++){
  const n=index?index.getX(i+j):i+j;
  points.push(v.fromBufferAttribute(pos,n).clone().applyMatrix4(mesh.matrixWorld));
 }
 const [a,b,c]=points;
 const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
 const center=a.clone().add(b).add(c).multiplyScalar(1/3);
 return {center,normal};
}
function materialAt(mesh,tri){
 const offset=tri*3;
 const group=mesh.geometry.groups.find(g=>offset>=g.start&&offset<g.start+g.count);
 return Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;
}
// Geometric oracle independent of sideFromNormal: inspect the side's actual
// physical position relative to the curved wall's 2m centreline.
function physicalFace(kind,p,n){
 if(Math.abs(n.y)>.3)return null;
 if(kind==='arc90'||kind==='arc180'){
  const r=Math.hypot(p.x,p.z);
  const radial=(p.x*n.x+p.z*n.z)/(r||1);
  if(Math.abs(radial)<.85||Math.abs(r-2)<.04)return null;
  return r>2?'front':'back';
 }
 if(kind==='wall'){
  if(Math.abs(n.z)<.85||Math.abs(p.z)<.045)return null;
  return p.z>0?'front':'back';
 }
 if(kind==='corner'){
  if(p.x<-.45&&Math.abs(n.z)>.85&&Math.abs(p.z)>.045)
   return p.z>0?'front':'back';
  if(p.z<-.45&&Math.abs(n.x)>.85&&Math.abs(p.x)>.045)
   return p.x>0?'front':'back';
 }
 return null;
}
const cases=['wall','corner','arc90','arc180'];
for(const kind of cases){
 for(const cut of [false,true]){
  const root=CleanGeometry.create(kind);
  assert(root,'No built-in '+kind);
  if(cut){
   const opening={id:'hole',type:'window',shape:'round',x:0,y:.9,w:.6,
    h:.95,doorStyle:'round',frameStyle:'round'};
   const done=W.render(root,kind,[opening],{thickness:.22,axes:{x:1,y:1,z:1}});
   assert(done.ok,kind+' curved window cut failed: '+done.reason);
  }
  // A clockwise and anticlockwise wall around a city should keep the same
  // exterior side when their OBJECT rotation changes.
  root.rotation.y=Math.PI*.37;root.position.set(4,.8,-3);
  root.updateMatrixWorld(true,true);
  const structural=cut?root.getObjectByName('structure:wall'):root.children[0];
  const originalMaterial=structural.material;
  const originalGeometry=structural.geometry;
  // applyFaces expands indexed BoxGeometry into triangles for independent
  // glTF material groups. Compare expanded vertices, not raw index layouts.
  const flattened=originalGeometry.index?originalGeometry.toNonIndexed():originalGeometry;
  const snapshot=Array.from(flattened.getAttribute('position').array);
  if(flattened!==originalGeometry)flattened.dispose();
  const result=M.applyFaces(root,{style:'none'},sides,new Map(),{kind,category:'wall'});
  assert(result.ok&&result.faces>0,'Painting faces failed: '+kind+' cut='+cut);
  let outside=0,inside=0,notPainted=0,caps=0;
  root.updateWorldMatrix(true,true);
  const pos=structural.geometry.getAttribute('position');
  for(let tri=0;tri<pos.count/3;tri++){
   const {center,normal}=geometryAt(structural,tri*3);
   const localCenter=root.worldToLocal(center.clone());
   const localNormal=normal.clone().applyQuaternion(
    root.getWorldQuaternion(new T.Quaternion()).invert());
   const expected=physicalFace(kind,localCenter,localNormal);
   const mat=materialAt(structural,tri);
   if(expected){
    if(expected==='front')outside++;else inside++;
    if(!mat.name.includes(expected==='front'?'stone':'plaster'))notPainted++;
   }else if(Math.abs(localNormal.y)>.8){
    caps++;
    assert.equal(mat,originalMaterial,kind+' top/bottom must not be painted');
   }
  }
  assert(outside>=2&&inside>=2,
   kind+' must have both physical front/back triangles, cut='+cut);
  assert.equal(notPainted,0,
   kind+' entire curve and corner arms must be painted; wrong triangles='+notPainted+
   ', cut='+cut+' outside='+outside+' inside='+inside);
  assert(caps>0,kind+' should retain its roof/base caps');
  assert.deepEqual(Array.from(structural.geometry.getAttribute('position').array),
   snapshot,'Painting must preserve each triangle vertex: '+kind);
  assert(originalGeometry.getAttribute('position').count>0,
   'Original source geometry must remain intact');
  // Tap-to-select side must agree with the independently verified material.
  const geo=structural.geometry;
  for(let tri=0,checks=0;tri<geo.getAttribute('position').count/3&&checks<20;tri++){
   const p=geometryAt(structural,tri*3);
   const localCenter=root.worldToLocal(p.center.clone());
   const localNormal=p.normal.clone().applyQuaternion(
    root.getWorldQuaternion(new T.Quaternion()).invert());
   const expected=physicalFace(kind,localCenter,localNormal);
   if(!expected)continue;
   const normalOnMesh=p.normal.clone().applyQuaternion(
    structural.getWorldQuaternion(new T.Quaternion()).invert());
   const chosen=M.faceFromHit({face:{normal:normalOnMesh},
    object:structural,point:p.center},root,'wall');
   assert.equal(chosen,expected,kind+' finger hit selected wrong side');
   checks++;
  }
 }
}
// Switching between wall shapes and floor must preserve previous contracts.
assert.equal(M.sideFromNormal(V(0,0,1),'wall'),'front');
assert.equal(M.sideFromNormal(V(0,0,-1),'wall'),'back');
assert.equal(M.sideFromNormal(V(0,1,0),'floor'),'front');
assert.equal(M.sideFromNormal(V(0,-1,0),'floor'),'back');
assert.equal(M.sideFromNormal(V(0,0,1),'wall','arc90',V(0,1,2.11)),'front');
assert.equal(M.sideFromNormal(V(0,0,-1),'wall','arc90',V(0,1,1.89)),'back');
assert.equal(M.sideFromNormal(V(1,0,0),'wall','arc90',V(2.11,1,0)),'front');
assert.equal(M.sideFromNormal(V(-1,0,0),'wall','arc90',V(1.89,1,0)),'back');
assert.equal(M.sideFromNormal(V(0,0,1),'wall','corner',V(-1,1,.11)),'front');
assert.equal(M.sideFromNormal(V(1,0,0),'wall','corner',V(.11,1,-1)),'front');
assert.equal(M.sideFromNormal(V(-1,0,0),'wall','corner',V(-.11,1,-1)),'back');
console.log('Straight, L corner, 90° and 180° walls: both physical sides fully painted across curved openings, rotated modules and tap-to-paint OK');
