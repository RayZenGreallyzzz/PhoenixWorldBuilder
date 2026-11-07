/* Regression for separate stone/plaster on opposite faces of a solid slab.
 * No renderer/WebGL required. Geometry groups and UVs export to glTF/GLB.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
global.SurfaceWorkshop=require(path.join(base,'js/surface-workshop.js'));
const clean=require(path.join(base,'js/clean-geometry.js'));
const oldDocument=global.document;
global.document={createElement(name){
 assert.equal(name,'canvas');
 return {width:0,height:0,getContext(){return {fillRect(){},
  fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},
  bezierCurveTo(){},stroke(){}}}};
}};
const M=require(path.join(base,'js/surface-materials.js'));
assert.equal(M.normalize({style:'plaster'}).style,'plaster',
 'Plaster should be an actual selectable coating');
const sides=M.normalizeSides({front:{style:'stone'},back:{style:'plaster'}});
assert.equal(sides.front.style,'stone');assert.equal(sides.back.style,'plaster');
assert.equal(M.sideFromNormal(new T.Vector3(0,0,1),'wall'),'front');
assert.equal(M.sideFromNormal(new T.Vector3(0,0,-1),'wall'),'back');
assert.equal(M.sideFromNormal(new T.Vector3(1,0,0),'wall'),null,
 'Wall end caps should not be overwritten');
assert.equal(M.sideFromNormal(new T.Vector3(0,1,0),'floor'),'front');
assert.equal(M.sideFromNormal(new T.Vector3(0,-1,0),'floor'),'back');
function materialAt(mesh,triangle){
 const i=triangle*3,group=mesh.geometry.groups.find(g=>i>=g.start&&i<g.start+g.count);
 return Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;
}
function sideAt(mesh,tri,root,kind){
 const pos=mesh.geometry.getAttribute('position');
 const a=new T.Vector3().fromBufferAttribute(pos,tri*3).applyMatrix4(mesh.matrixWorld);
 const b=new T.Vector3().fromBufferAttribute(pos,tri*3+1).applyMatrix4(mesh.matrixWorld);
 const c=new T.Vector3().fromBufferAttribute(pos,tri*3+2).applyMatrix4(mesh.matrixWorld);
 const n=b.sub(a).cross(c.sub(a)).normalize()
  .applyQuaternion(root.getWorldQuaternion(new T.Quaternion()).invert());
 return M.sideFromNormal(n,kind);
}
for(const kind of ['wall','floor']){
 const root=clean.create(kind),mesh=root.children[0],
  original=mesh.geometry,source=mesh.material,
  sourceUV=Array.from(original.getAttribute('uv').array);
 const before=root.position.clone();
 const result=M.applyFaces(root,{style:'none'},sides,new Map(),{kind,category:kind});
 assert(result.ok&&result.faces>=1,kind+' dual side finishes should render');
 assert(Array.isArray(mesh.material),'Both sides must have separate glTF materials');
 const samples={front:[],back:[],edge:[]};
 mesh.updateWorldMatrix(true,false);
 const triangles=mesh.geometry.getAttribute('position').count/3;
 for(let tri=0;tri<triangles;tri++){
  const face=sideAt(mesh,tri,root,kind);
  samples[face||'edge'].push(materialAt(mesh,tri));
 }
 assert(samples.front.length>=2&&samples.back.length>=2,
  'Both visible sides must have real triangles with their own materials');
 assert(samples.front.every(mat=>mat.name.includes('stone')),
  kind+' front face must contain stone only');
 assert(samples.back.every(mat=>mat.name.includes('plaster')),
  kind+' back face must contain plaster only');
 assert(samples.edge.every(mat=>mat===source),
  kind+' edge material should stay original');
 assert(samples.front[0].map&&samples.back[0].map,
  'Stone and plaster need independent textures');
 assert.notStrictEqual(samples.front[0].map,samples.back[0].map,
  'Stone and plaster must not use the same texture');
 assert.deepEqual(Array.from(original.getAttribute('uv').array),sourceUV,
  'Original geometry must not change');
 assert.strictEqual(mesh.geometry.index,null,
  'Face-group export must have non-indexed triangles');
 assert(root.position.equals(before),'Applying a face finish must not move the slab');
 // Object can be rotated after painting and should keep both side assignments.
 root.rotation.y=Math.PI*.5;
 root.updateWorldMatrix(true,true);
 let rerender=M.applyFaces(root,{style:'none'},sides,new Map(),{kind,category:kind});
 assert(rerender.ok&&rerender.faces===1);
 assert(mesh.material.some(mat=>mat.name.includes('stone'))&&
  mesh.material.some(mat=>mat.name.includes('plaster')));
 // Reset one surface while retaining the other.
 rerender=M.applyFaces(root,{style:'none'},
  {front:{style:'stone'}},new Map(),{kind,category:kind});
 assert(rerender.ok);
 assert(mesh.material.some(mat=>mat.name.includes('stone')));
 assert(!mesh.material.some(mat=>mat.name.includes('plaster')));
 // Return to base; no invisible duplicate faces.
 rerender=M.applyFaces(root,{style:'none'},{},new Map(),{kind,category:kind});
 assert(rerender.ok);
 assert.strictEqual(mesh.geometry,original);
 assert.strictEqual(mesh.material,source);
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['textureFaceScope','btnPickTextureFace','textureFaceStatus'])
 assert(html.includes('id="'+id+'"'),'Missing two-face control '+id);
for(const token of ['surfaceSides:SurfaceMaterials.normalizeSides(config.surfaceSides)',
 'surfaceSides:SurfaceMaterials.normalizeSides(obj.surfaceSides)',
 'surfaceSides:SurfaceMaterials.normalizeSides(source.surfaceSides)',
 'this.pickTextureFace(e)','applyFaces(root,settings,sides,this.textureCache',
 "['front','back'].includes(selected)"])
 assert(app.includes(token),'Dual-face paint/persistence missing: '+token);
assert(M.labels.plaster.includes('Штукатурка'),'Plaster should be selectable in UI');
global.document=oldDocument;
console.log('Independent stone/plaster for wall sides and slab faces, GLB groups, reset and save OK');
