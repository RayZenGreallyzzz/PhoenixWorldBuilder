/* User's tablet UI regression: fixed 3 tabs, folded import menus, no
 * rearrangement of RIGHT inspector, quick separate materials on each face,
 * and working offline non-GLB import into one GLB per model.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
const ids=['tabParts','tabTextures','tabCharacter','libraryModuleDrawer',
 'textureLibrary','libraryCharacterDrawer','catalogImport','importModel',
 'importOtherModel','importZip','importTexture','importTextureZIP',
 'textureUploadFold','textureImportQuality','importAvatar','textureFaceScope',
 'faceQuickAll','faceQuickFront','faceQuickBack','faceQuickPick',
 'faceQuickSettings','faceQuickTarget'];
for(const id of ids){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,
  'Each control must appear exactly once: '+id);
}
assert(html.indexOf('tabParts')<html.indexOf('tabTextures'));
assert(html.indexOf('tabTextures')<html.indexOf('tabCharacter'));
assert(html.indexOf('libraryModuleDrawer')<html.indexOf('textureLibrary'));
assert(html.indexOf('textureLibrary')<html.indexOf('libraryCharacterDrawer'));
const right=html.slice(html.indexOf('<section id="inspector"'),
 html.indexOf('<script src="js/three.min.js">'));
for(const id of ['textureInspector','btnPickTextureFace','btnApplyTexture',
 'textureFaceScope','btnClearTexture','textureAlignPanel','openingPanel',
 'gizmoPanel','sceneManagerPanel','roomBuilderPanel']){
 assert(right.includes('id="'+id+'"'),'Original RIGHT control must remain: '+id);
}
assert(css.includes('.libraryDrawer')&&css.includes('.drawerFold'));
assert(css.includes('.faceQuickChoices'),'Side painting must be finger friendly');
assert(html.indexOf('js/model-formats.js')<html.indexOf('js/clean-app.js'));
for(const token of [
 'setTextureTab(active=',"$('libraryModuleDrawer').hidden",
 "$('libraryCharacterDrawer').hidden","$('textureLibrary').hidden",
 'quickTextureFace(side){','syncQuickTextureFaces(){',
 'openTextureSettings(){','this.importOtherModel(',
 'this.importZIP(file,\'textures\')',
 "this.setTextureTab('character')",
 "this.avatarRoot=root"
]){
 assert(app.includes(token),'Import/texture UI wiring missing: '+token);
}
const Catalog=require(path.join(base,'js/smart-catalog.js'));
for(const name of ['arch.fbx','chair.obj','tree.vox','part.stl','building.ply',
 'room.gltf','room.glb'])
 assert.equal(Catalog.classify('Стены/'+name).type,'model','ZIP model '+name);
for(const name of ['stone.png','wall.jpg','plaster.jpeg','metal.webp','floor.bmp','banner.gif'])
 assert.equal(Catalog.classify('Текстуры/'+name).type,'texture','ZIP texture '+name);
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
for(const loader of ['OBJLoader','VOXLoader','STLLoader','PLYLoader','FBXLoader']){
 require(path.join(base,'js/'+loader+'.js'));
 assert.equal(typeof T[loader],'function','Offline loader missing '+loader);
}
global.fflate=require(path.join(base,'js/fflate.min.js'));
const ctx=vm.createContext({THREE:T,Blob,TextEncoder,TextDecoder,Uint8Array,
 Uint16Array,Uint32Array,Float32Array,ArrayBuffer,DataView,Math,console});
vm.runInContext(fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8'),ctx);
global.SceneExporter=vm.runInContext('SceneExporter',ctx);
const Formats=require(path.join(base,'js/model-formats.js'));
assert.deepEqual(Formats.supported,['glb','gltf','fbx','obj','vox','stl','ply']);
assert(Formats.accepts('knight.fbx','character'));
assert(!Formats.accepts('knight.obj','character'),'OBJ is NOT an animated character format');
const file=(name,text)=>({name,size:Buffer.byteLength(text),
 arrayBuffer:async()=>Uint8Array.from(Buffer.from(text)).buffer});
const obj='o Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n';
const stl='solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle\n';
const ply='ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n';
const vox=(()=>{
 const out=new Uint8Array(8+24+20),v=new DataView(out.buffer);
 out.set([86,79,88,32],0);v.setUint32(4,150,true);
 out.set([83,73,90,69],8);v.setUint32(12,12,true);
 v.setUint32(20,1,true);v.setUint32(24,1,true);v.setUint32(28,1,true);
 out.set([88,89,90,73],32);v.setUint32(36,8,true);
 v.setUint32(44,1,true);out.set([0,0,0,1],48);
 return {name:'voxel.vox',size:out.length,arrayBuffer:async()=>out.buffer};
})();
(async()=>{
 for(const [name,input] of [['mesh.obj',obj],['triangle.stl',stl],['triangle.ply',ply]]){
  const model=await Formats.parse(file(name,input));
  assert(model.triangles>=1,name+' must produce geometry');
  const converted=await Formats.convertModule(file(name,input));
  assert(converted.buffer.byteLength>64);
  assert.equal(new DataView(converted.buffer).getUint32(0,true),0x46546c67);
  assert.equal(new DataView(converted.buffer).getUint32(4,true),2);
 }
 const voxed=await Formats.parse(vox);
 assert(voxed.triangles>0,'MagicaVoxel should have actual cubes/triangles');
 const voxglb=await Formats.convertModule(vox);
 assert(voxglb.buffer.byteLength>100);
 assert.deepEqual(Formats.ext('A.FBX'),'fbx');
 console.log('Compact tabs and real offline OBJ/VOX/STL/PLY -> GLB, FBX loader, multi-face painting and right inspector stable OK');
})().catch(error=>{console.error(error);process.exitCode=1});
