const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base=path.resolve(__dirname,'../app/src/main/assets/js');global.document={createElementNS:()=>({addEventListener:()=>{},removeEventListener:()=>{},set src(x){}})};
const THREE=require(path.join(base,'three.min.js'));
const context=vm.createContext({THREE,console,Blob,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Float32Array,DataView,URL});
for(const f of ['glb-loader.js','export-glb.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),context);
const dims=(w,h)=>vm.runInContext('SceneExporter.textureDimensions('+w+','+h+')',context);
assert.deepStrictEqual(JSON.parse(JSON.stringify(dims(2080,756))),{width:2080,height:756},
 'Wide wall image must retain all 2080 original horizontal pixels');
assert.deepStrictEqual(JSON.parse(JSON.stringify(dims(4000,1000))),{width:4000,height:1000},
 'Wide JPEG must not be reduced to 2048px in exported GLB');
assert.deepStrictEqual(JSON.parse(JSON.stringify(dims(4096,4096))),{width:2048,height:2048},
 'Large square is reduced only to stay inside the Android pixel budget');
const long=dims(10000,800);
assert(long.width<=4096&&long.height>=1&&long.width*long.height<=2048*2048,
 'Extreme panoramas must be clamped to the edge and pixel limits');
const appText=fs.readFileSync(path.join(base,'app.js'),'utf8');
assert(appText.includes("Date.now().toString(36)+'-'+Math.random().toString(36)"),
 'New imports of identically named PNG/JPEG need unique cache keys');
(async()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:'red'}));mesh.position.set(4,3,2);const w={terrain:mesh,objects:[]};context.w=w;
 const blob=await vm.runInContext('SceneExporter.build(w)',context);const ab=await blob.arrayBuffer();context.buf=ab;
 const result=await vm.runInContext('GLB.load({arrayBuffer:()=>Promise.resolve(buf)})',context);assert(result.triangles===12);let m=null;result.root.traverse(o=>{if(o.isMesh)m=o});assert(m);assert(m.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(4,3,2))<.001);console.log('GLB export/import roundtrip OK',ab.byteLength,'bytes');
})().catch(e=>{console.error(e);process.exit(1)});
