const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base=path.resolve(__dirname,'../app/src/main/assets/js');global.document={createElementNS:()=>({addEventListener:()=>{},removeEventListener:()=>{},set src(x){}})};
const THREE=require(path.join(base,'three.min.js'));
const context=vm.createContext({THREE,console,Blob,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Float32Array,DataView,URL});
for(const f of ['glb-loader.js','export-glb.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),context);
(async()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:'red'}));mesh.position.set(4,3,2);const w={terrain:mesh,objects:[]};context.w=w;
 const blob=await vm.runInContext('SceneExporter.build(w)',context);const ab=await blob.arrayBuffer();context.buf=ab;
 const result=await vm.runInContext('GLB.load({arrayBuffer:()=>Promise.resolve(buf)})',context);assert(result.triangles===12);let m=null;result.root.traverse(o=>{if(o.isMesh)m=o});assert(m);assert(m.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(4,3,2))<.001);console.log('GLB export/import roundtrip OK',ab.byteLength,'bytes');
})().catch(e=>{console.error(e);process.exit(1)});
