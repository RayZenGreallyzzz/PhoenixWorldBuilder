/* Phoenix Builder surface materials. One original mesh, no extra tile geometry.
 * 4 mappings:
 * repeat = world-unit tiled, tile = one proportion-correct cropped image per
 * module, module = one full stretched image per module, joined = one panorama
 * spanning a connected floor group. The latter stores an explicit world rect.
 */
const SurfacePaint=(()=>{
 const faces=['all','top','bottom'];
 const modes=['repeat','tile','module','joined'];
 let white=null;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function normalize(p){
  const result={};
  for(const key of faces){
   const item=p?.[key];if(!item||typeof item!=='object')continue;
   const clean={};
   if(typeof item.texture==='string'&&item.texture)clean.texture=item.texture;
   if(typeof item.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(item.color))clean.color=item.color;
   if(modes.includes(item.mode))clean.mode=item.mode;
   if(Number.isFinite(Number(item.tileMeters)))clean.tileMeters=clamp(Number(item.tileMeters),.1,40);
   if(typeof item.faithful==='boolean')clean.faithful=item.faithful;
   if(Array.isArray(item.region)&&item.region.length===4&&item.region.every(n=>Number.isFinite(Number(n)))){
    const rect=item.region.map(Number);
    if(rect[2]>rect[0]&&rect[3]>rect[1])clean.region=rect;
   }
   if(Object.keys(clean).length)result[key]=clean;
  }
  return result;
 }
 function update(p,face,property,value){
  const out=normalize(p);
  if(!faces.includes(face)||!['texture','color','mode','tileMeters','faithful','region'].includes(property))return out;
  if(value===null||value===''||value===undefined){
   if(out[face]){delete out[face][property];if(!Object.keys(out[face]).length)delete out[face]}
  }else{
   if(!out[face])out[face]={};
   out[face][property]=value;
  }
  return normalize(out);
 }
 function whiteTexture(){
  if(white)return white;
  white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
  white.needsUpdate=true;white.wrapS=white.wrapT=THREE.RepeatWrapping;return white;
 }
 function localBounds(root){
  root.updateWorldMatrix?.(true,true);
  const inverse=root.matrixWorld.clone().invert(),box=new THREE.Box3(),part=new THREE.Box3();
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   obj.geometry.computeBoundingBox();
   part.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld).applyMatrix4(inverse);
   box.union(part);
  });
  if(box.isEmpty())box.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2.6,1));
  return box;
 }
 const commonVertex=String.raw`uniform mat4 pwbToRoot;
varying vec3 pwbWorldNormal;
varying vec3 pwbWorldPosition;
varying vec3 pwbRootNormal;
varying vec3 pwbRootPosition;
`;
 const beginVertex=String.raw`#include <begin_vertex>
pwbWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
pwbWorldNormal=normalize(mat3(modelMatrix)*normal);
pwbRootPosition=(pwbToRoot*vec4(transformed,1.0)).xyz;
pwbRootNormal=normalize(mat3(pwbToRoot)*normal);
`;
 const commonFragment=String.raw`
varying vec3 pwbWorldNormal;
varying vec3 pwbWorldPosition;
varying vec3 pwbRootNormal;
varying vec3 pwbRootPosition;
uniform sampler2D pwbTextureall;
uniform sampler2D pwbTexturetop;
uniform sampler2D pwbTexturebottom;
uniform float pwbEnabledall;
uniform float pwbEnabledtop;
uniform float pwbEnabledbottom;
uniform float pwbUseMapall;
uniform float pwbUseMaptop;
uniform float pwbUseMapbottom;
uniform vec3 pwbTintall;
uniform vec3 pwbTinttop;
uniform vec3 pwbTintbottom;
uniform vec3 pwbBoundMin;
uniform vec3 pwbBoundSize;
uniform vec4 pwbRegionall;
uniform vec4 pwbRegiontop;
uniform vec4 pwbRegionbottom;
uniform float pwbModeall;
uniform float pwbModetop;
uniform float pwbModebottom;
uniform float pwbMetersall;
uniform float pwbMeterstop;
uniform float pwbMetersbottom;
uniform float pwbAspectall;
uniform float pwbAspecttop;
uniform float pwbAspectbottom;
uniform float pwbFaithfulall;
uniform float pwbFaithfultop;
uniform float pwbFaithfulbottom;
vec3 pwbSampleWrap(sampler2D image,vec3 coord,vec3 normal){
 vec3 weights=pow(abs(normal),vec3(8.0));
 weights/=max(weights.x+weights.y+weights.z,0.00001);
 vec3 a=texture2D(image,coord.zy).rgb;
 vec3 b=texture2D(image,coord.xz).rgb;
 vec3 c=texture2D(image,coord.xy).rgb;
 return a*weights.x+b*weights.y+c*weights.z;
}
vec3 pwbRead(sampler2D image, float mode,float meters,float aspect,vec4 region,vec3 pn){
 if(mode<.5){
  return pwbSampleWrap(image,pwbWorldPosition/max(.1,meters),pn);
 }
 if(mode>2.5){
  vec2 size=max(vec2(.0001),region.zw-region.xy);
  vec2 uv=(pwbWorldPosition.xz-region.xy)/size;
  return texture2D(image,clamp(uv,vec2(.001),vec2(.999))).rgb;
 }
 vec3 local=(pwbRootPosition-pwbBoundMin)/max(vec3(.0001),pwbBoundSize);
 vec3 n=abs(normalize(pwbRootNormal));
 vec2 uv=n.y>.55?local.xz:n.x>n.z?local.zy:local.xy;
 if(mode<1.5){
  vec2 dimensions=n.y>.55?pwbBoundSize.xz:n.x>n.z?pwbBoundSize.zy:pwbBoundSize.xy;
  float surfaceAspect=dimensions.x/max(.0001,dimensions.y);
  if(surfaceAspect>aspect)uv.y=.5+(uv.y-.5)*aspect/surfaceAspect;
  else uv.x=.5+(uv.x-.5)*surfaceAspect/max(.0001,aspect);
 }
 return texture2D(image,clamp(uv,vec2(.001),vec2(.999))).rgb;
}
vec3 pwbColor(vec3 rgb,float faithful){
 // Imported PNG/JPEG stores sRGB values. Use linear base colour before
 // applying lights; optional gentle fidelity boost compensates for ACES.
 vec3 linear=pow(max(rgb,vec3(0.0)),vec3(2.2));
 return mix(linear,rgb,faithful*.28);
}
`;
 const applyFragment=String.raw`#include <map_fragment>
{
  vec3 pn=normalize(pwbWorldNormal);
  if(!gl_FrontFacing)pn=-pn;
  vec3 colour=diffuseColor.rgb;
  if(pwbEnabledall>0.5){
    vec3 tex=pwbUseMapall>0.5?pwbRead(pwbTextureall,pwbModeall,pwbMetersall,pwbAspectall,pwbRegionall,pn):vec3(1.0);
    colour=pwbColor(tex,pwbFaithfulall)*pwbTintall;
  }
  if(pn.y>0.55&&pwbEnabledtop>0.5){
    vec3 tex=pwbUseMaptop>0.5?pwbRead(pwbTexturetop,pwbModetop,pwbMeterstop,pwbAspecttop,pwbRegiontop,pn):vec3(1.0);
    colour=pwbColor(tex,pwbFaithfultop)*pwbTinttop;
  }else if(pn.y< -0.55&&pwbEnabledbottom>0.5){
    vec3 tex=pwbUseMapbottom>0.5?pwbRead(pwbTexturebottom,pwbModebottom,pwbMetersbottom,pwbAspectbottom,pwbRegionbottom,pn):vec3(1.0);
    colour=pwbColor(tex,pwbFaithfulbottom)*pwbTintbottom;
  }
  if(pwbEnabledall+pwbEnabledtop+pwbEnabledbottom>0.5)diffuseColor.rgb=colour;
}
`;
 function applyToRoot(root,paint,textures){
  if(!root)return;
  const norm=normalize(paint),has=faces.some(x=>!!(norm[x]?.texture||norm[x]?.color));
  const bounds=localBounds(root),ext=bounds.getSize(new THREE.Vector3());
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert();
  root.traverse(obj=>{
   if(!obj.isMesh)return;
   const list=Array.isArray(obj.material)?obj.material:[obj.material];
   for(const mat of list){
    if(!mat||!(mat.isMeshStandardMaterial||mat.isMeshPhysicalMaterial||
       mat.isMeshBasicMaterial||mat.isMeshPhongMaterial))continue;
    const uniforms={
     pwbToRoot:{value:inverse.clone().multiply(obj.matrixWorld)},
     pwbBoundMin:{value:bounds.min.clone()},
     pwbBoundSize:{value:ext}
    };
    for(const key of faces){
     const info=norm[key];
     const map=info?.texture&&textures?.get(info.texture);
     const aspect=(map?.image?.width||1)/Math.max(1,map?.image?.height||1);
     uniforms['pwbTexture'+key]={value:map||whiteTexture()};
     uniforms['pwbEnabled'+key]={value:info?.color||info?.texture?1:0};
     uniforms['pwbTint'+key]={value:new THREE.Color(info?.color||'#ffffff')};
     uniforms['pwbUseMap'+key]={value:map?1:0};
     uniforms['pwbMode'+key]={value:Math.max(0,modes.indexOf(info?.mode||'repeat'))};
     uniforms['pwbMeters'+key]={value:info?.tileMeters||1};
     uniforms['pwbAspect'+key]={value:aspect};
     uniforms['pwbRegion'+key]={value:new THREE.Vector4(...(info?.region||[0,0,1,1]))};
     uniforms['pwbFaithful'+key]={value:info?.faithful?1:0};
    }
    mat.onBeforeCompile=shader=>{
     Object.assign(shader.uniforms,uniforms);
     shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+commonVertex);
     shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',beginVertex);
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+commonFragment);
     shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+applyFragment.replace('#include <map_fragment>',''));
    };
    mat.customProgramCacheKey=()=>has?'PWB_surface_4':'PWB_surface_clear_4';
    if(has&&['foundation','ceiling','ceiling_finish'].includes(root.userData?.pwbCategory))
     mat.side=THREE.DoubleSide;
    mat.needsUpdate=true;
   }
  });
 }
 function joinedFloors(world,selected,max=128){
  if(!selected||!world?.objects?.includes(selected))return [];
  const type=e=>e.data?.category||world.categoryForKind?.(e.kind)||e.kind;
  if(!['foundation','ceiling','ceiling_finish'].includes(type(selected)))return [];
  const story=selected.data?.storey;
  const source=world.objects.filter(e=>e.mesh&&
   type(e)===type(selected)&&e.data?.storey===story).map(e=>{
    e.mesh.updateWorldMatrix(true,true);
    return {entry:e,box:new THREE.Box3().setFromObject(e.mesh)};
   });
  const base=source.find(x=>x.entry===selected);if(!base)return [];
  const connected=(a,b)=>{
   if(Math.abs(a.box.max.y-b.box.max.y)>.16)return false;
   const overlap=(a0,a1,b0,b1)=>Math.max(0,Math.min(a1,b1)-Math.max(a0,b0));
   const gap=(a0,a1,b0,b1)=>Math.max(0,a0-b1,b0-a1);
   const x=overlap(a.box.min.x,a.box.max.x,b.box.min.x,b.box.max.x);
   const z=overlap(a.box.min.z,a.box.max.z,b.box.min.z,b.box.max.z);
   const dx=gap(a.box.min.x,a.box.max.x,b.box.min.x,b.box.max.x);
   const dz=gap(a.box.min.z,a.box.max.z,b.box.min.z,b.box.max.z);
   return (dx<=.15&&z>.2)||(dz<=.15&&x>.2);
  };
  const group=[base],seen=new Set([selected]);
  for(let i=0;i<group.length&&group.length<max;i++){
   for(const cand of source){
    if(seen.has(cand.entry)||!connected(group[i],cand))continue;
    seen.add(cand.entry);group.push(cand);
    if(group.length>=max)break;
   }
  }
  const region=[Math.min(...group.map(x=>x.box.min.x)),Math.min(...group.map(x=>x.box.min.z)),
   Math.max(...group.map(x=>x.box.max.x)),Math.max(...group.map(x=>x.box.max.z))];
  return group.map(x=>({entry:x.entry,region}));
 }
 return {faces,modes,normalize,update,applyToRoot,localBounds,joinedFloors};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfacePaint;
