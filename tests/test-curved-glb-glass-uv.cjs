/* Regression: PR #44 textures on imported 90/180 arcs, L corners and
 * mixed glass/opaque GLB primitives. No WebGL, no external binary user GLBs.
 * Project templates and glass must remain byte-for-byte unchanged.
 */
const assert=require('node:assert/strict');
const path=require('node:path');
const assets=path.resolve(__dirname,'../app/src/main/assets/js');
global.THREE=require(path.join(assets,'three.min.js'));
global.CleanGeometry=require(path.join(assets,'clean-geometry.js'));
global.SurfaceWorkshop=require(path.join(assets,'surface-workshop.js'));
const M=require(path.join(assets,'surface-materials.js'));
const T=global.THREE,G=global.CleanGeometry,W=global.SurfaceWorkshop;
const texture=()=>new T.DataTexture(new Uint8Array(16).fill(255),2,2,T.RGBAFormat);
const style=(mapping='auto')=>({style:'custom',imageId:'texture:test',
 mapping,tileMeters:1,repeat:1,color:'#ffffff'});
const all=a=>Array.from(a.array);
const uSpan=uv=>{
 const a=[];for(let i=0;i<uv.count;i++)a.push(uv.getX(i));
 return Math.max(...a)-Math.min(...a);
};
const hit=(p,n,profile)=>M.sideFromNormal(new T.Vector3(...n),
 'wall','glb:user-model',new T.Vector3(...p),profile);

// Generic / straight imported models KEEP authored UV under Auto.
{
 const root=G.create('wall'),mesh=root.children[0],original=mesh.geometry,
  authored=all(original.getAttribute('uv'));
 assert.equal(W.importedWallProfile(root,'glb:straight','wall'),null);
 const result=M.apply(root,style(),texture(),{kind:'glb:straight',category:'wall'});
 assert.equal(result.mode,'source');
 assert.deepEqual(all(mesh.geometry.getAttribute('uv')),
  all(original.toNonIndexed().getAttribute('uv')));
 assert.deepEqual(all(original.getAttribute('uv')),authored);
}
// Genuine curves / 90-degree L become physically continuous in Auto,
// but their original triangles and catalog UV remain untouched.
for(const [shape,minLength] of [['arc90',2.7],['arc180',5.7],['corner',3.5]]){
 const root=G.create(shape),mesh=root.children[0],
  original=mesh.geometry,sourcePositions=all(original.getAttribute('position')),
  sourceUV=all(original.getAttribute('uv'));
 const profile=W.importedWallProfile(root,'glb:'+shape,'wall');
 assert(profile,shape+' should be recognized geometrically');
 assert.equal(profile.type,shape==='corner'?'corner':'arc');
 if(shape!=='corner')assert(Math.abs(profile.length-
  (shape==='arc90'?Math.PI:2*Math.PI))<.12,
  shape+' must use complete physical end-to-end arc length');
 const result=M.apply(root,style(),texture(),{kind:'glb:'+shape,category:'wall'});
 assert.equal(result.mode,'repeat',shape+' must use physical UV');
 assert(uSpan(mesh.geometry.getAttribute('uv'))>minLength,
  shape+' UV should span full curve/path instead of tiny authored islands');
 assert.deepEqual(all(original.getAttribute('position')),sourcePositions);
 assert.deepEqual(all(original.getAttribute('uv')),sourceUV);
 const snapshot=all(mesh.geometry.getAttribute('uv'));
 M.apply(root,style(),texture(),{kind:'glb:'+shape,category:'wall'});
 assert.deepEqual(all(mesh.geometry.getAttribute('uv')),snapshot,
  shape+' repaint must not drift UVs');
 if(shape==='arc90'){
  assert.equal(hit([2.11,1,0],[1,0,0],profile),'front');
  assert.equal(hit([1.89,1,0],[-1,0,0],profile),'back');
 }
 if(shape==='corner'){
  assert.equal(hit([-1,1,.11],[0,0,1],profile),'front');
  assert.equal(hit([.11,1,-1],[1,0,0],profile),'front');
 }
}
// Image placement uses REAL dimensions (vector constructor must accept x,y,z).
{
 const root=G.create('wall'),m=root.children[0];
 const geo=W.project(root,m,m.geometry,{mapping:'tile',
  textureAspect:1,imageScale:1},'wall');
 const uv=geo.getAttribute('uv'),face=[];
 for(let i=24;i<30;i++)face.push(uv.getX(i));
 const span=Math.max(...face)-Math.min(...face);
 assert(span>.65&&span<1.01,
  'Tile mode must not collapse U because physicalExt is a zero vector');
 geo.dispose();
}
// An imported window GLB may put clear glass and a solid frame in ONE mesh.
// Only the frame gets texture UV; glass stays transparent with AUTHORED UV.
{
 const root=new T.Group(),geo=new T.BoxGeometry(2,2,.2);
 geo.groups.forEach((group,i)=>group.materialIndex=i===4?1:0);
 const plaster=new T.MeshStandardMaterial({name:'frame/wall'}),
  glass=new T.MeshStandardMaterial({name:'Phoenix_Clear_Glass',
   transparent:true,opacity:.28});
 const m=new T.Mesh(geo,[plaster,glass]);root.add(m);
 const flat=geo.toNonIndexed(),positions=all(flat.getAttribute('position')),
  originalUV=all(flat.getAttribute('uv'));flat.dispose();
 const painted=M.apply(root,style('repeat'),texture(),
  {kind:'wall',category:'wall'});
 assert(painted.ok);
 assert.notStrictEqual(m.material[0],plaster,'Opaque frame should be paintable');
 assert.strictEqual(m.material[1],glass,'Glass source material must not be cloned');
 const uv=m.geometry.getAttribute('uv');
 for(const group of geo.groups)if(group.materialIndex===1)
  for(let i=group.start;i<group.start+group.count;i++){
   assert.equal(uv.getX(i),originalUV[i*2],'Glass U preserved');
   assert.equal(uv.getY(i),originalUV[i*2+1],'Glass V preserved');
  }
 const sides={front:style('repeat'),back:style('repeat')};
 const result=M.applyFaces(root,{style:'none'},sides,
  new Map([['texture:test',texture()]]),{kind:'wall',category:'wall'});
 assert(result.ok&&result.faces===1);
 assert(m.material.includes(glass),'Side-specific finish must not paint glass');
 assert.deepEqual(all(m.geometry.getAttribute('position')),positions,
  'Wall with window: no new triangles across an opening');
 const sideUV=m.geometry.getAttribute('uv');
 for(const group of m.geometry.groups)if(m.material[group.materialIndex]===glass)
  for(let i=group.start;i<group.start+group.count;i++){
   assert.equal(sideUV.getX(i),originalUV[i*2]);
   assert.equal(sideUV.getY(i),originalUV[i*2+1]);
  }
 const onlyGlass=new T.Group(),standalone=new T.Mesh(new T.BoxGeometry(1,1,.02),
  new T.MeshStandardMaterial({name:'Phoenix_Clear_Glass'}));
 onlyGlass.add(standalone);
 const glassGeo=standalone.geometry,glassMat=standalone.material;
 M.apply(onlyGlass,style('repeat'),texture(),{kind:'glb:window',category:'wall'});
 assert.strictEqual(standalone.geometry,glassGeo);
 assert.strictEqual(standalone.material,glassMat);
}
console.log('Imported arc/corner physical UV, tile scale, glass materials/groups, authored UVs, wall geometry OK');
