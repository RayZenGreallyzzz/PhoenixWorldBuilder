const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
const PhoenixFiles=require(path.join(base,'js/phoenix-files.js'));
const THREE=require(path.join(base,'js/three.min.js'));
(async()=>{
 const big=new Uint8Array(3*1024*1024+9);
 for(let i=0;i<big.length;i++)big[i]=(i*7+31)&255;
 const model=new Uint8Array([1,2,3,4,5,0,254,255]);
 const source=new Map([['texture:large-png',big.buffer],['glb:ornament',model.buffer]]);
 const project={version:2,objects:[{kind:'wall',id:2,position:[1.237,0,-.004],
  surface:{style:'custom',imageId:'texture:large-png'}}]};
 const text=[{id:'texture:large-png',name:'stone pattern.png',type:'image/png'}];
 const packed=await PhoenixFiles.packageProject(project,text,
  ['wall','glb:ornament'],id=>source.get(id));
 assert.equal(packed.format,'PhoenixBuilderBackupV1');
 assert.equal(packed.assets.length,2,'Backup embeds full original GLB and texture data');
 const read=new Map();
 const unpacked=await PhoenixFiles.unpackProject(packed,async(id,array)=>read.set(id,array));
 assert.equal(unpacked.project.objects[0].position[0],1.237,'Precise coordinates survive backup');
 assert.deepEqual(new Uint8Array(read.get('texture:large-png')),big,
  'Large PNG over former 3MB limit is not corrupted by chunked base64');
 assert.deepEqual(new Uint8Array(read.get('glb:ornament')),model);
 assert.equal(unpacked.textures[0].name,'stone pattern.png');
 assert.equal(PhoenixFiles.validImageType({name:'a.JPG',type:''}),'image/jpeg',
  'Android chooser may omit MIME for JPEG');
 await assert.rejects(PhoenixFiles.unpackProject({format:'bad'},()=>{}),
  /Нужна резервная копия/);
 // Android SAF bridge must receive binary bytes with no padding corruption
 // at chunk boundaries, including a >3MB file.
 const chunks=[];
 global.window={NativeBridge:{
  beginSave:(name,mime)=>{assert.equal(name,'PhoenixModel.glb');assert.equal(mime,'model/gltf-binary')},
  appendSaveChunk:chunk=>chunks.push(Buffer.from(chunk,'base64')),
  finishSave:()=>{chunks.push(Buffer.from([]))}
 }};
 const out=await PhoenixFiles.saveBlob(new Blob([big],{type:'model/gltf-binary'}),
  'PhoenixModel.glb','model/gltf-binary');
 assert.equal(out.native,true);
 assert.deepEqual(new Uint8Array(Buffer.concat(chunks)),big);
 delete global.window;
 // Test the high resolution dimensions, not input FILE bytes. This input
 // intentionally says 20MB and must be accepted.
 global.createImageBitmap=async()=>({width:8192,height:4096,close(){}});
 let draw=null;
 global.document={createElement:()=>({
  width:0,height:0,
  getContext(){return {imageSmoothingEnabled:false,imageSmoothingQuality:'low',
   drawImage:(_image,_x,_y,w,h)=>{draw=[w,h]}}},
  toBlob:cb=>cb(new Blob([new Uint8Array(4096)],{type:'image/webp'}))
 })};
 const processed=await PhoenixFiles.prepareTexture(
  {type:'image/png',name:'large.png',size:20*1024*1024},4096);
 assert.equal(processed.sourceBytes,20*1024*1024);
 assert.equal(processed.width,4096);assert.equal(processed.height,2048);
 assert.deepEqual(draw,[4096,2048]);
 assert.equal(processed.type,'image/webp');
 delete global.createImageBitmap;delete global.document;
 // SceneExporter exports placed geometry as a real GLB, not a JSON file.
 const vmContext=vm.createContext({THREE,Blob,TextEncoder,TextDecoder,URL,
  Uint8Array,Uint16Array,Uint32Array,Float32Array,DataView,ArrayBuffer,console,Math});
 vm.runInContext(fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8'),vmContext);
 const root=new THREE.Group();root.name='wall from Phoenix';
 root.position.set(7.237,0,-1.004);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,0.2),
  new THREE.MeshStandardMaterial({color:0xf5deb3}));root.add(mesh);
 root.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),
  new THREE.MeshStandardMaterial()),{userData:{phoenixLODProxy:true}}));
 vmContext.sceneData={objects:[{mesh:root}]};
 const blob=await vm.runInContext(
  'SceneExporter.build(sceneData,{houseOnly:true,keepWorldCoordinates:true})',vmContext);
 const glb=await blob.arrayBuffer(),dv=new DataView(glb);
 assert.equal(dv.getUint32(0,true),0x46546c67,'GLB magic glTF binary');
 assert.equal(dv.getUint32(4,true),2,'GLB v2');
 const jsonLen=dv.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,jsonLen)));
 assert.equal(json.meshes.length,1,'Do not export extra runtime LOD geometry');
 assert(Math.abs(json.nodes[0].matrix[12]-7.237)<.001,
  'Export preserves original X scene position, never recenters house');
 assert(Math.abs(json.nodes[0].matrix[14]+1.004)<.001,
  'Export preserves original Z scene position');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 const java=fs.readFileSync(path.resolve(base,'../java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
 for(const id of ['btnQuickOpening','btnExportGLB','btnBackupProject',
  'btnImportBackup','textureLibraryStatus','importProjectBackup'])
  assert(html.includes('id="'+id+'"'),'Missing accessible file/cut UI '+id);
 assert(html.indexOf('js/export-glb.js')<html.indexOf('js/clean-app.js'),
  'GLB exporter must load before editor');
 for(const term of ['PhoenixFiles.prepareTexture','PhoenixFiles.saveBlob',
  'PhoenixFiles.packageProject','PhoenixFiles.unpackProject',
  'this.setMode(\'build\');','this.pendingTexture','async exportGLB()',
  'async exportBackup()','async importBackup(file)'])
  assert(app.includes(term),'Save, cut or textures not wired: '+term);
 assert(!app.includes('file.size>3*1024*1024'),'Old 3MB file limit must be removed');
 assert(java.includes('window.PhoenixClean.save()'),
  'Android Save and Exit must use the editor actually running in the WebView');
 console.log('Portable project backup incl. >3MB texture/GLB, Android SAF file save, GLB positions, drone cut and persistence OK');
})().catch(err=>{console.error(err);process.exit(1)});
