/* Stable 1:1 character fitting independent of GLB source units and animation.
 * The GLB root is never rescaled or recentered. The parent wrapper owns fit.
 */
const AvatarFit=(()=>{
 'use strict';
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function measure(root){
  if(!root||typeof THREE==='undefined')throw Error('Модель персонажа отсутствует');
  root.updateWorldMatrix(true,true);
  const b=new THREE.Box3().setFromObject(root);
  const size=b.getSize(new THREE.Vector3());
  if(b.isEmpty()||![size.x,size.y,size.z].every(Number.isFinite)||size.y<1e-6)
   throw Error('Невозможно определить размеры персонажа');
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
