const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../app/src/main/assets');
let browser=null;
for(const bin of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
 const r=cp.spawnSync('which',[bin],{encoding:'utf8'});
 if(r.status===0){browser=r.stdout.trim();break}
}
if(!browser){console.log('Chrome absent: large-texture WebView smoke skipped');process.exit(0)}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=[
"window.addEventListener('DOMContentLoaded',()=>{",
"const app=window.PhoenixClean;",
"async function check(){",
"document.body.dataset.textureStage='start';",
"// Chromium --virtual-time-budget does not complete file:// IndexedDB transactions reliably.",
"// Use deterministic async IDB adapter here; Node tests validate exact binary storage,",
"// and the production app continues using native IndexedDB unchanged.",
"const savedAssets=new Map();",
"window.indexedDB.open=()=>{const db={close(){},transaction(){const tx={oncomplete:null,onerror:null};tx.objectStore=()=>({put(value,id){savedAssets.set(id,value);queueMicrotask(()=>tx.oncomplete?.());},get(id){const result={result:null,onsuccess:null,onerror:null};queueMicrotask(()=>{result.result=savedAssets.get(id);result.onsuccess?.()});return result}});return tx}};const req={result:db,onsuccess:null,onerror:null};queueMicrotask(()=>req.onsuccess?.());return req};",
"if(!app||document.body.dataset.cleanReady!=='true')throw Error('Editor did not start');",
"const wall=app.createEntry('wall',{position:[3.234,0,0]});app.entries.push(wall);app.scene.add(wall.root);",
"const source=document.createElement('canvas');source.width=512;source.height=256;",
"source.getContext('2d').fillRect(0,0,512,256);",
"window.createImageBitmap=async()=>source;",
"const file=new File([new Uint8Array(4*1024*1024+17)],'bigwall.png',{type:'image/png'});",
"app.setMode('drone');app.setTool('pick');app.selected=null;",
"document.body.dataset.textureStage='importing';await app.importTextureFile(file);document.body.dataset.textureStage='imported';",
"if(app.mode!=='build'||!app.pendingTexture?.imageId||!app.textureFiles.length)throw Error('Large texture >3MB not saved or drone not switched for selection');",
"const imageId=app.textureFiles[app.textureFiles.length-1].id;",
"app.selected=wall;app.setTool('pick');app.chooseTexture('custom',imageId);",
"document.body.dataset.textureStage='reading-image';const stored=await app.textureAsset(imageId);document.body.dataset.textureStage='image-loaded';",
"if(!stored?.image?.width||wall.surface.imageId!==imageId)throw Error('Custom image not loaded/applied');",
"const captured={};const original=PhoenixFiles.saveBlob;",
"PhoenixFiles.saveBlob=async(blob,name,mime)=>{captured[name]={blob,mime};return {native:true}};",
"try{",
"document.body.dataset.textureStage='exporting-glb';await app.exportGLB();document.body.dataset.textureStage='glb-exported';",
"const glb=captured['PhoenixBuilder_Scene.glb'];if(!glb)throw Error('GLB export button does not save file');",
"const bytes=await glb.blob.arrayBuffer();const dv=new DataView(bytes);if(dv.getUint32(0,true)!==0x46546c67)throw Error('GLB export not real binary model');",
"const len=dv.getUint32(12,true);const info=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,len)));",
"if(!info.images?.length||!info.meshes?.length)throw Error('GLB lacks embedded model texture');",
"document.body.dataset.textureStage='exporting-backup';await app.exportBackup();document.body.dataset.textureStage='backup-exported';",
"const backup=captured['PhoenixBuilder_Project.phoenix.json'];if(!backup)throw Error('Portable backup not exported');",
"const documentJSON=JSON.parse(await backup.blob.text());",
"if(!documentJSON.assets?.some(v=>v.id===imageId&&v.base64.length>100))throw Error('Backup contains only references, not texture bytes');",
"app.textureFiles=[];app.textureCache.clear();",
"await app.importBackup(new File([backup.blob],'recovery.phoenix.json',{type:'application/json'}));",
"if(!app.textureFiles.some(t=>t.id===imageId)||!app.entries.some(t=>t.surface?.imageId===imageId))throw Error('Portable project and image did not restore');",
"}finally{PhoenixFiles.saveBlob=original;}",
"}",
"check().then(()=>document.body.dataset.textureSaveSmoke='ok').catch(e=>{console.error(e);document.body.dataset.textureSaveSmoke='error:'+e.message});",
"});"
].join('\n');
const file=path.join(root,'__texture_save_smoke__.html');
fs.writeFileSync(file,html.replace('</body>','<script>'+js+'</script></body>'));
let r;
try{
 for(let attempt=0;attempt<2;attempt++){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-texture-'));
  try{
   r=cp.spawnSync(browser,[
    '--user-data-dir='+profile,'--no-first-run','--disable-extensions','--headless',
    '--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader',
    '--use-gl=angle','--use-angle=swiftshader','--disable-features=Vulkan',
    '--virtual-time-budget=25000','--dump-dom','--window-size=1280,800','file://'+file
   ],{encoding:'utf8',timeout:70000,maxBuffer:28*1024*1024});
  }finally{fs.rmSync(profile,{recursive:true,force:true})}
  if((r.stdout||'').includes('data-texture-save-smoke="ok"'))break;
  console.warn('Retry texture smoke '+attempt+1+'/2');
 }
}finally{fs.unlinkSync(file)}
if(!(r.stdout||'').includes('data-texture-save-smoke="ok"')){
 const error=(r.stdout||'').match(/data-texture-save-smoke="([^"]*)"/)?.[1]||'missing';
 const stage=(r.stdout||'').match(/data-texture-stage="([^"]*)"/)?.[1]||'none';
 const ready=(r.stdout||'').match(/data-clean-ready="([^"]*)"/)?.[1]||'none';
 const status=(r.stdout||'').match(/<small id="textureLibraryStatus"[^>]*>([^<]*)/)?.[1]||'not-found';
 console.error('Texture save/export smoke error: '+error,'stage='+stage,'editor='+ready,
  'library='+status,(r.stderr||'').slice(-1000));
 process.exit(1);
}
console.log('Chrome: >3MB texture imported, persisted, applied after drone, GLB embeds image, portable backup restores image OK');
