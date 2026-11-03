const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const context=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,Response,DecompressionStream,console});
vm.runInContext(fs.readFileSync(path.join(dir,'zip-helper.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'smart-package.js'),'utf8'),context);
(async()=>{
 const models=[
  {path:'01_Лестницы/Винтовые/test_лестница.glb',category:'stairs',catalogSection:'01_Лестницы'},
  {path:'02_Стены/test_каменная_стена.glb',category:'wall',catalogSection:'02_Стены'},
  {path:'03_Полы_и_перекрытия/test_пол.glb',category:'foundation',catalogSection:'03_Полы_и_перекрытия'},
  {path:'05_Крыши_и_карнизы/test_крыша.glb',category:'roof',catalogSection:'05_Крыши_и_карнизы'},
  {path:'10_Перила_ограждения_рамы/test_ограждения.glb',category:'railing',catalogSection:'10_Перила_ограждения_рамы'},
  {path:'12_Оптимизированные_GLБ/Пол_камень_LITE.glb',category:'foundation',catalogSection:'12_Оптимизированные_GLБ'}
 ];
 const parts={'metadata.json':JSON.stringify({name:'full',models,isLibraryBundle:true,libraryBundleId:'testing'})};
 models.forEach((m,i)=>{parts[m.path]=new Uint8Array([i,i+1,i+2])});
 context.parts=parts;
 const zip=await vm.runInContext('ZipUtils.build(parts)',context);
 context.zip=zip;
 const opened=await vm.runInContext('ZipUtils.open(zip)',context);
 assert.equal(opened.names.length,models.length+1,'Library index includes metadata and model paths');
 assert.equal(opened.count,models.length+1);
 context.opened=opened;
 const actual=JSON.parse(new TextDecoder().decode(await vm.runInContext("opened.read('metadata.json')",context)));
 assert.equal(actual.models.length,models.length);
 for(let i=0;i<models.length;i++){
  context.key=models[i].path;
  const bytes=await vm.runInContext('opened.read(key)',context);
  assert.deepEqual([...bytes],[i,i+1,i+2],'Lazy model read '+i);
 }
 const plan=vm.runInContext('SmartPackage.analyze(opened.names, '+JSON.stringify(actual)+')',context);
 assert.equal(plan.models.length,models.length);
 for(const m of models){
  const output=plan.models.find(x=>x.path===m.path);
  assert(output,'Model missing '+m.path);
  assert.equal(output.category,m.category,'Explicit structural role must override filename '+m.path);
 }
 assert.equal(vm.runInContext("SmartPackage.normalizeCategory('railing','rail.glb')",context),'railing');
 const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(dir,'../index.html'),'utf8');
 assert(app.includes('const archive=await ZipUtils.open(file)'),'ZIP import uses lazy reader');
 assert(app.includes('const modelByPath=new Map'),'Imported 1,994 model lookup is indexed');
 assert(app.includes('currentSection'),'Fine-grained catalog sections exist');
 assert(app.includes('libraryBundleId')&&app.includes('knownBundlePaths'),
  'Restarting complete library import does not duplicate thousands of models');
 for(const prefix of ['01_','02_','03_','04_','05_','06_','07_','08_','09_','10_','11_','12_'])
  assert(html.includes('data-catalog-section="'+prefix+'"'),'Missing section '+prefix);
 console.log('Lazy ZIP import, 12 catalog subcategories, exact model roles, no repeat-package duplication OK');
})().catch(e=>{console.error(e);process.exitCode=1});