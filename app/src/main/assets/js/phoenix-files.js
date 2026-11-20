/* Offline Phoenix Builder file I/O.
 * A native SAF save dialog is essential: WebView does not reliably download
 * blob: URLs. Separate editable project backup and rendered static GLB.
 */
const PhoenixFiles=(()=>{
 'use strict';
 const fileName=s=>String(s||'phoenix').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_.-]/g,'_').slice(0,80);
 const bytesToBase64=bytes=>{
  let out='';
  for(let i=0;i<bytes.length;i+=32768)
   out+=btoa(String.fromCharCode(...bytes.subarray(i,i+32768)));
  // Every chunk is divisible by 3? No; btoa blocks have padding. Use
  // 32766-byte chunks to avoid padding in the middle of a stream.
  return out;
 };
 function base64(bytes){
  const parts=[];
  for(let i=0;i<bytes.length;i+=32766)
   parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+32766))));
  return parts.join('');
 }
 function unbase64(text){
  if(typeof text!=='string'||text.length%4===1)throw Error('Повреждён файл проекта');
  const chunks=[];
  for(let i=0;i<text.length;i+=43688){
   const part=atob(text.slice(i,i+43688)),view=new Uint8Array(part.length);
   for(let j=0;j<part.length;j++)view[j]=part.charCodeAt(j);
   chunks.push(view);
  }
  const length=chunks.reduce((a,b)=>a+b.length,0),out=new Uint8Array(length);
  let offset=0;for(const x of chunks){out.set(x,offset);offset+=x.length}
  return out.buffer;
 }
 async function unbase64Careful(text){
  if(typeof text!=='string'||text.length%4===1)throw Error('Повреждён файл проекта');
  const expected=(text.length/4)*3-(text.endsWith('==')?2:text.endsWith('=')?1:0);
  const out=new Uint8Array(Math.max(0,expected));let offset=0;
  for(let i=0;i<text.length;i+=43688){
   const chars=atob(text.slice(i,i+43688));
   for(let j=0;j<chars.length;j++)out[offset++]=chars.charCodeAt(j);
   if(i&&i%(43688*18)===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(offset!==expected)throw Error('Повреждена вложенная текстура');
  return out.buffer;
 }
 async function saveBlob(blob,name,mime=blob.type||'application/octet-stream'){
  if(!(blob instanceof Blob))blob=new Blob([blob],{type:mime});
  const safe=fileName(name);
  if(typeof window!=='undefined'&&window.NativeBridge?.beginSave){
   const bridge=window.NativeBridge;
   if(typeof bridge.appendSaveChunk!=='function'||typeof bridge.finishSave!=='function')
    throw Error('Android: неполный модуль сохранения, файл не записан');
   if(bridge.beginSave(safe,mime)===false)throw Error('Android отклонил сохранение');
   // Previous code loaded the ENTIRE GLB into a second ArrayBuffer, crashing
   // weaker tablets on 100-200 MB scenes. Only one tiny slice is live now.
   const step=32766;
   for(let i=0;i<blob.size;i+=step){
    const piece=new Uint8Array(await blob.slice(i,Math.min(blob.size,i+step)).arrayBuffer());
    if(bridge.appendSaveChunk(btoa(String.fromCharCode(...piece)))===false)
     throw Error('Android не принял часть файла при сохранении');
    if(i&&i%(step*12)===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(bridge.finishSave()===false)throw Error('Android не завершил сохранение');
   return {native:true,name:safe,bytes:blob.size};
  }
  if(typeof document==='undefined'||typeof URL==='undefined')
   throw Error('Сохранение доступно только в приложении или браузере');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safe;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return {native:false,name:safe,bytes:blob.size};
 }
 const validImageType=file=>{
  const mime=String(file?.type||'').toLowerCase();
  if(['image/png','image/jpeg','image/webp','image/bmp','image/gif'].includes(mime))return mime;
  const ext=String(file?.name||'').split('.').pop()?.toLowerCase();
  return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',gif:'image/gif'}[ext]||null;
 };
 async function prepareTexture(file,maxTexture=4096,{lossless=false}={}){
  const mime=validImageType(file);
  if(!mime)throw Error('Поддерживаются PNG, JPG, JPEG, WebP, BMP и GIF');
  if(!file?.size)throw Error('Пустое изображение');
  // No arbitrary 3 MB file cap. Downscale by decoded GPU dimensions instead.
  const cap=Math.max(512,Math.min(4096,Number(maxTexture)||4096));
  let image=null,url=null;
  try{
   if(typeof createImageBitmap==='function')image=await createImageBitmap(file);
   else{
    url=URL.createObjectURL(file);
    image=await new Promise((resolve,reject)=>{
     const img=new Image();img.onload=()=>resolve(img);
     img.onerror=()=>reject(Error('Не удалось прочесть изображение'));
     img.src=url;
    });
   }
   const width=image.width,height=image.height;
   if(!width||!height)throw Error('Некорректный размер изображения');
   // Prevent huge textures from exhausting Android GPU memory. Preserve
   // aspect ratio and transparency (WebP alpha). Original is not modified.
   const factor=Math.min(1,cap/Math.max(width,height),
    Math.sqrt((cap*cap)/(width*height)));
   const w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Не поддерживается обработка изображения');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(image,0,0,w,h);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,
    lossless?'image/png':'image/webp',.92));
   if(!blob||!blob.size)throw Error('Не удалось сохранить сжатую текстуру');
   const bytes=await blob.arrayBuffer();
   return {bytes,type:blob.type||'image/webp',
    width:w,height:h,sourceWidth:width,sourceHeight:height,
    sourceBytes:file.size,storedBytes:bytes.byteLength};
  }finally{
   if(image?.close)image.close();
   if(url)URL.revokeObjectURL(url);
  }
 }
 // Android portable JSON writer: stream the package as the actual SAF file,
 // rather than holding all uploaded textures as base64 strings in JS memory.
 // The output schema is IDENTICAL to packageProject(). Browser fallback stays
 // unchanged. No asset/texture is silently skipped.
 async function savePortableProject(project,textures,modelIDs,readAsset,
  name='PhoenixBuilder_Project.phoenix.json'){
  if(project?.version!==2||!Array.isArray(project.objects))
   throw Error('Повреждён редактируемый проект');
  const native=typeof window!=='undefined'&&window.NativeBridge?.beginSave;
  if(!native){
   const doc=await packageProject(project,textures,modelIDs,readAsset);
   return saveBlob(new Blob([JSON.stringify(doc)],{type:'application/json'}),
    name,'application/json');
  }
  const included=new Map();
  for(const t of textures||[]){
   if(t?.id?.startsWith('texture:'))
    included.set(t.id,{id:t.id,name:t.name||'',type:t.type||'image/webp'});
  }
  for(const id of modelIDs||[]){
   if(typeof id==='string'&&id.startsWith('glb:'))
    included.set(id,{id,type:'model/gltf-binary'});
  }
  const bridge=window.NativeBridge;
  if(typeof bridge.appendSaveChunk!=='function'||typeof bridge.finishSave!=='function')
   throw Error('Android: неполный модуль сохранения');
  const safe=fileName(name),encoder=new TextEncoder(),step=32766;
  let written=0,iterations=0;
  const yieldOften=async()=>{
   if(++iterations%12===0)await new Promise(resolve=>setTimeout(resolve,0));
  };
  const writeBytes=async(bytes)=>{
   for(let at=0;at<bytes.length;at+=step){
    const piece=bytes.subarray(at,Math.min(bytes.length,at+step));
    if(bridge.appendSaveChunk(btoa(String.fromCharCode(...piece)))===false)
     throw Error('Android не принял часть файла проекта');
    written+=piece.length;
    await yieldOften();
   }
  };
  const writeText=async(text)=>writeBytes(encoder.encode(text));
  // Validate references before writing anything, so missing textures do not
  // leave a partially emitted backup in the native save dialog.
  for(const record of included.values()){
   const data=await readAsset(record.id);
   if(!data)throw Error('Не найдены данные «'+(record.name||record.id)+'». Экспорт отменён.');
   await yieldOften();
  }
  if(bridge.beginSave(safe,'application/json')===false)
   throw Error('Android отклонил сохранение проекта');
  await writeText('{"format":"PhoenixBuilderBackupV1","project":');
  await writeText(JSON.stringify(project));
  await writeText(',"assets":[');
  let first=true;
  for(const record of included.values()){
   const raw=await readAsset(record.id);
   if(!raw)throw Error('Потеряны данные «'+(record.name||record.id)+'»');
   const data=raw instanceof ArrayBuffer?new Uint8Array(raw):
    new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
   if(!first)await writeText(',');first=false;
   await writeText(JSON.stringify(record).slice(0,-1)+',"base64":"');
   for(let i=0;i<data.length;i+=step){
    // Every intermediate piece is divisible by 3: no padding in the middle.
    const encoded=base64(data.subarray(i,Math.min(data.length,i+step)));
    await writeText(encoded);
   }
   await writeText('"}');
  }
  const metadata=(textures||[]).map(t=>({id:t.id,name:t.name,type:t.type}));
  await writeText('],"textureLibrary":'+JSON.stringify(metadata)+
   ',"exportedAt":'+JSON.stringify(new Date().toISOString())+'}');
  if(bridge.finishSave()===false)throw Error('Android не завершил запись JSON');
  return {native:true,name:safe,bytes:written,assets:included.size};
 }
 async function packageProject(project,textures,modelIDs,readAsset){
  if(project?.version!==2||!Array.isArray(project.objects))
   throw Error('Повреждён редактируемый проект');
  const included=new Map();
  for(const texture of textures||[]){
   if(!texture?.id?.startsWith('texture:'))continue;
   included.set(texture.id,{id:texture.id,name:texture.name||'',type:texture.type||'image/webp'});
  }
  for(const id of modelIDs||[]){
   if(typeof id==='string'&&id.startsWith('glb:'))
    included.set(id,{id,type:'model/gltf-binary'});
  }
  const assets=[];
  for(const record of included.values()){
   const buf=await readAsset(record.id);
   if(!buf)throw Error('Не найдены данные «'+(record.name||record.id)+'». Экспорт отменён.');
   const data=buf instanceof ArrayBuffer?new Uint8Array(buf):new Uint8Array(buf.buffer,buf.byteOffset,buf.byteLength);
   assets.push({...record,base64:base64(data)});
  }
  return {format:'PhoenixBuilderBackupV1',project,assets,
   textureLibrary:(textures||[]).map(t=>({id:t.id,name:t.name,type:t.type})),
   exportedAt:new Date().toISOString()};
 }
 async function unpackProject(pack,writeAsset,options={}){
  if(pack?.format!=='PhoenixBuilderBackupV1'||pack.project?.version!==2||
   !Array.isArray(pack.project.objects)||!Array.isArray(pack.assets))
   throw Error('Нужна резервная копия Phoenix Builder (.phoenix.json)');
  for(let index=0;index<pack.assets.length;index++){
   const record=pack.assets[index];
   if(!record||typeof record.id!=='string'||!
    /^(texture:|glb:)[a-zA-Zа-яА-ЯёЁ0-9._:-]{1,150}$/.test(record.id))
    throw Error('Некорректный идентификатор файла в резервной копии');
   const data=options.careful?await unbase64Careful(record.base64):unbase64(record.base64);
   await writeAsset(record.id,data);
   options.onProgress?.(index+1,pack.assets.length);
   if(options.careful)await new Promise(resolve=>setTimeout(resolve,25));
  }
  const textures=(pack.textureLibrary||[]).filter(t=>t&&
   typeof t.id==='string'&&t.id.startsWith('texture:')&&
   typeof t.name==='string'&&typeof t.type==='string');
  return {project:pack.project,textures};
 }
 return {fileName,base64,unbase64,unbase64Careful,saveBlob,savePortableProject,
  prepareTexture,packageProject,unpackProject,validImageType};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PhoenixFiles;
