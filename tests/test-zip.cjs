const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const content=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/js/zip-helper.js'),'utf8');
const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,Response,DecompressionStream,console,window:{DecompressionStream}});vm.runInContext(content,ctx);
(async()=>{
 const round=await vm.runInContext("ZipUtils.build({'models/demo.glb':new Uint8Array([1,2,3,4]),'project.json':'{\"hello\":1}'})",ctx);ctx.round=round;
 const unpack=await vm.runInContext('ZipUtils.extract(round)',ctx);assert.deepEqual([...unpack['models/demo.glb']],[1,2,3,4]);assert.equal(new TextDecoder().decode(unpack['project.json']),'{"hello":1}');
 console.log('ZIP round-trip OK:',Object.keys(unpack).length,'files');
 if(process.env.TEST_FULL_ZIP){ctx.real=new Blob([fs.readFileSync(process.env.TEST_FULL_ZIP)]);const real=await vm.runInContext('ZipUtils.extract(real)',ctx);assert(Object.keys(real).length>1000);console.log('Real LifeAfter archive unzip OK:',Object.keys(real).length);}
})().catch(e=>{console.error(e);process.exit(1)});
