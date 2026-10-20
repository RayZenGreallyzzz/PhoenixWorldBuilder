const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const content=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/js/zip-helper.js'),'utf8');
const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,Response,DecompressionStream,console,window:{DecompressionStream}});vm.runInContext(content,ctx);
(async()=>{
 const round=await vm.runInContext("ZipUtils.build({'models/demo.glb':new Uint8Array([1,2,3,4]),'project.json':'{\"hello\":1}'})",ctx);ctx.round=round;
 const unpack=await vm.runInContext('ZipUtils.extract(round)',ctx);assert.deepEqual([...unpack['models/demo.glb']],[1,2,3,4]);assert.equal(new TextDecoder().decode(unpack['project.json']),'{"hello":1}');
 console.log('ZIP round-trip OK:',Object.keys(unpack).length,'files');
 // A ZIP written by Android/Windows may set bit 3, store file sizes only
 // in the central directory and append a data descriptor after file bytes.
 const packed=await vm.runInContext("ZipUtils.build({'models/with-descriptor.glb':new Uint8Array([7,8,9])})",ctx);
 const source=new Uint8Array(await packed.arrayBuffer());
 const srcView=new DataView(source.buffer);
 const originalCd=srcView.getUint32(source.length-6,true);
 const suffix=source.slice(originalCd);
 const edited=new Uint8Array(source.length+16);
 edited.set(source.slice(0,originalCd));edited.set(suffix,originalCd+16);
 const data=new DataView(edited.buffer);
 data.setUint32(originalCd,0x08074b50,true);
 data.setUint32(originalCd+4,srcView.getUint32(14,true),true);
 data.setUint32(originalCd+8,3,true);data.setUint32(originalCd+12,3,true);
 data.setUint16(6,0x800|8,true);data.setUint32(18,0,true);data.setUint32(22,0,true);
 data.setUint16(originalCd+16+8,0x800|8,true);
 data.setUint32(edited.length-6,originalCd+16,true);
 ctx.descriptorZip=new Blob([edited]);
 const descriptorFiles=await vm.runInContext('ZipUtils.extract(descriptorZip)',ctx);
 assert.deepEqual([...descriptorFiles['models/with-descriptor.glb']],[7,8,9],
  'Central-directory parser must support data descriptor archives');
 if(process.env.TEST_FULL_ZIP){ctx.real=new Blob([fs.readFileSync(process.env.TEST_FULL_ZIP)]);const real=await vm.runInContext('ZipUtils.extract(real)',ctx);assert(Object.keys(real).length>1000);console.log('Real LifeAfter archive unzip OK:',Object.keys(real).length);}
})().catch(e=>{console.error(e);process.exit(1)});
