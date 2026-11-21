/* Phoenix Engine — terrain texture splatting.
 * One imported image is referenced by ID; repeat brush strokes modify a
 * fixed-resolution alpha/weight mask, not image copies or stroke lists.
 * Zero arbitrary count limits on strokes or materials; RAM/storage remain
 * constrained by physical device capacity and painted AREA.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixTerrainSplat=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PATCH=50,RES=64,DETAIL_RES=512,COUNT=RES*RES;
 // Legacy masks stay 64px. Micro-brush (<1m) promotes ONLY touched
 // patches to 512px (~9.8cm/pixel), not the full 5x5km landscape.
 const ID=/^texture:[a-zA-Z0-9._:-]{1,120}$/;
 const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 function validResolution(res){
  if(res!==RES&&res!==DETAIL_RES)
   throw new TypeError('Invalid terrain paint mask resolution');
  return res;
 }
 function resolutionOf(bytes){
  if(!(bytes instanceof Uint8Array))throw new TypeError('Invalid terrain paint mask');
  const res=Math.sqrt(bytes.length);
  return validResolution(res);
 }
 function promote(bytes){
  if(resolutionOf(bytes)===DETAIL_RES)return bytes;
  const out=new Uint8Array(DETAIL_RES*DETAIL_RES);
  const factor=DETAIL_RES/RES;
  for(let y=0;y<DETAIL_RES;y++){
   const fromY=Math.floor(y/factor)*RES, toY=y*DETAIL_RES;
   for(let x=0;x<DETAIL_RES;x++)
    out[toY+x]=bytes[fromY+Math.floor(x/factor)];
  }
  return out;
 }
 function encode(bytes){
  resolutionOf(bytes);
  const output=[];
  for(let i=0;i<bytes.length;){
   const val=bytes[i];let repeat=1;
   while(i+repeat<bytes.length&&bytes[i+repeat]===val&&repeat<255)repeat++;
   output.push(repeat,val);i+=repeat;
  }
  let result='';
  for(let i=0;i<output.length;i+=8192)
   result+=String.fromCharCode(...output.slice(i,i+8192));
  return btoa(result);
 }
 function decode(text,res=RES){
  validResolution(res);
  const size=res*res;
  if(typeof text!=='string'||!text.length||
     text.length>size*4||!/^[a-zA-Z0-9+/]+={0,2}$/.test(text))
   throw new TypeError('Invalid terrain paint mask encoding');
  const packed=atob(text);
  if(packed.length<2||packed.length%2!==0||packed.length>size*2)
   throw new TypeError('Invalid terrain paint mask runs');
  const bytes=new Uint8Array(size);let written=0;
  for(let i=0;i<packed.length;i+=2){
   const n=packed.charCodeAt(i),v=packed.charCodeAt(i+1);
   if(!n||written+n>size)throw new TypeError('Invalid terrain paint mask length');
   bytes.fill(v,written,written+n);written+=n;
  }
  if(written!==size)throw new TypeError('Incomplete terrain paint mask');
  return bytes;
 }
 function validId(id){
  if(typeof id!=='string'||!ID.test(id))
   throw new TypeError('Paint material must reference an imported texture ID');
  return id;
 }
 function bounds(world,col,row){
  const x=-world.width/2+col*PATCH,z=-world.depth/2+row*PATCH;
  return {x,z,width:Math.min(PATCH,world.width/2-x),
   depth:Math.min(PATCH,world.depth/2-z),col,row,key:col+':'+row};
 }
 function intersects(world,col,row){
  return Number.isInteger(col)&&Number.isInteger(row)&&
   col>=0&&row>=0&&col<Math.ceil(world.width/PATCH)&&
   row<Math.ceil(world.depth/PATCH);
 }
 function checkEntries(entries,world){
  if(!Array.isArray(entries))throw new TypeError('Invalid terrain paint entries');
  const seen=new Set();
  for(const item of entries){
   if(!item||!intersects(world,item.col,item.row))throw new TypeError('Paint mask outside world');
   const id=validId(item.imageId),key=item.col+':'+item.row+':'+id;
   if(seen.has(key))throw new TypeError('Duplicate terrain paint mask');
   seen.add(key);
   validResolution(item.resolution===undefined?RES:item.resolution);
   decode(item.mask,item.resolution??RES);
  }
  return entries;
 }
 class Painter{
  constructor(world,entries=[]){
   if(!Number.isFinite(world?.width)||!Number.isFinite(world?.depth)||
      world.width<=0||world.depth<=0||world.width>5000||world.depth>5000)
    throw new TypeError('Invalid terrain world size');
   this.world={width:world.width,depth:world.depth};
   this.patches=new Map();
   this.load(entries);
  }
  load(entries){
   checkEntries(entries,this.world);
   this.patches.clear();
   for(const entry of entries){
    const key=entry.col+':'+entry.row;
    if(!this.patches.has(key))this.patches.set(key,new Map());
    this.patches.get(key).set(entry.imageId,
     decode(entry.mask,entry.resolution??RES));
   }
  }
  serialize(){
   const result=[];
   for(const [key,layers] of this.patches){
    const [col,row]=key.split(':').map(Number);
    for(const [imageId,mask] of layers){
     if(mask.some(v=>v!==0)){
      const resolution=resolutionOf(mask);
      result.push({col,row,imageId,mask:encode(mask),
       ...(resolution!==RES?{resolution}:{})});
     }
    }
   }
   return result.sort((a,b)=>a.row-b.row||a.col-b.col||
    a.imageId.localeCompare(b.imageId));
  }
  materials(){
   const ids=new Set();
   for(const layers of this.patches.values())
    for(const id of layers.keys())ids.add(id);
   return [...ids];
  }
  layersFor(key){return this.patches.get(key)||new Map()}
  paint(x,z,radius,imageId,opacity=1,erase=false,softness=.65){
   if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||
      !Number.isFinite(opacity)||!Number.isFinite(softness)||
      softness<0||softness>1||radius<.2||radius>50||opacity<=0||opacity>1)
    throw new TypeError('Invalid round texture brush settings');
   if(!erase)validId(imageId);
   if(x<-this.world.width/2-radius||x>this.world.width/2+radius||
      z<-this.world.depth/2-radius||z>this.world.depth/2+radius)return [];
   const minCol=Math.max(0,Math.floor((x-radius+this.world.width/2)/PATCH));
   const maxCol=Math.min(Math.ceil(this.world.width/PATCH)-1,
    Math.floor((x+radius+this.world.width/2)/PATCH));
   const minRow=Math.max(0,Math.floor((z-radius+this.world.depth/2)/PATCH));
   const maxRow=Math.min(Math.ceil(this.world.depth/PATCH)-1,
    Math.floor((z+radius+this.world.depth/2)/PATCH));
   const changed=new Set();
   for(let row=minRow;row<=maxRow;row++)for(let col=minCol;col<=maxCol;col++){
    const rect=bounds(this.world,col,row),key=rect.key;
    let layers=this.patches.get(key);
    if(!layers){
     if(erase)continue;
     layers=new Map();this.patches.set(key,layers);
    }
    // Raise mask detail only where user actually paints below 1m.
    // A 20cm radius gets a few pixels across, while large-area masks
    // remain low-resolution and economical on Android.
    const wanted=radius<1?DETAIL_RES:RES;
    const current=Math.max(RES,...[...layers.values()].map(resolutionOf));
    const resolution=Math.max(wanted,current);
    if(current<resolution){
     for(const [id,mask] of layers)layers.set(id,promote(mask));
    }
    const nx=Math.max(0,Math.floor((x-radius-rect.x)/rect.width*resolution));
    const xx=Math.min(resolution-1,Math.ceil((x+radius-rect.x)/rect.width*resolution));
    const nz=Math.max(0,Math.floor((z-radius-rect.z)/rect.depth*resolution));
    const zz=Math.min(resolution-1,Math.ceil((z+radius-rect.z)/rect.depth*resolution));
    if(nx>xx||nz>zz)continue;
    let target;
    if(!erase){
     target=layers.get(imageId);
     if(!target){target=new Uint8Array(resolution*resolution);layers.set(imageId,target)}
    }
    let isChanged=false;
    for(let py=nz;py<=zz;py++){
     const worldZ=rect.z+(py+.5)*rect.depth/resolution;
     for(let px=nx;px<=xx;px++){
      const worldX=rect.x+(px+.5)*rect.width/resolution;
      const norm2=((worldX-x)**2+(worldZ-z)**2)/(radius*radius);
      if(norm2>=1)continue;
      // Feathered circular pencil/marker edge, not a painted square.
      const dist=Math.sqrt(norm2),inner=1-softness;
      const falloff=dist<=inner?1:
       Math.max(0,(1-dist)/Math.max(.001,softness));
      const alpha=Math.min(1,falloff*falloff*(3-2*falloff)*opacity);
      const index=py*resolution+px;
      for(const [layerId,mask] of layers){
       const old=mask[index];
       const value=layerId===imageId&&!erase?
        old+(255-old)*alpha:old*(1-alpha);
       const next=Math.round(value);
       if(next!==old){mask[index]=next;isChanged=true}
      }
     }
    }
    if(isChanged)changed.add(key);
    else if(!erase&&target&&!target.some(v=>v))layers.delete(imageId);
    if(!layers.size)this.patches.delete(key);
   }
   return [...changed];
  }
 }
 return Object.freeze({PATCH,RES,DETAIL_RES,COUNT,encode,decode,validResolution,resolutionOf,validId,
  bounds,intersects,checkEntries,Painter});
});
