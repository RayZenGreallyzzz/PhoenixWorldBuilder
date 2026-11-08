/* Stable 1:1 character fitting independent of GLB source units and animation.
 * The GLB root is never rescaled or recentered. The parent wrapper owns fit.
 */
const AvatarFit=(()=>{
 'use strict';
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 // In Three.js r140, Box3.setFromObject() measures the BIND-POSE
 // geometry of SkinnedMesh, NOT the geometry deformed by bones. On some
 // imported humanoids the difference is huge (centimetres vs metres).
 // Measure real, skin-deformed vertices and express them in the fit wrapper's
 // LOCAL coordinates so camera orbit and the player's yaw cannot affect scale.
 function measure(root,relativeTo=null){
  if(!root||typeof THREE==='undefined')throw Error('Модель персонажа отсутствует');
  root.updateWorldMatrix(true,true);
  if(relativeTo)relativeTo.updateWorldMatrix(true,true);
  const inverse=relativeTo?
   relativeTo.matrixWorld.clone().invert():new THREE.Matrix4();
  const b=new THREE.Box3().makeEmpty(),point=new THREE.Vector3();
  const transform=new THREE.Matrix4();
  let count=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.getAttribute('position'))return;
   let ancestor=mesh,hidden=false;
   while(ancestor){if(!ancestor.visible){hidden=true;break}
    if(ancestor===root)break;ancestor=ancestor.parent;}
   if(hidden)return;
   const positions=mesh.geometry.getAttribute('position');
   if(!positions.count)return;
   transform.multiplyMatrices(inverse,mesh.matrixWorld);
   if(mesh.isSkinnedMesh&&mesh.skeleton?.bones?.length&&
      mesh.geometry.getAttribute('skinIndex')&&
      mesh.geometry.getAttribute('skinWeight')&&
      typeof mesh.boneTransform==='function'){
    // One-time operation on import, limited for pathological >150k vertex rigs.
    const stride=Math.max(1,Math.ceil(positions.count/150000));
    for(let i=0;i<positions.count;i+=stride){
     point.fromBufferAttribute(positions,i);
     mesh.boneTransform(i,point);
     b.expandByPoint(point.applyMatrix4(transform));count++;
    }
    if((positions.count-1)%stride!==0){
     const i=positions.count-1;
     point.fromBufferAttribute(positions,i);
     mesh.boneTransform(i,point);
     b.expandByPoint(point.applyMatrix4(transform));count++;
    }
   }else{
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const box=mesh.geometry.boundingBox;
    if(box&&!box.isEmpty()){b.union(box.clone().applyMatrix4(transform));count++;}
   }
  });
  const size=b.getSize(new THREE.Vector3());
  if(!count||b.isEmpty()||![size.x,size.y,size.z].every(Number.isFinite)||
    size.y<1e-6)throw Error('Невозможно определить размеры персонажа');
  return {min:b.min.clone(),max:b.max.clone(),size};
 }
 function compute(metrics,heightCm=175){
  const height=clamp(Number(heightCm)||175,80,220)/100;
  const s=metrics.size;
  // Realistic humanoid height and floor footprint; wild GLB unit scales are safe.
  const uniform=Math.min(height/Math.max(s.y,1e-6),
    Math.max(height*.68,0.45)/Math.max(s.x,1e-6),
    Math.max(height*.53,0.38)/Math.max(s.z,1e-6));
  if(!Number.isFinite(uniform)||uniform<=0)throw Error('Невозможный масштаб GLB');
  const center=metrics.min.clone().add(metrics.max).multiplyScalar(.5);
  return {uniform,height,position:new THREE.Vector3(-center.x*uniform,
    -metrics.min.y*uniform,-center.z*uniform)};
 }
 function apply(fitGroup,metrics,heightCm){
  const fit=compute(metrics,heightCm);
  fitGroup.scale.setScalar(fit.uniform);
  // Translation must be applied outside the animated root as well.
  // Parent offset is independent of the GLB's own animation tracks.
  fitGroup.position.copy(fit.position);
  return fit;
 }
 return {measure,compute,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AvatarFit;
