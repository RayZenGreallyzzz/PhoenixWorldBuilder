/* Screenshot/video regression, 1280x800 Android WebView:
 * ZIP inaccessible in nested fold, PNG/JPEG greyed in DocumentsUI,
 * clipped/overlapping catalog widgets and stalls on tab switches.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
const js=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const zip=fs.readFileSync(path.join(base,'js/zip-helper.js'),'utf8');
const android=fs.readFileSync(path.resolve(__dirname,
 '../app/src/main/java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
const once=(id)=>{
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,
  'Missing or duplicate import control: '+id);
};
for(const id of ['tabParts','tabTextures','tabCharacter',
 'libraryModuleDrawer','textureLibrary','libraryCharacterDrawer',
 'moduleQuickImport','textureQuickImport','btnDirectModuleZip',
 'btnDirectModuleFile','btnDirectImage','btnDirectTextureZip',
 'importZip','importUniversalModel','importTexture','importTextureZIP',
 'textureImportStatus','zipQuickStatus','textureUploadFold',
 'textureImportQuality','faceQuickFront','faceQuickBack','textureFaceScope'])
 once(id);
const slice=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end));
const modules=slice('id="libraryModuleDrawer"','id="textureLibrary"');
const textures=slice('id="textureLibrary"','id="libraryCharacterDrawer"');
assert(modules.indexOf('btnDirectModuleZip')<modules.indexOf('catalogImport'),
 'ZIP must be visible ABOVE collapsed advanced import fold');
assert(textures.indexOf('btnDirectImage')<textures.indexOf('textureCategoryFilter'),
 'Image upload must be ABOVE search and painting controls');
assert(textures.indexOf('btnDirectTextureZip')<textures.indexOf('textureQuickFaces'));
assert(!/<input id="importZip"[^>]*accept=/.test(modules),
 'ZIP chooser should not grey Android SAF files by extension');
assert(!/<input id="importTexture"[^>]*accept=/.test(textures));
assert(!/<input id="importTextureZIP"[^>]*accept=/.test(textures));
assert(android.includes('new Intent(Intent.ACTION_OPEN_DOCUMENT)'),
 'Open native Android document picker, not browser filtered media picker');
assert(android.includes('intent.setType("*/*")'),
 'Native SAF must allow ZIP/image documents with application/octet-stream');
assert(!/Intent intent\\s*=\\s*params\\.createIntent\\s*\(/.test(android),
 'HTML accept filters must not leak into native Android MIME_TYPES');
assert(!android.includes('Intent.EXTRA_MIME_TYPES'),
 'Do not reintroduce restrictive Android MIME type filters');
assert(css.includes('#catalog .stickyImportBar')&&
 css.includes('position:sticky;top:0'),
 'Upload controls remain in view while user scrolls the library');
assert(css.includes('#catalog #libraryModuleDrawer{display:block')&&
 css.includes('#catalog #textureLibrary{display:block'),
 'Avoid nested flex import folds and clipped catalog buttons');
assert(js.includes("  $('btnDirectModuleZip').onclick=()=>$('importZip').click();"));
assert(js.includes("  $('btnDirectImage').onclick=()=>$('importTexture').click();"));
assert(js.includes("  $('btnDirectTextureZip').onclick=()=>$('importTextureZIP').click();"));
assert(js.includes("  $('btnDirectModuleFile').onclick=()=>$('importUniversalModel').click();"));
assert(js.includes("   $(pane).scrollTop=0;"),
 'New tab must start at top, making import controls immediately visible');
assert(js.includes('requestAnimationFrame(()=>{')&&
 js.includes('list.slice(0,90)'),
 'Long libraries must not synchronously block switching top tabs');
assert(js.includes('onProgress:(done,total)=>'), 'ZIP reports progress');
assert(zip.includes("new DecompressionStream('deflate-raw')"),
 'Native streaming ZIP decompression should run before blocking pako');
assert(zip.includes('await new Promise(resolve=>setTimeout(resolve,0))'),
 'Long archive extraction should yield for touch and animation frames');
const right=html.slice(html.indexOf('<section id="inspector"'),
 html.indexOf('<script src="js/three.min.js">'));
for(const id of ['openingPanel','textureInspector','gizmoPanel',
 'roomBuilderPanel','sceneManagerPanel'])
 assert(right.includes('id="'+id+'"'),'Right settings must remain in place: '+id);
const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,
 Uint32Array,DataView,Response,DecompressionStream,setTimeout,console});
vm.runInContext(zip,ctx);
(async()=>{
 const files={};
 for(let i=0;i<20;i++)files['Textures/wood_'+i+'.png']=
  new Uint8Array([i,1,2,3]);
 const data=await vm.runInContext('ZipUtils.build',ctx)(files);
 let latest=-1,calls=0;
 const actual=await vm.runInContext('ZipUtils.extract',ctx)(data,{
  onProgress:(done,total)=>{assert.equal(total,20);assert(done>=latest);
   latest=done;calls++}
 });
 assert.equal(Object.keys(actual).length,20);
 assert.equal(latest,20);assert(calls>0);
 console.log('Android ZIP/PNG file picker, visible buttons, safe tabs, streaming ZIP and right inspector: OK');
})().catch(error=>{console.error(error);process.exitCode=1});
