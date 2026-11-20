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
  {axis:'x',color:0xff303e,dir:V(1,0,0)},
  {axis:'y',color:0x35ff47,dir:V(0,1,0)},
  {axis:'z',color:0x138cff,dir:V(0,0,1)}
 ];
 const AXIS={x:V(1,0,0),y:V(0,1,0),z:V(0,0,1)};
 const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
 class Gizmo{
  constructor(scene,camera,canvas,ray){
   this.scene=scene;this.camera=camera;this.canvas=canvas;this.ray=ray;
   this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;
   this.selected=null;this.active=false;this.mode=(typeof window!=='undefined'&&Math.min(screen.width,screen.height)>=600)?'universal':'rotate';this.drag=null;
   // CAD badges are passive HUD elements: they never steal touch events
   // from the canvas, rings, camera or Android pinch-to-zoom.
   this.hud=typeof document!=='undefined'?
    document.getElementById('gizmoCadOverlay'):null;
   this.badges=this.hud?{
    width:document.getElementById('gizmoMeasureWidth'),
    height:document.getElementById('gizmoMeasureHeight'),
    depth:document.getElementById('gizmoMeasureDepth')
   }:null;
   this.showCad=true;this.boundsRoot=null;this.localBounds=null;
   this.build();
  }
  makeMesh(geo,color,axis,opacity=1){
   const mat=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,
    transparent:opacity<1,opacity,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(geo,mat);
   mesh.userData.axis=axis;mesh.renderOrder=1000;this.group.add(mesh);
   return mesh;
  }
  build(){
   this.handles={move:[],rotate:[],scale:[]};
   // Keep scale shafts invisible in Universal mode so that their touch
   // targets cannot cover the move arrows sharing the same world axis.
   this.scaleShafts=[];this.scaleCubes=[];this.moveHeads=[];
   for(const a of axes){
    const shaft=this.makeMesh(new THREE.CylinderGeometry(.055,.055,1.22,12),a.color,a.axis);
    shaft.position.copy(a.dir).multiplyScalar(.65);
    shaft.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(shaft);
    const head=this.makeMesh(new THREE.ConeGeometry(.18,.35,14),a.color,a.axis);
    head.position.copy(a.dir).multiplyScalar(1.40);
    head.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(head);this.moveHeads.push(head);
    // Long scale stems keep the axis visible when Scale is selected.
    // In Universal mode only the end-cubes are interactive; otherwise
    // overlapping stems would steal touches from the move arrows.
    const scaleShaft=this.makeMesh(new THREE.CylinderGeometry(.043,.043,1.55,12),
     a.color,a.axis);
    scaleShaft.position.copy(a.dir).multiplyScalar(.80);
    scaleShaft.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.scale.push(scaleShaft);this.scaleShafts.push(scaleShaft);
    const cube=this.makeMesh(new THREE.BoxGeometry(.26,.26,.26),a.color,a.axis);
    cube.position.copy(a.dir).multiplyScalar(1.72);
    this.handles.scale.push(cube);this.scaleCubes.push(cube);

    // TorusGeometry is initially in XY (normal +Z). Orient the ring plane
    // perpendicular to the correct world axis. The second, transparent ring
    // is a wide touch target: visual line stays thin and readable.
    const ring=this.makeMesh(new THREE.TorusGeometry(1.10,.048,10,120),a.color,a.axis);
    const hit=this.makeMesh(new THREE.TorusGeometry(1.10,.18,8,120),a.color,a.axis,0);
    for(const item of [ring,hit]){
     if(a.axis==='x')item.rotation.y=Math.PI/2;
     if(a.axis==='y')item.rotation.x=Math.PI/2;
     this.handles.rotate.push(item);
    }
   }
   // A golden camera-facing trackball, like the reference video. It rotates
   // freely around the CAMERA axis in addition to the three XYZ axis rings.
   const orbit=this.makeMesh(new THREE.TorusGeometry(1.50,.032,8,128),
    0xffdc65,'view',.78);
   const orbitTouch=this.makeMesh(new THREE.TorusGeometry(1.50,.15,8,128),
    0xffdc65,'view',0);
   this.viewRings=[orbit,orbitTouch];
   this.handles.rotate.push(orbit,orbitTouch);
   const center=this.makeMesh(new THREE.BoxGeometry(.19,.19,.19),0xffffff,'all');
   this.handles.scale.push(center);this.showMode();
  }
  showMode(){
   for(const [mode,handles] of Object.entries(this.handles))
    for(const mesh of handles){mesh.visible=this.mode===mode||this.mode==='universal';mesh.userData.operation=mode;}
   for(const shaft of this.scaleShafts)shaft.visible=this.mode==='scale';
   // Universal: handles must be separated in 3D AND on the touchscreen.
   for(let i=0;i<this.scaleCubes.length;i++)
    this.scaleCubes[i].position.copy(axes[i].dir).multiplyScalar(
     this.mode==='universal'?2.55:1.72);
  }
  attach(obj){
   if(this.selected!==obj){
    this.drag=null;this.boundsRoot=null;this.localBounds=null;
    this.active=false;
   }
   this.selected=obj||null;if(!this.selected)this.active=false;
   this.update();
  }
  activate(){if(!this.selected)return false;this.active=true;this.update();return true;}
  deactivate(){this.active=false;this.drag=null;this.group.visible=false;
   if(this.hud)this.hud.hidden=true;}
  toggleCad(value){
   this.showCad=typeof value==='boolean'?value:!this.showCad;
   if(this.hud)this.hud.hidden=!this.selected||!this.active||!this.showCad;
   this.update();return this.showCad;
  }
  // Exact local dimensions, independent of arbitrary world yaw/pitch/roll.
  // Cache the expensive mesh bounds until the selected root is replaced
  // (e.g. by a wall opening, floor cut or imported GLB mesh edit).
  measureBounds(){
   const root=this.selected?.root;
   if(!root)return null;
   if(this.boundsRoot===root&&this.localBounds)return this.localBounds;
   root.updateWorldMatrix(true,true);
   const inverse=root.matrixWorld.clone().invert();
   const box=new THREE.Box3().makeEmpty();
   root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData?.phoenixLODProxy||!mesh.visible||
     !mesh.geometry?.getAttribute('position'))return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    if(mesh.geometry.boundingBox.isEmpty())return;
    const relative=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
   });
   this.boundsRoot=root;this.localBounds=box.isEmpty()?null:box;
   return this.localBounds;
  }
  updateCad(){
   if(!this.hud||!this.badges)return;
   this.hud.hidden=!this.selected||!this.active||!this.showCad;
   if(this.hud.hidden)return;
   const root=this.selected.root,box=this.measureBounds();
   if(!box)return;
   root.updateMatrixWorld(true);
   const size=box.getSize(V());
   const dims={width:size.x*Math.abs(root.scale.x),
    height:size.y*Math.abs(root.scale.y),
    depth:size.z*Math.abs(root.scale.z)};
   const points={
    width:V((box.min.x+box.max.x)/2,box.min.y,box.max.z),
    height:V(box.max.x,(box.min.y+box.max.y)/2,box.max.z),
    depth:V(box.max.x,box.min.y,(box.min.z+box.max.z)/2)
   };
   const rect=this.canvas.getBoundingClientRect();
   for(const name of ['width','height','depth']){
    const el=this.badges[name];if(!el)continue;
    const point=root.localToWorld(points[name]).project(this.camera);
    const x=(point.x+1)*rect.width/2,y=(1-point.y)*rect.height/2;
    const behind=point.z< -1||point.z>1;
    el.hidden=behind||x<0||y<0||x>rect.width||y>rect.height;
    if(el.hidden)continue;
    el.textContent=({width:'Ш',height:'В',depth:'Г'})[name]+': '+
     dims[name].toFixed(2)+' м';
    el.style.left=(rect.left+x)+'px';el.style.top=(rect.top+y)+'px';
   }
  }
  setMode(mode){
   if(!this.handles[mode]&&mode!=='universal')return;
   this.drag=null;this.mode=mode;this.showMode();this.update();
  }
  // Universal mode: if an axis points toward the camera, its arrow and
  // scale cube project onto the same touch pixels. Spread just that cube
  // sideways IN SCREEN SPACE, without changing the direction/axis of scaling.
  spreadUniversalHandles(){
   if(this.mode!=='universal')return;
   const rect=this.canvas.getBoundingClientRect();
   if(!rect.width||!rect.height)return;
   const screenPos=mesh=>{
    const p=mesh.getWorldPosition(V()).project(this.camera);
    return {x:(p.x+1)*rect.width*.5,y:(1-p.y)*rect.height*.5};
   };
   const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
   const cameraRotation=this.camera.getWorldQuaternion(new THREE.Quaternion());
   const right=V(1,0,0).applyQuaternion(cameraRotation).normalize();
   const up=V(0,1,0).applyQuaternion(cameraRotation).normalize();
   const placed=[];
   for(let i=0;i<this.scaleCubes.length;i++){
    const cube=this.scaleCubes[i];
    const base=axes[i].dir.clone().multiplyScalar(2.55);
    cube.position.copy(base);this.group.updateMatrixWorld(true);
    const targets=[...this.moveHeads.map(screenPos),...placed];
    const score=()=>Math.min(...targets.map(t=>dist(screenPos(cube),t)));
    if(score()>=67){placed.push(screenPos(cube));continue;}
    let best=base.clone(),bestScore=score();
    for(const amount of [.85,1.35,1.85]){
     for(const d of [right,right.clone().negate(),up,up.clone().negate()]){
      cube.position.copy(base).addScaledVector(d,amount);
      this.group.updateMatrixWorld(true);
      const candidateScore=score();
      if(candidateScore>bestScore){best=cube.position.clone();bestScore=candidateScore;}
     }
     if(bestScore>=74)break;
    }
    cube.position.copy(best);this.group.updateMatrixWorld(true);
    placed.push(screenPos(cube));
   }
  }
  update(){
   if(!this.selected||!this.active){this.group.visible=false;
    if(this.hud)this.hud.hidden=true;return;}
   this.group.visible=true;this.group.position.copy(
    this.selected.root.getWorldPosition(V()));
   const distance=this.camera.position.distanceTo(this.group.position);
   this.group.scale.setScalar(cap(distance*.075,.45,2.5));
   // Keep X/Y/Z rings world-aligned. The gold outer ring is a billboard.
   this.group.quaternion.identity();
   const face=this.camera.getWorldQuaternion(new THREE.Quaternion());
   for(const ring of this.viewRings)ring.quaternion.copy(face);
   this.spreadUniversalHandles();
   this.updateCad();
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
  screenAngle(e,origin=this.group.position){
   const rect=this.canvas.getBoundingClientRect();
   if(!rect.width||!rect.height)return null;
   const center=origin.clone().project(this.camera);
   return Math.atan2((1-center.y)*rect.height/2-(e.clientY-rect.top),
    (e.clientX-rect.left)-(center.x+1)*rect.width/2);
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
  touchHandleAt(e){
   if(!['move','scale','universal'].includes(this.mode))return null;
   const rect=this.canvas.getBoundingClientRect();
   const targets=this.mode==='move'?this.moveHeads:
    this.mode==='scale'?this.scaleCubes:[...this.moveHeads,...this.scaleCubes];
   let choice=null;
   for(const handle of targets){
    if(!handle.visible)continue;
    const world=handle.getWorldPosition(V()).project(this.camera);
    if(world.z< -1||world.z>1)continue;
    const x=rect.left+(world.x+1)*rect.width/2;
    const y=rect.top+(1-world.y)*rect.height/2;
    const distance=Math.hypot(e.clientX-x,e.clientY-y);
    const radius=handle.userData.operation==='scale'?36:32;
    if(distance<=radius&&(!choice||distance<choice.distance))
     choice={handle,distance};
   }
   return choice?.handle||null;
  }
  start(e){
   if(!this.active||!this.selected||e.button!==0||e.isPrimary===false)return false;
   this.update();this.group.updateMatrixWorld(true);
   if(!this.rayAt(e))return false;
   const hits=this.ray.intersectObjects(this.group.children,false)
    .filter(h=>h.object.visible);
   const precise=(e.pointerType==='touch'||e.pointerType==='pen')?
    this.touchHandleAt(e):null;
   const chosen=precise||hits[0]?.object;
   if(!chosen)return false;
   const obj=this.selected,axis=chosen.userData.axis,
    operation=this.mode==='universal'?chosen.userData.operation:this.mode,
    origin=obj.root.getWorldPosition(V());
   const onGround=this.onPlane(e,origin.y);
   const rotation=obj.rotation||{x:obj.root.rotation.x,y:obj.rot||0,
    z:obj.root.rotation.z};
   this.drag={pointerId:e.pointerId,axis,mode:operation,
    sx:e.clientX,sy:e.clientY,px:e.clientX,py:e.clientY,
    basePosition:obj.root.position.clone(),origin,
    baseEuler:{x:rotation.x||0,y:rotation.y||0,z:rotation.z||0},
    baseQuaternion:obj.root.quaternion.clone(),
    viewAxis:this.camera.getWorldDirection(V()).negate().normalize(),
    scale:obj.scale,axes:{...obj.axes},p:onGround,
    lastAngle:operation==='rotate'?(axis==='view'?
     this.screenAngle(e):this.rotationAngle(e,axis,origin)):null,
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
    const angle=drag.axis==='view'?this.screenAngle(e):
     this.rotationAngle(e,drag.axis,drag.origin);
    if(angle!==null&&drag.lastAngle!==null){
     drag.accumulated+=wrapAngle(angle-drag.lastAngle);
     drag.lastAngle=angle;
    }else{
     // If a ring is edge-on to the camera, keep gesture rotation usable.
     drag.accumulated+=((e.clientX-drag.px)-(e.clientY-drag.py))*.009;
     if(angle!==null)drag.lastAngle=angle;
    }
    if(drag.axis==='view'){
     // Rotate the entire selected object around the screen-facing axis.
     // Quaternion prevents view-ring rotation from becoming a fake yaw.
     let rotation=drag.accumulated;
     if(e.shiftKey)rotation=Math.round(rotation/(Math.PI/12))*(Math.PI/12);
     const delta=new THREE.Quaternion().setFromAxisAngle(drag.viewAxis,rotation);
     obj.root.quaternion.copy(drag.baseQuaternion).premultiply(delta);
     obj.rotation={x:obj.root.rotation.x,y:obj.root.rotation.y,
      z:obj.root.rotation.z};
     obj.rot=obj.rotation.y;
    }else{
     let next=drag.baseEuler[drag.axis]+drag.accumulated;
     if(e.shiftKey)next=Math.round(next/(Math.PI/12))*(Math.PI/12);
     obj.rotation=obj.rotation||{...drag.baseEuler};
     obj.rotation[drag.axis]=next;
     obj.rot=obj.rotation.y;
     obj.root.rotation.set(obj.rotation.x,obj.rotation.y,obj.rotation.z,'XYZ');
    }
   }else if(drag.mode==='scale'){
    const factor=Math.exp((dx-dy)*.008);
    if(drag.axis==='all')obj.scale=cap(drag.scale*factor,.1,10);
    else obj.axes[drag.axis]=cap(drag.axes[drag.axis]*factor,.1,10);
    obj.root.scale.set((obj.mirrorX?-1:1)*obj.scale*obj.axes.x,
     obj.scale*obj.axes.y,obj.scale*obj.axes.z);
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
