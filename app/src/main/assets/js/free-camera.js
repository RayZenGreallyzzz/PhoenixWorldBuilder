/* Camera-only navigation; never move, rotate or rescale building modules.
 * Three.js r140 OrbitControls uses target as the camera's rotation pivot.
 * Move position AND target by the same delta to preserve distance/view angle.
 */
const FreeCamera=(()=>{
 'use strict';
 const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
 function focus(camera,controls,point){
  if(!camera?.position||!controls?.target||!valid(point))return false;
  const delta=point.clone().sub(controls.target);
  camera.position.add(delta);
  controls.target.copy(point);
  controls.update();
  return true;
 }
 function selectedCenter(THREE,root){
  if(!THREE?.Box3||!root)return null;
  const box=new THREE.Box3().setFromObject(root);
  return box.isEmpty()?null:box.getCenter(new THREE.Vector3());
 }
 function hitPosition(THREE,camera,ray,canvas,entries,ground,event){
  if(!THREE||!ray||!camera||!canvas||!event)return null;
  const rect=canvas.getBoundingClientRect();
  if(!(rect.width>0&&rect.height>0))return null;
  const pointer=new THREE.Vector2(
   (event.clientX-rect.left)/rect.width*2-1,
   -(event.clientY-rect.top)/rect.height*2+1
  );
  ray.setFromCamera(pointer,camera);
  const objects=(entries||[]).filter(e=>e?.root).map(e=>e.root);
  if(ground)objects.push(ground);
  const hits=ray.intersectObjects(objects,true);
  return hits.length?hits[0].point.clone():null;
 }
 return {focus,selectedCenter,hitPosition};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FreeCamera;
