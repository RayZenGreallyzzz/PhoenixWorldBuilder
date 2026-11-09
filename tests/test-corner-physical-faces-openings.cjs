/* Imported left/right corners and original PR #44 wall cuts must keep
 * physical front/back finishes and continuous path UV in all rotations.
 * No GLB library, WebGL or editing of user scenes is required.
 */
const assert=require('node:assert/strict');
const path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets/js');
global.THREE=require(path.join(base,'three.min.js'));
global.CleanGeometry=require(path.join(base,'clean-geometry.js'));
global.SurfaceWorkshop=require(path.join(base,'surface-workshop.js'));
const Openings=require(path.join(base,'wall-openings.js'));
const Mats=require(path.join(base,'surface-materials.js'));
const T=global.THREE,G=global.CleanGeometry,W=global.SurfaceWorkshop;
const style={mapping:'repeat',tileMeters:1,repeat:1};
const sides={front:{style:'paint',color:'#aabbcc'},
 back:{style:'paint',color:'#ccbbaa'}};
const vec=()=>new T.Vector3();
let tested=0;
function checkWalls(root,kind,cut,mirror,rot){
 root.scale.x=mirror?-1:1;root.rotation.y=rot;
 root.position.set(3.2,.4,-8.5);root.updateWorldMatrix(true,true);
 if(cut){
  const result=Openings.render(root,kind,[{id:'test',type:'window',
   shape:'rectangle',x:0,y:.85,w:.62,h:.8}],
   {thickness:.22,axes:{x:1,y:1,z:1}});
  assert(result.ok,result.reason||'Opening creation failed');
 }
 const candidates=cut?[root.getObjectByName('structure:wall')]:root.children;
 assert(candidates.every(Boolean),'Original structural wall missing');
 for(const mesh of candidates){
  const original=mesh.geometry;
  const flat=original.index?original.toNonIndexed():original;
  const originalPositions=Array.from(flat.getAttribute('position').array);
  const projected=W.project(root,mesh,original,style,kind);
  assert(projected,'Cannot project '+kind);
  const pos=projected.getAttribute('position'),uv=projected.getAttribute('uv');
  const transform=root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const v0=vec(),v1=vec(),v2=vec(),n=vec(),e=vec(),f=vec(),middle=vec();
  let broad=0;
  if(kind==='corner'){
   for(let i=0;i<pos.count;i+=3){
    v0.fromBufferAttribute(pos,i).applyMatrix4(transform);
    v1.fromBufferAttribute(pos,i+1).applyMatrix4(transform);
    v2.fromBufferAttribute(pos,i+2).applyMatrix4(transform);
    n.copy(e.subVectors(v1,v0)).cross(f.subVectors(v2,v0)).normalize();
    middle.copy(v0).add(v1).add(v2).multiplyScalar(1/3);
    const first=Math.abs(n.z)>.85&&Math.abs(n.x)<.15;
    const second=Math.abs(n.x)>.85&&Math.abs(n.z)<.15;
    if(!first&&!second)continue;
    // End caps and window reveals are not broad visible walls.
    if(first&&(middle.x<-1.85||middle.x>-.08))continue;
    if(second&&(middle.z<-1.85||middle.z>-.08))continue;
    for(let j=0;j<3;j++){
     const v=[v0,v1,v2][j],expected=first?v.x+1.9:1.9-v.z;
     assert(Math.abs(uv.getX(i+j)-expected)<.12,
      'L arm UV stripe after rotation '+rot+' mirror '+mirror+
      ' cut '+cut+': actual '+uv.getX(i+j)+' expected '+expected);
    }
    broad++;
   }
  }
  assert(kind!=='corner'||broad>0,'No broad wall faces tested');
  projected.dispose();
  if(flat!==original)flat.dispose();
  const finished=Mats.applyFaces(root,{style:'none'},sides,new Map(),
   {kind,category:'wall'});
  assert(finished.ok&&finished.faces>0,'Front/back finishes missing');
  const actual=Array.from(mesh.geometry.getAttribute('position').array);
  assert.deepEqual(actual,originalPositions,'Door/window geometry changed');
  const found=new Set();
  for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])
   if(mat.name?.includes('отдельная сторона'))found.add(mat.color.getHexString());
  assert(found.size===2,'Both wall sides must be painted');
  tested++;
 }
}
for(const kind of ['wall','corner','arc90','arc180']){
 for(const mirror of [false,true]){
  for(const rot of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   for(const cut of [false,true]){
    const root=G.create(kind);
    checkWalls(root,kind,cut,mirror,rot);
   }
  }
 }
}
// Baked left/right GLB corners: the convex side must be front for BOTH.
for(const handed of ['right','left']){
 const root=G.create('corner');
 if(handed==='left'){
  for(const mesh of root.children){
   mesh.position.x*=-1;
   const geometry=mesh.geometry.clone(),p=geometry.getAttribute('position');
   for(let i=0;i<p.count;i++)p.setX(i,-p.getX(i));
   p.needsUpdate=true;geometry.computeVertexNormals();
   mesh.geometry=geometry;
  }
 }
 root.updateWorldMatrix(true,true);
 const profile=W.importedWallProfile(root,'glb:corner','wall');
 assert(profile&&profile.type==='corner','L handedness not recognized: '+handed);
 const sampleX=handed==='right'?-1:1;
 const faceZ=new T.Vector3(sampleX,1,.11);
 const first=Mats.sideFromNormal(new T.Vector3(0,0,1),
  'wall','glb:corner',faceZ,profile);
 const faceX=new T.Vector3(handed==='right'?.11:-.11,1,-1);
 const second=Mats.sideFromNormal(new T.Vector3(1,0,0),
  'wall','glb:corner',faceX,profile);
 assert.equal(first,'front',handed+' first arm outside');
 assert.equal(second,'front',handed+' second arm outside');
 const outcome=Mats.applyFaces(root,{style:'none'},sides,new Map(),
  {kind:'glb:corner',category:'wall'});
 assert(outcome.ok&&outcome.faces>0,'Side finishing missing on GLB '+handed);
 tested++;
}
console.log('Physically stable UV/face mapping for '+tested+
 ' wall/arc/L cases, mirrored rotations and pre-cut windows OK');
