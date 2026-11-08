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
 function measure(root,relativeTo=null,maxSkinnedVertices=150000){
  if(!root||typeof THREE==='undefined')throw Error('Модель персонажа отсутствует');
  // Important: SkinnedMesh overrides updateMatrixWorld() to refresh
  // bindMatrixInverse in attached skeleton mode. updateWorldMatrix() alone
  // BYPASSES that override; after scaling the fit wrapper, a subsequent
  // measure would read the bone scale twice and undo the correct fitting.
  if(relativeTo)relativeTo.updateWorldMatrix(true,false);
  root.updateWorldMatrix(true,false);
  root.updateMatrixWorld(true);
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
    const cap=Number.isFinite(maxSkinnedVertices)?
     Math.max(500,Math.min(150000,Math.floor(maxSkinnedVertices))):150000;
    const stride=Math.max(1,Math.ceil(positions.count/cap));
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
 // Keep the soles at the character controller's ground (player.position.y).
 // This adjusts ONLY the vertical placement of the fit wrapper, never its
 // scale or imported model root. A walking animation may move the hips or
 // GLB root up, and should not make the entire person hover over the floor.
 // Sparse sampling caps CPU usage for large Android skinned GLB files.
 function groundTarget(root,fitGroup){
  if(!root||!fitGroup)throw Error('Сначала загрузи персонажа GLB');
  const visible=measure(root,fitGroup,10000);
  const scaled=fitGroup.scale.y;
  if(!Number.isFinite(scaled)||scaled<=0)throw Error('Некорректный размер персонажа');
  const target=-visible.min.y*scaled;
  if(!Number.isFinite(target))throw Error('Не найдена опора персонажа');
  return target;
 }
 function ground(fitGroup,target,dt=0,instant=false){
  if(!fitGroup||!Number.isFinite(target))return false;
  const before=fitGroup.position.y;
  if(instant)fitGroup.position.y=target;
  else {
   // Run on EVERY frame with cached groundTarget, but sample the pose
   // only a few times per second. Smooth corrections do not cause a
   // noticeable "three-size jump" or shake while running.
   const duration=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;
   const alpha=1-Math.exp(-11*duration);
   fitGroup.position.y+=(target-before)*alpha;
   if(Math.abs(target-fitGroup.position.y)<.001)
    fitGroup.position.y=target;
  }
  return Math.abs(fitGroup.position.y-before)>.000001;
 }
 return {measure,compute,apply,groundTarget,ground};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AvatarFit;
