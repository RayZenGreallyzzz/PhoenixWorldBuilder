/* Optional mobile GPU texture budget for imported models.
 * Resizes only decompressed bitmaps; leaves KTX2/ASTC/ETC blocks untouched.
 * Materials are cloned, so GLB source data and other scene instances stay intact.
 */
const AndroidAssetOpt=(()=>{
 'use strict';
 const channels=['map','normalMap','roughnessMap','metalnessMap','emissiveMap',
  'aoMap','alphaMap','bumpMap','displacementMap','lightMap'];
 function quality(v){return ['balanced','battery','original'].includes(v)?v:'balanced'}
 function budget(mode){return mode==='original'?Infinity:mode==='battery'?1024:2048}
 const px=(tex)=>{
  const im=tex?.image;return im?{w:im.width||im.videoWidth||0,
   h:im.height||im.videoHeight||0}:null;
 };
 function optimize(root,mode='balanced'){
  const profile=quality(mode),max=budget(profile);
  const stats={mode:profile,resized:0,sourcePixels:0,outputPixels:0,compressedPreserved:0};
  if(!root||!Number.isFinite(max)||typeof document==='undefined')return stats;
  const cache=new WeakMap(),materials=new WeakMap();
  function resized(tex){
   if(!tex||!tex.isTexture)return tex;
   if(tex.isCompressedTexture){stats.compressedPreserved++;return tex}
   if(cache.has(tex))return cache.get(tex);
   const info=px(tex);
   if(!info||!info.w||!info.h||Math.max(info.w,info.h)<=max)return tex;
   const scale=max/Math.max(info.w,info.h);
   const w=Math.max(1,Math.round(info.w*scale)),h=Math.max(1,Math.round(info.h*scale));
   let next;
   try{
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return tex;
    ctx.drawImage(tex.image,0,0,w,h);
    next=tex.clone();next.image=canvas;next.needsUpdate=true;
    next.generateMipmaps=tex.generateMipmaps;
    stats.sourcePixels+=info.w*info.h;stats.outputPixels+=w*h;
    stats.resized++;
   }catch(err){console.warn('Texture optimization skipped',err);return tex}
   cache.set(tex,next);return next;
  }
  root.traverse(node=>{
   if(!node.isMesh||!node.material)return;
   const change=mat=>{
    if(!mat||!mat.isMaterial)return mat;
    if(materials.has(mat))return materials.get(mat);
    let candidate=mat,cloned=false;
    for(const slot of channels){
     const old=mat[slot],newTex=resized(old);
     if(old!==newTex){
      if(!cloned){candidate=mat.clone();cloned=true}
      candidate[slot]=newTex;
     }
    }
    if(cloned)candidate.needsUpdate=true;
    materials.set(mat,candidate);return candidate;
   };
   node.material=Array.isArray(node.material)?node.material.map(change):change(node.material);
  });
  return stats;
 }
 return {optimize,quality,budget};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AndroidAssetOpt;
