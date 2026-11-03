const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const folder=path.join(__dirname,'../app/src/main/assets/js');
const source=fs.readFileSync(path.join(folder,'app.js'),'utf8');
const a=source.indexOf('async function loadEmbeddedLibrary(){'),b=source.indexOf('async function bindImportedMaterials(',a);
assert(a>0&&b>a);
const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,Uint32Array,
 DataView,Response,DecompressionStream,console,Map,Set});
vm.runInContext(fs.readFileSync(path.join(folder,'zip-helper.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(folder,'smart-package.js'),'utf8'),ctx);
const entries=[
 {path:'01_Лестницы/винтовая.glb',name:'Винтовая',category:'stairs',
  catalogSection:'01_Лестницы',library:'QRSJ'},
 {path:'03_Полы_и_перекрытия/камень.glb',name:'Камень',category:'foundation',
  catalogSection:'03_Полы_и_перекрытия',library:'LifeAfter'},
 {path:'10_Перила_ограждения_рамы/ограда.glb',name:'Ограда',category:'railing',
  catalogSection:'10_Перила_ограждения_рамы',library:'QRSJ'}
];
const bytes={'metadata.json':JSON.stringify({models:entries,libraryBundleId:'full-demo'})};
entries.forEach((model,i)=>bytes[model.path]=new Uint8Array([i,1,2]));
ctx.files=bytes;
(async()=>{
 const zip=await vm.runInContext('ZipUtils.build(files)',ctx);
 const buffer=await zip.arrayBuffer();
 class FakeXHR{
  open(method,url,async){assert.equal(url,'pwb_architecture_bundle.zip')}
  set responseType(s){assert.equal(s,'arraybuffer')}
  send(){this.response=buffer;this.status=0;this.onload()}
 }
 ctx.XMLHttpRequest=FakeXHR;
 ctx.catalogMeta={'bundle:03_полы_и_перекрытия/камень.glb':
  {category:'ceiling',manualCategory:true}};
 ctx.savedMeta=new Map();ctx.bundledPaths=new Map();ctx.bundledArchive=null;
 ctx.groupType=name=>'prop';
 vm.runInContext(source.slice(a,b),ctx);
 const count=await vm.runInContext('loadEmbeddedLibrary()',ctx);
 assert.equal(count,entries.length);
 assert.equal(ctx.savedMeta.size,entries.length);
 assert.equal(ctx.savedMeta.get('bundle:03_полы_и_перекрытия/камень.glb').category,
  'ceiling','Manual category overrides archive after restart');
 assert.equal(ctx.savedMeta.get('bundle:10_перила_ограждения_рамы/ограда.glb').category,'railing');
 assert.equal(ctx.bundledPaths.size,entries.length,'All bundled assets indexed without decoding GLBs');
 assert(ctx.bundledArchive,'Compressed ZIP retained for lazy access');
 const raw=await ctx.bundledArchive.read(entries[0].path);
 assert.deepEqual([...raw],[0,1,2]);
 assert(source.includes('async function assetBytes(id)'),'Bundled GLBs loaded by existing catalog only on demand');
 assert(source.includes('const embeddedCount=await loadEmbeddedLibrary()'),
  'Optional bundled catalog must initialize before restoring saved projects');
 console.log('Embedded 1,994-library mode indexes lazily; source roles and manual overrides restored OK');
})().catch(e=>{console.error(e);process.exitCode=1});