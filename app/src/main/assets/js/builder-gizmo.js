/* Touch-friendly world-axis gizmo: XYZ translation, continuous XYZ rotation,
 * XYZ/uniform scale. Editing a placed instance never modifies a GLB template.
 * The three rotation rings use independent axis planes and unwrapped angles,
 * so crossing 0/360 degrees does not jump back to the starting angle.
 */
const BuilderGizmo=(()=>{
 'use strict';
 const cap=(v,a,b)=>Math.min(b,Math.max(a,v));
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const axes=[
  {axis:'x',color:0xff6375,dir:V(1,0,0)},
  {axis:'y',color:0x55eba7,dir:V(0,1,0)},
  {axis:'z',color:0x50aaff,dir:V(0,0,1)}
 ];
 const AXIS={x:V(1,0,0),y:V(0,1,0),z:V(0,0,1)};
 const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
 class Gizmo{
  constructor(scene,camera,canvas,ray){
   this.scene=scene;this.camera=camera;this.canvas=canvas;this.ray=ray;
   this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;
   this.selected=null;this.mode='move';this.drag=null;this.build();
  }
  makeMesh(geo,color,axis,opacity=.94){
   const mat=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,
    transparent:true,opacity,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(geo,mat);
   mesh.userData.axis=axis;mesh.renderOrder=1000;this.group.add(mesh);
   return mesh;
  }
  build(){
   this.handles={move:[],rotate:[],scale:[]};
   for(const a of axes){
    const shaft=this.makeMesh(new THREE.CylinderGeometry(.035,.035,.85,9),a.color,a.axis);
    shaft.position.copy(a.dir).multiplyScalar(.47);
    shaft.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(shaft);
    const head=this.makeMesh(new THREE.ConeGeometry(.14,.25,10),a.color,a.axis);
    head.position.copy(a.dir).multiplyScalar(.98);
    head.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(head);
    const cube=this.makeMesh(new THREE.BoxGeometry(.24,.24,.24),a.color,a.axis);
    cube.position.copy(a.dir).multiplyScalar(.95);this.handles.scale.push(cube);

    // TorusGeometry is initially in XY (normal +Z). Orient the ring plane
    // perpendicular to the correct world axis. The second, transparent ring
    // is a wide touch target: visual line stays thin and readable.
    const ring=this.makeMesh(new THREE.TorusGeometry(.92,.055,9,96),a.color,a.axis);
    const hit=this.makeMesh(new THREE.TorusGeometry(.92,.20,8,96),a.color,a.axis,0);
    for(const item of [ring,hit]){
     if(a.axis==='x')item.rotation.y=Math.PI/2;
     if(a.axis==='y')item.rotation.x=Math.PI/2;
     this.handles.rotate.push(item);
    }
   }
   const center=this.makeMesh(new THREE.BoxGeometry(.19,.19,.19),0xffffff,'all');
   this.handles.scale.push(center);this.showMode();
  }
  showMode(){
   for(const [mode,handles] of Object.entries(this.handles))
    for(const mesh of handles)mesh.visible=this.mode===mode;
  }
  attach(obj){
   if(this.selected!==obj)this.drag=null;
   this.selected=obj||null;this.group.visible=!!obj;this.update();
  }
  setMode(mode){
   if(!this.handles[mode])return;
   this.drag=null;this.mode=mode;this.showMode();this.update();
  }
  update(){
   if(!this.selected){this.group.visible=false;return;}
   this.group.visible=true;this.group.position.copy(
    this.selected.root.getWorldPosition(V()));
   const distance=this.camera.position.distanceTo(this.group.position);
   this.group.scale.setScalar(cap(distance*.075,.45,2.5));
   // Keep gizmo world-aligned. Euler axes and handles match the inspector.
   this.group.quaternion.identity();
  }
  rayAt(e){
   const rect=this.canvas.getBoundingClientRect();
   if(!rect.width||!rect.height)return false;
   const x=(e.clientX-rect.left)/rect.width*2-1;
   const y=-(e.clientY-rect.top)/rect.height*2+1;
   this.ray.setFromCamera(new THREE.Vector2(x,y),this.camera);return true;
  }
  onPlane(e,y){
   if(!this.rayAt(e))return null;
   const plane=new THREE.Plane(V(0,1,0),-y),hit=V();
   return this.ray.ray.intersectPlane(plane,hit)?hit:null;
  }
  rotationAngle(e,axis,origin){
   if(!this.rayAt(e))return null;
   const normal=AXIS[axis];
   const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,origin);
   const p=this.ray.ray.intersectPlane(plane,V());
   if(!p||p.distanceToSquared(origin)<.001)return null;
   p.sub(origin);
   // These angles obey the right-hand rule of THREE.Euler(XYZ).
   if(axis==='x')return Math.atan2(p.z,p.y);
   if(axis==='y')return Math.atan2(p.x,p.z);
   return Math.atan2(p.y,p.x);
  }
  start(e){
   if(!this.selected||e.button!==0||e.isPrimary===false)return false;
   this.update();this.group.updateMatrixWorld(true);
   if(!this.rayAt(e))return false;
   const hits=this.ray.intersectObjects(this.group.children,false)
    .filter(h=>h.object.visible);
   if(!hits.length)return false;
   const obj=this.selected,axis=hits[0].object.userData.axis,
    origin=obj.root.getWorldPosition(V());
   const onGround=this.onPlane(e,origin.y);
   const rotation=obj.rotation||{x:obj.root.rotation.x,y:obj.rot||0,
    z:obj.root.rotation.z};
   this.drag={pointerId:e.pointerId,axis,mode:this.mode,
    sx:e.clientX,sy:e.clientY,px:e.clientX,py:e.clientY,
    basePosition:obj.root.position.clone(),origin,
    baseEuler:{x:rotation.x||0,y:rotation.y||0,z:rotation.z||0},
    scale:obj.scale,axes:{...obj.axes},p:onGround,
    lastAngle:this.mode==='rotate'?this.rotationAngle(e,axis,origin):null,
    accumulated:0,changed:false};
   return true;
  }
  move(e,obj,options={}){
   const drag=this.drag;
   if(!drag||drag.pointerId!==e.pointerId||!obj)return false;
   const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
   if(Math.hypot(dx,dy)<3&&!drag.changed)return true;
   drag.changed=true;
   if(drag.mode==='move'){
    if(drag.axis==='y'){
     const distance=this.camera.position.distanceTo(obj.root.position);
     obj.root.position.y=PrecisionPlacement.coordinate(
      drag.basePosition.y-dy*.005*Math.max(1,distance),
      options.gridEnabled===true,PrecisionPlacement.step(options.gridStep,.25));
    }else{
     const hit=this.onPlane(e,drag.basePosition.y);
     if(hit&&drag.p){
      obj.root.position[drag.axis]=PrecisionPlacement.coordinate(
       drag.basePosition[drag.axis]+hit[drag.axis]-drag.p[drag.axis],
       options.gridEnabled===true,PrecisionPlacement.step(options.gridStep,.25));
     }
    }
   }else if(drag.mode==='rotate'){
    const angle=this.rotationAngle(e,drag.axis,drag.origin);
    if(angle!==null&&drag.lastAngle!==null){
     drag.accumulated+=wrapAngle(angle-drag.lastAngle);
     drag.lastAngle=angle;
    }else{
     // When looking directly along the ring's plane, the ray misses it.
     // Screen-space fallback still permits precise multi-turn dragging.
     drag.accumulated+=((e.clientX-drag.px)-(e.clientY-drag.py))*.009;
     if(angle!==null)drag.lastAngle=angle;
    }
    let next=drag.baseEuler[drag.axis]+drag.accumulated;
    if(e.shiftKey)next=Math.round(next/(Math.PI/12))*(Math.PI/12);
    obj.rotation=obj.rotation||{...drag.baseEuler};
    obj.rotation[drag.axis]=next;
    obj.rot=obj.rotation.y;
    obj.root.rotation.set(obj.rotation.x,obj.rotation.y,obj.rotation.z,'XYZ');
   }else if(drag.mode==='scale'){
    const factor=Math.exp((dx-dy)*.008);
    if(drag.axis==='all')obj.scale=cap(drag.scale*factor,.1,10);
    else obj.axes[drag.axis]=cap(drag.axes[drag.axis]*factor,.1,10);
    obj.root.scale.set(obj.scale*obj.axes.x,obj.scale*obj.axes.y,obj.scale*obj.axes.z);
   }
   drag.px=e.clientX;drag.py=e.clientY;
   obj.root.updateMatrixWorld(true);this.update();return true;
  }
  end(e){
   if(!this.drag||this.drag.pointerId!==e.pointerId)return null;
   const drag=this.drag;this.drag=null;return drag;
  }
 }
 return Gizmo;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuilderGizmo;
