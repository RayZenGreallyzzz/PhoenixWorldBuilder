/* Phoenix Builder: one mesh, independently paint its top, bottom or all faces.
 * Three.js r140; keeps existing GLB geometry and original UV materials.
 * No second slab, no per-triangle draw calls; one GPU material shader.
 */
const SurfacePaint=(()=>{
 const faces=['all','top','bottom'];
 let white=null;
 function normalize(p){
  const result={};
  for(const key of faces){
   const item=p?.[key];if(!item||typeof item!=='object')continue;
   const clean={};
   if(typeof item.texture==='string'&&item.texture)clean.texture=item.texture;
   if(typeof item.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(item.color))clean.color=item.color;
   if(Object.keys(clean).length)result[key]=clean;
  }
  return result;
 }
 function update(p,face,property,value){
  const out=normalize(p);
  if(!faces.includes(face)||!['texture','color'].includes(property))return out;
  if(value===null||value===''||value===undefined){
   if(out[face]){delete out[face][property];if(!Object.keys(out[face]).length)delete out[face]}
  }else{if(!out[face])out[face]={};out[face][property]=value;}
  return normalize(out);
 }
 function whiteTexture(){
  if(white)return white;
  white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
  white.needsUpdate=true;white.wrapS=white.wrapT=THREE.RepeatWrapping;return white;
 }
 const commonVertex='varying vec3 pwbWorldNormal;\nvarying vec3 pwbWorldPosition;\n';
 const beginVertex='#include <begin_vertex>\npwbWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;\npwbWorldNormal=normalize(mat3(modelMatrix)*normal);\n';
 const commonFragment=String.raw`
varying vec3 pwbWorldNormal;
varying vec3 pwbWorldPosition;
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
vec3 pwbSampleWrap(sampler2D image,vec3 coord,vec3 normal){
 vec3 weights=pow(abs(normal),vec3(8.0));
 weights/=max(weights.x+weights.y+weights.z,0.00001);
 vec3 a=texture2D(image,coord.zy).rgb;
 vec3 b=texture2D(image,coord.xz).rgb;
 vec3 c=texture2D(image,coord.xy).rgb;
 return a*weights.x+b*weights.y+c*weights.z;
}
`;
 const applyFragment=String.raw`#include <map_fragment>
{
  vec3 pn=normalize(pwbWorldNormal);
  if(!gl_FrontFacing)pn=-pn;
  vec3 colour=diffuseColor.rgb;
  if(pwbEnabledall>0.5){
    vec3 tex=pwbUseMapall>0.5?pwbSampleWrap(pwbTextureall,pwbWorldPosition,pn):vec3(1.0);
    colour=pow(tex,vec3(2.2))*pwbTintall;
  }
  if(pn.y>0.55&&pwbEnabledtop>0.5){
    vec3 tex=pwbUseMaptop>0.5?texture2D(pwbTexturetop,pwbWorldPosition.xz).rgb:vec3(1.0);
    colour=pow(tex,vec3(2.2))*pwbTinttop;
  }else if(pn.y< -0.55&&pwbEnabledbottom>0.5){
    vec3 tex=pwbUseMapbottom>0.5?texture2D(pwbTexturebottom,pwbWorldPosition.xz).rgb:vec3(1.0);
    colour=pow(tex,vec3(2.2))*pwbTintbottom;
  }
  if(pwbEnabledall+pwbEnabledtop+pwbEnabledbottom>0.5)diffuseColor.rgb=colour;
}
`;
 function applyToRoot(root,paint,textures){
  if(!root)return;
  const norm=normalize(paint),has=faces.some(x=>!!norm[x]);
  root.traverse(obj=>{
   if(!obj.isMesh)return;
   const list=Array.isArray(obj.material)?obj.material:[obj.material];
   for(const mat of list){
    if(!mat||!(mat.isMeshStandardMaterial||mat.isMeshPhysicalMaterial||
       mat.isMeshBasicMaterial||mat.isMeshPhongMaterial))continue;
    const uniforms={};
    for(const key of faces){
     const info=norm[key];
     const map=info?.texture&&textures?.get(info.texture);
     uniforms['pwbTexture'+key]={value:map||whiteTexture()};
     uniforms['pwbEnabled'+key]={value:info?1:0};
     uniforms['pwbTint'+key]={value:new THREE.Color(info?.color||'#ffffff')};
     uniforms['pwbUseMap'+key]={value:map?1:0};
    }
    mat.onBeforeCompile=shader=>{
     Object.assign(shader.uniforms,uniforms);
     shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\n'+commonVertex);
     shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',beginVertex);
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\n'+commonFragment);
     shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n'+applyFragment.replace('#include <map_fragment>',''));
    };
    mat.customProgramCacheKey=()=>has?'PWB_surface_3':'PWB_surface_clear_3';
    const category=root.userData?.pwbCategory;
    if(has&&['foundation','ceiling','ceiling_finish'].includes(category))
     mat.side=THREE.DoubleSide;
    mat.needsUpdate=true;
   }
  });
 }
 return {faces,normalize,update,applyToRoot};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfacePaint;
