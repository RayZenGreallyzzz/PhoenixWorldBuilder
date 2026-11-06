const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.SurfaceWorkshop=require(path.join(base,'js/surface-workshop.js'));
const Workshop=global.SurfaceWorkshop;
const Materials=require(path.join(base,'js/surface-materials.js'));
const G=require(path.join(base,'js/clean-geometry.js'));
const MeshEdit=require(path.join(base,'js/clean-mesh-edit.js'));
const near=(actual,expected,name,t=.03)=>assert(Math.abs(actual-expected)<=t,
 name+': '+actual+' vs '+expected);
const all=attr=>Array.from(attr.array);
const style=(mapping='repeat',extra={})=>({
 style:'custom',imageId:'texture:stone',mapping,repeat:1,tileMeters:1,
 color:'#ffffff',roughness:.98,metalness:0,...extra});
const image=()=>new THREE.DataTexture(
 new Uint8Array([155,147,134,255,170,164,152,255,180,175,170,255,110,104,100,255]),
 2,2,THREE.RGBAFormat);
function apply(root,descriptor,kind,texture=image()){
 const result=Materials.apply(root,descriptor,texture,{kind});
 assert(result.ok,result.reason||'Texture projection failure');
 return result;
}
{
 const norm=Materials.normalize({
  style:'stone',mapping:'repeat',tileMeters:.4,imageScale:1.8,
  rotation:30,offsetU:.075,offsetV:-.1,roughness:.95,
  metalness:0,relief:.4,applyFrames:true
 });
 assert.equal(norm.tileMeters,.4);assert.equal(norm.imageScale,1.8);
 assert.equal(norm.rotation,30);assert.equal(norm.applyFrames,true);
 assert.equal(norm.roughness,.95);assert.equal(norm.relief,.4);
 assert.equal(Materials.normalize({mapping:'bad',roughness:8,metalness:-10,relief:-9}).mapping,'auto');
 assert.equal(Materials.normalize({mapping:'bad',roughness:8,metalness:-10,relief:-9}).roughness,1);
 assert.equal(Materials.normalize({metalness:-10}).metalness,0);
 assert.equal(Materials.normalize({relief:-9}).relief,0);
 assert.equal(Materials.normalize({style:'stone'}).roughness,.92,'Stone defaults matte');
 assert.equal(Materials.normalize({style:'metal'}).metalness,.7,'Metal retains metallic finish');
}
{
 const source=G.create('wall'),mesh=source.children[0],originalGeometry=mesh.geometry,
  originalUV=all(originalGeometry.getAttribute('uv')),
  originalMaterial=mesh.material;
 source.position.set(3.237,0,-5.004);source.updateWorldMatrix(true,true);
 const result=apply(source,style(),'wall');
 assert(result.changed&&result.mode==='repeat'&&result.mapped===1);
 assert.notStrictEqual(mesh.geometry,originalGeometry,'World UV is per-instance');
 assert.notStrictEqual(mesh.material,originalMaterial,'PBR material is per-instance');
 assert.equal(mesh.material.roughness,.98,'No glossy fake stone finish');
 assert.equal(mesh.material.metalness,0);
 const uv=mesh.geometry.getAttribute('uv');
 assert(uv.count>0);
 const ranges=[0,1].map(i=>{
  const a=[];for(let n=0;n<uv.count;n++)a.push(uv.array[n*2+i]);
  return Math.max(...a)-Math.min(...a);
 });
 assert(ranges[0]>=1.8&&ranges[1]>=2,
  'Wall UV uses metres, not one tiny triangle tile');
 assert.deepEqual(all(originalGeometry.getAttribute('uv')),originalUV,
  'GLB/catalog original UV never mutated');
 assert.strictEqual(originalMaterial.map,null,'Original GLB/catalog PBR remains unchanged');
 const once=all(uv);
 apply(source,style(),'wall');
 assert.deepEqual(all(mesh.geometry.getAttribute('uv')),once,
  'Repeated edits do not stack UV transforms or drift');
 assert.equal(mesh.material.roughness,.98);
 const altered=apply(source,style('repeat',{offsetU:.25,rotation:90}),'wall');
 assert(altered.mapped===1);
 assert.notDeepEqual(all(mesh.geometry.getAttribute('uv')),once,
  'Rotation/offset actually change UV without changing geometry vertices');
}
{
 const arc=G.create('arc180'),mesh=arc.children[0];
 const original=all(mesh.geometry.getAttribute('uv'));
 const curved=Workshop.project(arc,mesh,mesh.geometry,style(),'arc180');
 assert(curved,'Real UV generated for semi-circle');
 const uv=curved.getAttribute('uv'),vals=[];
 for(let i=0;i<uv.count;i++)vals.push(uv.getX(i));
 assert(Math.max(...vals)-Math.min(...vals)>5,
  'Arc side texture uses ~6.28 metres of curvature, not per-triangle UV');
 assert.deepEqual(all(mesh.geometry.getAttribute('uv')),original,
  'Arc mapping does not destroy source UV');
 curved.dispose();
 // Ellipse uses actual transformed physical curve length, not a circular guess.
 arc.scale.set(1.45,1,.82);arc.updateWorldMatrix(true,true);
 const lengths=Workshop.curveLengths(arc,'arc180');
 assert(lengths.length>5&&lengths.length<9);
 const elliptical=Workshop.project(arc,mesh,mesh.geometry,style(),'arc180');
 const result=elliptical.getAttribute('uv');
 assert(result.getX(result.count-25)>0,
  'UV generated on non-uniformly scaled elliptical wall');
 elliptical.dispose();
}
{
 // Older GLBs keep their authored UVs by default, while explicit 'repeat'
 // remaps only a private copy. Animation skeleton geometry is untouched.
 const scene=new THREE.Group(),g=new THREE.BoxGeometry(2,1,1),
  m=new THREE.Mesh(g,new THREE.MeshStandardMaterial());
 scene.add(m);
 const saved=all(g.getAttribute('uv'));
 apply(scene,style('auto'),'glb:imported');
 const expected=g.toNonIndexed().getAttribute('uv');
 assert.deepEqual(all(m.geometry.getAttribute('uv')),all(expected),
  'Imported GLB authored UVs remain pixel-identical under Auto');
 assert.deepEqual(all(g.getAttribute('uv')),saved);
 const skeleton=new THREE.Group(),skin=new THREE.SkinnedMesh(g,
  new THREE.MeshStandardMaterial());
 skeleton.add(skin);
 apply(skeleton,style('repeat'),'glb:character');
 assert.strictEqual(skin.geometry,g,
  'Workshop cannot destructively reproject skinned character meshes');
 assert.equal(MeshEdit.check(skeleton).ok,false,
  'Existing static mesh editor still protects skeletons');
}
{
 const root=G.create('wall'),frame=new THREE.Mesh(new THREE.BoxGeometry(.12,2.1,.2),
  new THREE.MeshStandardMaterial()),glass=new THREE.Mesh(
   new THREE.BoxGeometry(.4,.6,.02),new THREE.MeshStandardMaterial());
 frame.name='frame:left';glass.name='window:glass';
 frame.userData.phoenixInsert=glass.userData.phoenixInsert=true;
 root.add(frame,glass);
 const originalGlass=glass.material,originalFrame=frame.material;
 apply(root,style('repeat',{applyFrames:true}),'wall');
 assert.notStrictEqual(frame.material,originalFrame,
  'Window/door frames may be painted on user request');
 assert.strictEqual(glass.material,originalGlass,
  'Transparency and glass must never be painted opaque');
}
{
 // Real GLB export includes both MetallicRoughness and the normalMap image,
 // plus all material regions of an imported multi-material mesh.
 const canvas={width:256,height:256,getContext(){return {drawImage() {}}},
  toBlob(cb){cb(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],
   {type:'image/png'}))}};
 global.document={createElement:()=>canvas};
 const texture=image();
 texture.image={width:2,height:2,data:new Uint8Array(16)};
 const root=new THREE.Group(),box=new THREE.BoxGeometry(2,2,.2);
 const baseMat=new THREE.MeshStandardMaterial({roughness:.97,metalness:.02});
 baseMat.map=texture;baseMat.normalMap=texture;baseMat.normalScale.set(.4,.4);
 const mat2=new THREE.MeshStandardMaterial({roughness:.4,metalness:.8});
 const object=new THREE.Mesh(box,[baseMat,mat2]);
 root.add(object);root.position.set(3.237,0,-.004);
 root.updateWorldMatrix(true,true);
 const context=vm.createContext({THREE,Blob,document:global.document,TextEncoder,
  TextDecoder,Uint8Array,Uint16Array,Uint32Array,Float32Array,ArrayBuffer,DataView,
  console,Math});
 vm.runInContext(fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8'),context);
 context.sceneData={objects:[{mesh:root}]};
 const run=vm.runInContext(
  'SceneExporter.build(sceneData,{houseOnly:true,keepWorldCoordinates:true})',context);
 Promise.resolve(run).then(async blob=>{
  const buffer=await blob.arrayBuffer(),view=new DataView(buffer);
  assert.equal(view.getUint32(0,true),0x46546c67,'Valid binary GLB magic');
  const length=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  assert(json.meshes[0].primitives.length>=2,
   'GLB exports distinct material regions in one imported mesh');
  assert(json.materials.some(m=>m.normalTexture&&m.normalTexture.scale===.4),
   'Actual normal map is embedded in GLB');
  assert(json.materials.some(m=>m.pbrMetallicRoughness.roughnessFactor===.97),
   'Matte PBR roughness preserved in GLB');
  assert(json.materials.some(m=>m.pbrMetallicRoughness.metallicFactor===.8),
   'Metallic region remains separate in GLB');
  assert.equal(json.nodes[0].matrix[12],3.237);
  assert(json.images.length>=1);
  console.log('Mesh Workshop: world/arc UV, matte PBR, safe GLB editing, glass protection, multi-material GLB and normal map OK');
 }).catch(error=>{console.error(error);process.exitCode=1});
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['textureMapping','textureTileMeters','textureImageScale',
 'textureOffsetU','textureOffsetV','textureRotation','textureRoughness',
 'textureMetalness','textureRelief','textureApplyFrames','btnSurfaceAllWalls'])
 assert(html.includes('id="'+id+'"'),'Missing Mesh Workshop control '+id);
assert(html.indexOf('js/surface-workshop.js')<html.indexOf('js/surface-materials.js'));
assert(html.indexOf('js/surface-materials.js')<html.indexOf('js/clean-app.js'));
for(const token of ['SurfaceMaterials.normalize','surfaceFromControls(obj)',
 'applySurfaceToAllWalls(){','mapping:mode'])
 assert(app.includes(token),'Workshop settings not saved in Builder: '+token);
