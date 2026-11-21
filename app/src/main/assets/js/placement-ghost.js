/* Phoenix Builder: reliable placement ghosts on Android terrain.
 * Ghosts are independent of the finished module's GLB/PBR materials.
 * Never apply this style to installed objects or mutate saved templates.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixPlacementGhost=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const previews=new WeakMap();
 function material(T){
  let m=previews.get(T);
  if(!m){
   m=new T.MeshBasicMaterial({
    color:0x18e8ff,transparent:true,opacity:.43,
    depthTest:false,depthWrite:false,
    side:T.DoubleSide,polygonOffset:true,
    polygonOffsetFactor:-1,polygonOffsetUnits:-1
   });
   previews.set(T,m);
  }
  return m;
 }
 function style(root,T){
  if(!root||!T)throw new TypeError('Missing preview object or Three.js');
  const ghost=material(T);
  let count=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   // Keep each geometry group's material slot, otherwise a multi-material
   // GLB may vanish because its group index doesn't exist.
   mesh.material=Array.isArray(mesh.material)?
    mesh.material.map(()=>ghost):ghost;
   mesh.renderOrder=950;
   mesh.userData.phoenixPlacementGhost=true;
   count++;
  });
  return count;
 }
 function align(root,ground,T){
  if(!root||!Number.isFinite(ground)||!T)return false;
  root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root);
  if(bounds.isEmpty()||!Number.isFinite(bounds.min.y))return false;
  const offset=ground-bounds.min.y;
  if(Math.abs(offset)>10000)return false;
  root.position.y+=offset;
  root.updateMatrixWorld(true);
  return true;
 }
 return Object.freeze({style,align,material});
});
