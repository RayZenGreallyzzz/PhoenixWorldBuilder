/* Phoenix Engine 1.1: safe in-project skill icons for Android/WebView.
 * PNG/WebP images are decoded and resized into small embedded data URLs.
 * No external URLs, SVG, scripts or third-party dependencies.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkillImages=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_SOURCE_BYTES=6*1024*1024;
 const MAX_DATA_CHARS=90000; // about 65 kB per icon, keeps Android saves small
 const MAX_SIDE=192;
 const encoded=/^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
 function validate(raw){
  if(raw===undefined||raw===null||raw==='')return '';
  if(typeof raw!=='string'||raw.length>MAX_DATA_CHARS)
   throw new TypeError('Invalid or oversized skill image');
  const match=encoded.exec(raw);
  if(!match||match[2].length%4!==0)
   throw new TypeError('Only embedded PNG/WebP skill images are allowed');
  const prefix=atob(match[2].slice(0,80));
  const png=prefix.slice(0,8)==='\x89PNG\r\n\x1a\n';
  const webp=prefix.slice(0,4)==='RIFF'&&prefix.slice(8,12)==='WEBP';
  if(match[1].toLowerCase()==='png'?!png:!webp)
   throw new TypeError('Invalid skill image header');
  return raw;
 }
 function supported(file){
  const type=String(file?.type||'').toLowerCase();
  const name=String(file?.name||'').toLowerCase();
  return ['image/png','image/webp'].includes(type)||
   (!type&&/\.(png|webp)$/.test(name));
 }
 async function fromFile(file,doc){
  if(!file||!supported(file))throw new TypeError('Выбери изображение PNG или WebP');
  if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_SOURCE_BYTES)
   throw new RangeError('Размер изображения должен быть не больше 6 МБ');
  if(typeof URL==='undefined'||!URL.createObjectURL||typeof Image==='undefined')
   throw new Error('Этот WebView не поддерживает выбор изображений');
  const objectURL=URL.createObjectURL(file);
  let picture;
  try{
   picture=await new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Не удалось прочитать PNG/WebP'));
    image.src=objectURL;
   });
   if(!picture.naturalWidth||!picture.naturalHeight||
      picture.naturalWidth>16384||picture.naturalHeight>16384)
    throw new RangeError('Некорректное разрешение изображения');
   const d=doc||document;
   const canvas=d.createElement('canvas');
   if(!canvas?.getContext)throw new Error('Canvas недоступен');
   for(const side of [MAX_SIDE,160,128,96,72]){
    const scale=Math.min(1,side/Math.max(picture.naturalWidth,picture.naturalHeight));
    canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Canvas 2D недоступен');
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(picture,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.68,.5,.35]){
     const raw=canvas.toDataURL('image/webp',quality);
     // Older WebViews return a PNG when WebP encoder is unavailable.
     if(raw.length<=MAX_DATA_CHARS)return validate(raw);
    }
   }
   throw new RangeError('Не удалось сжать иконку для Android');
  }finally{URL.revokeObjectURL(objectURL)}
 }
 return Object.freeze({MAX_SOURCE_BYTES,MAX_DATA_CHARS,MAX_SIDE,validate,supported,fromFile});
});
