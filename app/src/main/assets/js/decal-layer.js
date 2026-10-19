/* Phoenix Builder: up to three transparent decals painted directly by the
 * existing mesh shader. No extra meshes or draw calls (Three.js r140). */
const DecalLayer=(()=>{
 const MAX=3,faces=['front','back','left','right','top','bottom'];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function normalize(source){
  if(!Array.isArray(source))return [];
  return source.slice(0,MAX).filter(d=>d&&typeof d.texture==='string'&&d.texture&&faces.includes(d.face)).map((d,i)=>({
   id:typeof d.id==='string'?d.id:'emblem-'+i,
   texture:d.texture,face:d.face,
   x:clamp(Number.isFinite(Number(d.x))?Number(d.x):.5,0,1),
   y:clamp(Number.isFinite(Number(d.y))?Number(d.y):.5,0,1),
   size:clamp(Number(d.size)||.65,.05,2),
   rotation:clamp(Number(d.rotation)||0,-360,360),
   opacity:clamp(d.opacity===undefined?1:Number(d.opacity),0,1),
   fit:d.fit==='fill'?'fill':'contain'
  }));
 }
 function faceGeometry(root,face){
  root.updateWorldMatrix(true,true);
  const box=typeof BuildSnap!=='undefined'?BuildSnap.attrBounds(root):new THREE.Box3().setFromObject(root);
  if(box.isEmpty())return null;
  const c=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3());
  const matrix=root.matrixWorld;
  const norm=v=>v.transformDirection(matrix).normalize();
  const x=norm(new THREE.Vector3(1,0,0)),y=norm(new THREE.Vector3(0,1,0)),z=norm(new THREE.Vector3(0,0,1));
  const scale=new THREE.Vector3();matrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
  const sx=Math.abs(scale.x),sy=Math.abs(scale.y),sz=Math.abs(scale.z);
  let u,v,n,width,height;
  switch(face){
   case 'top':u=x;v=z;n=y;width=span.x*sx;height=span.z*sz;break;
   case 'bottom':u=x;v=z.clone().negate();n=y.clone().negate();width=span.x*sx;height=span.z*sz;break;
   case 'back':u=x.clone().negate();v=y;n=z.clone().negate();width=span.x*sx;height=span.y*sy;break;
   case 'left':u=z;v=y;n=x.clone().negate();width=span.z*sz;height=span.y*sy;break;
   case 'right':u=z.clone().negate();v=y;n=x;width=span.z*sz;height=span.y*sy;break;
   default:u=x;v=y;n=z;width=span.x*sx;height=span.y*sy;
  }
  return {center:c.applyMatrix4(matrix),u,v,n,width:Math.max(.001,width),height:Math.max(.001,height)};
 }
 function params(root,decal,texture){
  const face=faceGeometry(root,decal.face);if(!face)return null;
  const img=texture?.image;
  const ratio=img?.width&&img?.height?img.height/img.width:1;
  const width=decal.fit==='fill'?1:decal.size;
  const height=decal.fit==='fill'?1:clamp(width*face.width/face.height*ratio,.01,4);
  return {...face,size:new THREE.Vector2(width,height),
   at:new THREE.Vector2(decal.x,decal.y),angle:THREE.MathUtils.degToRad(decal.rotation),
   opacity:decal.opacity};
 }
 function declarations(i){
  return ['uniform sampler2D pwbDecalMap'+i+';','uniform float pwbDecalActive'+i+';',
   'uniform float pwbDecalOpacity'+i+';','uniform vec3 pwbDecalCenter'+i+';',
   'uniform vec3 pwbDecalU'+i+';','uniform vec3 pwbDecalV'+i+';',
   'uniform vec3 pwbDecalN'+i+';','uniform vec2 pwbDecalExtent'+i+';',
   'uniform vec2 pwbDecalAt'+i+';','uniform vec2 pwbDecalSize'+i+';',
   'uniform vec2 pwbDecalRot'+i+';'].join('\n');
 }
 function fragment(i){
  return [
   'if(pwbDecalActive'+i+'>0.5&&dot(normalize(pwbDecalNormal),pwbDecalN'+i+')>0.6){',
   ' vec3 pd=pwbDecalPos-pwbDecalCenter'+i+';',
   ' vec2 uv=vec2(dot(pd,pwbDecalU'+i+')/pwbDecalExtent'+i+'.x+0.5,dot(pd,pwbDecalV'+i+')/pwbDecalExtent'+i+'.y+0.5);',
   ' vec2 q=(uv-pwbDecalAt'+i+')/pwbDecalSize'+i+';',
   ' vec2 stamp=vec2(q.x*pwbDecalRot'+i+'.x+q.y*pwbDecalRot'+i+'.y,-q.x*pwbDecalRot'+i+'.y+q.y*pwbDecalRot'+i+'.x)+0.5;',
   ' if(stamp.x>=0.0&&stamp.x<=1.0&&stamp.y>=0.0&&stamp.y<=1.0){',
   '  vec4 pixel=texture2D(pwbDecalMap'+i+',stamp);',
   '  diffuseColor.rgb=mix(diffuseColor.rgb,pow(pixel.rgb,vec3(2.2)),clamp(pixel.a*pwbDecalOpacity'+i+',0.0,1.0));',
   ' }','}'
  ].join('\n');
 }
 const uniformsCode=Array.from({length:MAX},(_,i)=>declarations(i)).join('\n');
 const fragmentCode=Array.from({length:MAX},(_,i)=>fragment(i)).join('\n');
 let blank;
 function blankMap(){
  if(!blank){blank=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1,THREE.RGBAFormat);blank.needsUpdate=true}
  return blank;
 }
 function applyToRoot(root,decals,textures){
  if(!root)return 0;
  const active=normalize(decals).map(d=>({d,map:textures?.get(d.texture)})).filter(x=>x.map);
  if(!active.length)return 0;
  let result=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   for(const material of(Array.isArray(mesh.material)?mesh.material:[mesh.material])){
    if(!material||!(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial||
     material.isMeshBasicMaterial||material.isMeshPhongMaterial))continue;
    const before=material.onBeforeCompile?.bind(material);
    const previousKey=material.customProgramCacheKey?.bind(material);
    const uniforms={};
    for(let i=0;i<MAX;i++){
     const item=active[i],face=item?params(root,item.d,item.map):null;
     uniforms['pwbDecalMap'+i]={value:item?.map||blankMap()};
     uniforms['pwbDecalActive'+i]={value:face?1:0};
     uniforms['pwbDecalOpacity'+i]={value:face?.opacity||0};
     uniforms['pwbDecalCenter'+i]={value:face?.center||new THREE.Vector3()};
     uniforms['pwbDecalU'+i]={value:face?.u||new THREE.Vector3(1,0,0)};
     uniforms['pwbDecalV'+i]={value:face?.v||new THREE.Vector3(0,1,0)};
     uniforms['pwbDecalN'+i]={value:face?.n||new THREE.Vector3(0,0,1)};
     uniforms['pwbDecalExtent'+i]={value:face?new THREE.Vector2(face.width,face.height):new THREE.Vector2(1,1)};
     uniforms['pwbDecalAt'+i]={value:face?.at||new THREE.Vector2(.5,.5)};
     uniforms['pwbDecalSize'+i]={value:face?.size||new THREE.Vector2(1,1)};
     uniforms['pwbDecalRot'+i]={value:face?new THREE.Vector2(Math.cos(face.angle),Math.sin(face.angle)):new THREE.Vector2(1,0)};
    }
    material.onBeforeCompile=shader=>{
     if(before)before(shader);
     Object.assign(shader.uniforms,uniforms);
     shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 pwbDecalPos;\nvarying vec3 pwbDecalNormal;');
     shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\npwbDecalPos=(modelMatrix*vec4(transformed,1.0)).xyz;\npwbDecalNormal=normalize(mat3(modelMatrix)*normal);');
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec3 pwbDecalPos;\nvarying vec3 pwbDecalNormal;\n'+uniformsCode);
     shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',
      fragmentCode+'\n#include <alphatest_fragment>');
    };
    material.customProgramCacheKey=()=>String(previousKey?previousKey():'')+'|PWB_DECALS_'+active.length;
    material.needsUpdate=true;result++;
   }
  });
  return result;
 }
 return {MAX,faces,normalize,faceGeometry,params,applyToRoot};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DecalLayer;
