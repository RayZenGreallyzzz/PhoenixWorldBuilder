const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../app/src/main/assets/js');global.document={createElementNS:()=>({addEventListener:()=>{},removeEventListener:()=>{},set src(x){}})};const THREE=require(path.join(base,'three.min.js'));
const context=vm.createContext({THREE,ArrayBuffer,DataView,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Float32Array,TextDecoder,Blob,URL,console,document:{createElementNS:()=>({addEventListener:()=>{},removeEventListener:()=>{},set src(x){} })}});
vm.runInContext(fs.readFileSync(path.join(base,'glb-loader.js'),'utf8'),context);
async function run(){const glbs=process.env.GLB_SAMPLE?[process.env.GLB_SAMPLE]:fs.readdirSync('/mnt/data/Строительные_модели_РУ/LifeAfter_666').filter(x=>x.endsWith('.glb')).slice(0,5).map(x=>'/mnt/data/Строительные_модели_РУ/LifeAfter_666/'+x);
 for(const name of glbs){let bytes=fs.readFileSync(name);let result=await vm.runInContext('GLB.load({arrayBuffer:()=>Promise.resolve(input)})',Object.assign(context,{input:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));let verts=0;result.root.traverse(o=>{if(o.isMesh)verts+=o.geometry.attributes.position.count});assert(verts>0,'Empty geometry');console.log('OK',path.basename(name),verts,'vertices',Math.round(result.triangles),'triangles');}
}
run().catch(e=>{console.error(e);process.exit(1)});
