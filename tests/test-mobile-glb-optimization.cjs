const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.MeshoptDecoder=require(path.join(base,'js/meshopt_decoder.js'));
global.MeshoptSimplifier=require(path.join(base,'js/meshopt_simplifier.js'));
require(path.join(base,'js/GLTFLoader.js'));
require(path.join(base,'js/WorkerPool.js'));
require(path.join(base,'js/DRACOLoader.js'));
require(path.join(base,'js/KTX2Loader.js'));
const MeshoptEncoder=require('./vendor/meshopt_encoder.js');
const GLB=require(path.join(base,'js/glb-loader.js'));
const LOD=require(path.join(base,'js/android-lod.js'));
const AssetOpt=require(path.join(base,'js/android-asset-opt.js'));
const pad4=length=>Math.ceil(length/4)*4;
function glb(json,bytes){
 const jsonBytes=Buffer.from(JSON.stringify(json),'utf8');
 const jsonLen=pad4(jsonBytes.length),binLen=pad4(bytes.length);
 const result=Buffer.alloc(12+8+jsonLen+8+binLen,0);
 result.writeUInt32LE(0x46546c67,0);
 result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
 result.writeUInt32LE(jsonLen,12);result.writeUInt32LE(0x4e4f534a,16);
 result.fill(0x20,20,20+jsonLen);
 jsonBytes.copy(result,20);
 result.writeUInt32LE(binLen,20+jsonLen);
 result.writeUInt32LE(0x004e4942,24+jsonLen);
 Buffer.from(bytes).copy(result,28+jsonLen);
 return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength);
}
async function testMeshopt(){
 await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
 const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const inds=new Uint16Array([0,1,2]);
 const encPosition=MeshoptEncoder.encodeGltfBuffer(new Uint8Array(positions.buffer),
  3,12,'ATTRIBUTES');
 const encIndices=MeshoptEncoder.encodeGltfBuffer(new Uint8Array(inds.buffer),
  3,2,'TRIANGLES');
 const bytes=new Uint8Array(encPosition.length+encIndices.length);
 bytes.set(encPosition);bytes.set(encIndices,encPosition.length);
 const info={
  asset:{version:'2.0',generator:'Phoenix meshopt regression'},
  extensionsUsed:['EXT_meshopt_compression'],
  extensionsRequired:['EXT_meshopt_compression'],
  buffers:[{byteLength:bytes.length}],
  bufferViews:[
   {buffer:0,byteOffset:0,byteLength:36,
    extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:0,
     byteLength:encPosition.length,byteStride:12,count:3,mode:'ATTRIBUTES',filter:'NONE'}}},
   {buffer:0,byteOffset:0,byteLength:6,
    extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:encPosition.length,
     byteLength:encIndices.length,byteStride:2,count:3,mode:'TRIANGLES',filter:'NONE'}}}
  ],
  accessors:[
   {bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},
   {bufferView:1,componentType:5123,count:3,type:'SCALAR'}
  ],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
  nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0
 };
 const payload=glb(info,bytes);
 const inspect=GLB.inspect(payload);
 assert(inspect.compressed&&inspect.extensions.includes('EXT_meshopt_compression'));
 assert.equal(inspect.bytes,payload.byteLength);
 const res=await GLB.load(payload);
 let count=0;res.root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count||0)/3});
 assert.equal(count,1,'Real Meshopt-compressed GLB must decode correct indexed triangle');
 assert.equal(res.animations.length,0);
 assert.equal(res.info.triangles,1);
}
async function testLOD(){
 await MeshoptSimplifier.ready;
 const root=new THREE.Group(),hi=new THREE.Mesh(
  new THREE.SphereGeometry(1.6,66,44),new THREE.MeshStandardMaterial({color:0xbbaa99}));
 hi.name='rock-static';root.add(hi);
 const original=hi.geometry,originalUV=original.attributes.uv,originalIndices=original.index.count;
 const result=await LOD.prepare(root,[],{enabled:true,near:12,far:30});
 assert.equal(result.attached,1,'Static indexed mesh must get LOD');
 assert.equal(root.children.length,1);
 const group=root.children[0];
 assert(group.isLOD&&group.levels.length===3,'LOD tiers: original, medium and far');
 assert.equal(group.levels[0].object,hi,'Near view keeps exact original mesh');
 assert.strictEqual(hi.geometry,original,'Original GLB mesh geometry is not modified');
 const medium=group.levels[1].object,far=group.levels[2].object;
 assert(medium.geometry.index.count<originalIndices,'Medium triangles reduced');
 assert(far.geometry.index.count<medium.geometry.index.count,'Far triangles reduced again');
 assert.strictEqual(medium.geometry.attributes.uv,originalUV,'UV buffer shared, not lost');
 assert.strictEqual(far.material,hi.material,'PBR material preserved');
 LOD.setEnabled(root,false);
 assert(group.levels[0].object.visible&&!group.levels[1].object.visible);
 const modelAnimated=new THREE.Group();
 modelAnimated.add(new THREE.Mesh(new THREE.SphereGeometry(1,66,44)));
 assert.equal((await LOD.prepare(modelAnimated,[{name:'walk'}])).attached,0,
  'Animation clips prevent LOD from changing node hierarchy');
 const skinned=new THREE.SkinnedMesh(new THREE.SphereGeometry(1,66,44));
 assert.equal(LOD.eligible(skinned,false),false,'Skinned mesh is protected');
 const hinged=new THREE.Group();hinged.name='door:hinge';
 hinged.add(new THREE.Mesh(new THREE.SphereGeometry(1,66,44)));
 assert.equal((await LOD.prepare(hinged,[])).attached,0,
  'Door hinges and editable moving parts are protected');
 const staleRoot=new THREE.Group();
 const staleMesh=new THREE.Mesh(new THREE.SphereGeometry(1,66,44));
 staleMesh.name='rock-stale';staleRoot.add(staleMesh);
 const staleResult=await LOD.prepare(staleRoot,[],{
  enabled:true,shouldAbort:()=>true
 });
 assert.equal(staleResult.skipped,'stale','Obsolete async LOD job gets cancelled');
 assert.strictEqual(staleRoot.children[0],staleMesh,'Cancellation leaves mesh intact');
 assert(!staleRoot.children.some(c=>c.isLOD),
  'Deleted/replaced GLB never gets a late LOD mutation');
}
function testMaterials(){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 const root=new THREE.Group();root.add(mesh);
 const input=mesh.material;
 const large=new THREE.Texture({width:4096,height:2048});
 input.map=large;
 // No document in Node — resizing is not attempted, source PBR stays untouched.
 assert.equal(AssetOpt.optimize(root,'balanced').resized,0);
 assert.strictEqual(mesh.material.map,large);
 assert.equal(AssetOpt.budget('battery'),1024);
 assert.equal(AssetOpt.budget('balanced'),2048);
 assert.equal(AssetOpt.budget('original'),Infinity);
}
function testDecoderSetup(){
 const codecs=GLB.configure({extensions:{has:()=>false},capabilities:{isWebGL2:false}});
 assert(codecs.meshopt&&codecs.draco&&codecs.ktx2,
  'All 3 local decoders can be registered against bundled Three.js r140');
 assert.equal(GLB.codecStatus().ktx2,true);
 const names=['draco/draco_wasm_wrapper.js','draco/draco_decoder.js',
  'draco/draco_decoder.wasm','basis/basis_transcoder.js','basis/basis_transcoder.wasm'];
 for(const name of names){
  const asset=path.join(base,'js',name);
  assert(fs.existsSync(asset)&&fs.statSync(asset).size>1000,
   'Offline decoder file must be bundled before APK build: '+name);
 }
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 for(const p of ['js/meshopt_decoder.js','js/meshopt_simplifier.js',
  'js/DRACOLoader.js','js/KTX2Loader.js','js/android-lod.js','js/android-asset-opt.js']){
  assert(html.includes(p),'Missing offline script '+p);
  assert(html.indexOf(p)<html.indexOf('js/clean-app.js'),'Dependency loads before app '+p);
 }
 for(const id of ['optimizationQuality','optimizationLOD','optimizationStats'])
  assert(html.includes('id="'+id+'"'),'Missing optimizer control '+id);
 assert(app.includes('GLB.configure(this.renderer)'),'Decoder not linked to real renderer');
 assert(app.includes('this.attachImportedLOD(entry)'),'LOD not wired into placement');
 assert(app.includes('this.attachImportedLOD(e)'),'LOD not wired into restore');
 assert(app.includes('shouldAbort:isStale'),'Edited/removed models must cancel stale LOD work');
}
(async()=>{testMaterials();testDecoderSetup();await testMeshopt();await testLOD();
 console.log('Compressed GLB Meshopt loading + Draco KTX2 setup + safe static LOD + quality tests OK');
})().catch(err=>{console.error(err);process.exit(1)});
