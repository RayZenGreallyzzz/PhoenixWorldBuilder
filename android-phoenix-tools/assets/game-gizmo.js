/* Phoenix 3D touch gizmo: move (world XYZ), rotate Y, resize (local XYZ).
   No external controls addon required; compatible with bundled Three.js r140.
   Operates on saved modules only, never on original Planner's native scene. */
(function(global){
'use strict';
const T=global.THREE;
function cap(value,min,max){return Math.max(min,Math.min(max,value));}
function screenPoint(v,camera,canvas){
 const rect=canvas.getBoundingClientRect(),p=v.clone().project(camera);
 return {x:rect.left+(p.x+1)*rect.width*.5,y:rect.top+(1-p.y)*rect.height*.5};
}
class PhoenixGizmo{
 constructor(scene,camera,canvas,hooks={}){
  this.scene=scene;this.camera=camera;this.canvas=canvas;this.hooks=hooks;
  this.mode='move';this.target=null;this.drag=null;
  this.ray=new T.Raycaster();this.pointer=new T.Vector2();
  this.axes={x:new T.Vector3(1,0,0),y:new T.Vector3(0,1,0),z:new T.Vector3(0,0,1)};
  this.colors={x:0xff6666,y:0x71e993,z:0x70adff,rotation:0xffd470};
  this.group=new T.Group();this.group.name='PhoenixEditGizmo';this.group.visible=false;
  scene.add(this.group);this.makeHandles();
 }
 makeHandles(){
  const add=(mesh,axis)=>{
   mesh.userData.phoenixAxis=axis;mesh.renderOrder=1500;
   if(mesh.material){mesh.material.depthTest=false;mesh.material.depthWrite=false;}
   this.group.add(mesh);return mesh;
  };
  for(const axis of ['x','y','z']){
   const mat=new T.MeshBasicMaterial({color:this.colors[axis],depthTest:false,depthWrite:false});
   const arrow=new T.Group();arrow.name='axis-'+axis;
   const shaft=add(new T.Mesh(new T.CylinderGeometry(.032,.032,.75,9),mat),axis);
   shaft.position.y=.44;arrow.add(shaft);
   const head=add(new T.Mesh(new T.ConeGeometry(.12,.29,11),mat.clone()),axis);
   head.position.y=.94;arrow.add(head);
   // Add an invisible but finger-sized tube to make Android selection reliable.
   const hit=add(new T.Mesh(new T.CylinderGeometry(.19,.19,1.12,9),
    new T.MeshBasicMaterial({visible:false,depthTest:false,depthWrite:false})),axis);
   hit.position.y=.54;arrow.add(hit);
   if(axis==='x')arrow.rotation.z=-Math.PI/2;
   if(axis==='z')arrow.rotation.x=Math.PI/2;
   this.group.add(arrow);arrow.userData.axisMode='axis';
  }
  this.ring=new T.Mesh(new T.TorusGeometry(.83,.056,8,56),
   new T.MeshBasicMaterial({color:this.colors.rotation,depthTest:false,depthWrite:false}));
  this.ring.rotation.x=-Math.PI/2;add(this.ring,'rotation');
  this.ring.userData.axisMode='rotation';
  this.setMode('move');
 }
 setMode(mode){
  if(!['move','rotate','scale'].includes(mode))return;
  this.mode=mode;
  for(const a of ['x','y','z']){
   const arrow=this.group.getObjectByName('axis-'+a);
   arrow.visible=mode!=='rotate';
  }
  this.ring.visible=mode==='rotate';
  this.update();
 }
 select(root){
  this.target=root||null;
  this.group.visible=!!this.target;
  this.drag=null;
  this.update();
 }
 position(){
  if(!this.target)return new T.Vector3();
  const item=this.target.userData.part||{};
  const slab=['floor','ceiling','roof'].includes(item.kind);
  return new T.Vector3(item.x||0,(item.y||0)+(slab?Math.max(.06,item.thickness||.18)/2:(item.height||2)/2),item.z||0);
 }
 update(){
  if(!this.target){this.group.visible=false;return;}
  this.group.visible=true;
  this.group.position.copy(this.position());
  this.group.rotation.set(0,this.mode==='scale'?this.target.rotation.y:0,0);
  const distance=this.group.position.distanceTo(this.camera.position);
  this.group.scale.setScalar(cap(distance*.19,.48,3.4));
 }
 normalizedPointer(e){
  const r=this.canvas.getBoundingClientRect();
  const width=r.width||1,height=r.height||1;
  this.pointer.set((e.clientX-r.left)/width*2-1,-(e.clientY-r.top)/height*2+1);
  this.ray.setFromCamera(this.pointer,this.camera);
 }
 hitHandle(e){
  if(!this.target)return null;
  this.update();this.normalizedPointer(e);
  // Hit meshes are children of the visible axis groups.
  const hits=this.ray.intersectObjects(this.group.children,true);
  for(const hit of hits){
   if(hit.object.userData.phoenixAxis&&this.mode==='rotate'=== (hit.object.userData.phoenixAxis==='rotation'))
    return hit.object.userData.phoenixAxis;
  }
  return null;
 }
 pickTarget(e,roots){
  this.normalizedPointer(e);
  const hits=this.ray.intersectObjects(roots,true);
  for(const hit of hits){
   let cur=hit.object;
   while(cur){
    const found=roots.indexOf(cur);
    if(found>=0)return found;
    cur=cur.parent;
   }
  }
  return -1;
 }
 pointerDown(e,roots){
  const axis=this.hitHandle(e);
  if(axis){
   const start=this.target.userData.part;
   if(!start)return true;
   const before={...start};
   const location=this.position();
   const direction=this.axes[axis]?.clone()||new T.Vector3(0,1,0);
   if(this.mode==='scale')direction.applyAxisAngle(this.axes.y,this.target.rotation.y);
   const p=screenPoint(location,this.camera,this.canvas);
   const p2=screenPoint(location.clone().add(direction),this.camera,this.canvas);
   const screenX=p2.x-p.x,screenY=p2.y-p.y,denom=screenX*screenX+screenY*screenY;
   const screenLen=Math.max(6,Math.sqrt(denom));
   const rotateOrigin=screenPoint(location,this.camera,this.canvas);
   this.drag={id:e.pointerId,axis,before,px:e.clientX,py:e.clientY,screenX,screenY,
    denominator:Math.max(36,denom),rotateOrigin,hasChanged:false};
   this.hooks.begin?.();
   return true;
  }
  const idx=this.pickTarget(e,roots);
  if(idx>=0){
   this.hooks.select?.(idx);
   return true;
  }
  if(this.target){this.hooks.select?.(-1);}
  return false;
 }
 pointerMove(e){
  const d=this.drag;
  if(!d||d.id!==e.pointerId)return false;
  const dx=e.clientX-d.px,dy=e.clientY-d.py;
  const projection=(dx*d.screenX+dy*d.screenY)/d.denominator;
  if(this.mode==='rotate'){
   // The horizontal gesture also works when the rotation ring is edge-on.
   let degrees=dx*.7;const step=this.hooks.snap?.()?15:.1;
   degrees=Math.round(degrees/step)*step;
   this.hooks.change?.(d.before,'rot',degrees,d);
  }else{
   const step=this.hooks.snap?.()?.25:.001;
   let metres=Math.round(projection/step)*step;
   metres=cap(metres,-30,30);
   this.hooks.change?.(d.before,d.axis,metres,d);
  }
  d.hasChanged=true;this.update();
  return true;
 }
 pointerUp(e){
  if(!this.drag||this.drag.id!==e.pointerId)return false;
  const changed=this.drag.hasChanged;this.drag=null;
  this.hooks.end?.(changed);
  this.update();return true;
 }
 dispose(){
  this.group.traverse(o=>{
   if(o.isMesh){o.geometry?.dispose();
    const arr=Array.isArray(o.material)?o.material:[o.material];
    arr.forEach(m=>m?.dispose());
   }
  });
  this.group.removeFromParent();
 }
}
global.PhoenixGizmo=PhoenixGizmo;
})(window);
