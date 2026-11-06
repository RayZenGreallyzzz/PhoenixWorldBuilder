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
 async function saveBlob(blob,name,mime=blob.type||'application/octet-stream'){
  if(!(blob instanceof Blob))blob=new Blob([blob],{type:mime});
  const safe=fileName(name);
  if(typeof window!=='undefined'&&window.NativeBridge?.beginSave){
   const bridge=window.NativeBridge;
   bridge.beginSave(safe,mime);
   const data=new Uint8Array(await blob.arrayBuffer());
   for(let i=0;i<data.length;i+=32766){
    const piece=data.subarray(i,i+32766);
    bridge.appendSaveChunk(btoa(String.fromCharCode(...piece)));
    if(i&&i%(32766*12)===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   bridge.finishSave();
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
  if(['image/png','image/jpeg','image/webp'].includes(mime))return mime;
  const ext=String(file?.name||'').split('.').pop()?.toLowerCase();
  return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[ext]||null;
 };
 async function prepareTexture(file,maxTexture=4096){
  const mime=validImageType(file);
  if(!mime)throw Error('Поддерживаются PNG, JPG и WebP');
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
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
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
 async function unpackProject(pack,writeAsset){
  if(pack?.format!=='PhoenixBuilderBackupV1'||pack.project?.version!==2||
   !Array.isArray(pack.project.objects)||!Array.isArray(pack.assets))
   throw Error('Нужна резервная копия Phoenix Builder (.phoenix.json)');
  for(const record of pack.assets){
   if(!record||typeof record.id!=='string'||!
    /^(texture:|glb:)[a-zA-Zа-яА-ЯёЁ0-9._:-]{1,150}$/.test(record.id))
    throw Error('Некорректный идентификатор файла в резервной копии');
   const data=unbase64(record.base64);
   await writeAsset(record.id,data);
  }
  const textures=(pack.textureLibrary||[]).filter(t=>t&&
   typeof t.id==='string'&&t.id.startsWith('texture:')&&
   typeof t.name==='string'&&typeof t.type==='string');
  return {project:pack.project,textures};
 }
 return {fileName,base64,unbase64,saveBlob,prepareTexture,packageProject,unpackProject,validImageType};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PhoenixFiles;
