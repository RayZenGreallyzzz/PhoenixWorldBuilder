/* Touch gizmo: 3D axis arrows (X/Y/Z), Y rotation ring and scale cubes.
 * All adjustments use the same numeric model state saved by CleanBuilder.
 */
const BuilderGizmo=(()=>{
 'use strict';
 const cap=(v,a,b)=>Math.min(b,Math.max(a,v));
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 class Gizmo{
  constructor(scene,camera,canvas,ray){
   this.scene=scene;this.camera=camera;this.canvas=canvas;this.ray=ray;
   this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;
   this.selected=null;this.mode='move';this.drag=null;
   this.build();
  }
  makeMesh(geo,color,axis){
   const mat=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true,opacity:.94,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(geo,mat);mesh.userData.axis=axis;
   mesh.renderOrder=1000;this.group.add(mesh);return mesh;
  }
  build(){
   this.handles={move:[],rotate:[],scale:[]};
   const axes=[{a:'x',color:0xff5e69,dir:V(1,0,0)},
    {a:'y',color:0x5aea96,dir:V(0,1,0)},
    {a:'z',color:0x50a2ff,dir:V(0,0,1)}];
   for(const a of axes){
    const shaft=this.makeMesh(new THREE.CylinderGeometry(.035,.035,.85,9),a.color,a.a);
    shaft.position.copy(a.dir).multiplyScalar(.47);
    shaft.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(shaft);
    const head=this.makeMesh(new THREE.ConeGeometry(.14,.25,10),a.color,a.a);
    head.position.copy(a.dir).multiplyScalar(.98);
    head.quaternion.setFromUnitVectors(V(0,1,0),a.dir);
    this.handles.move.push(head);
    const cube=this.makeMesh(new THREE.BoxGeometry(.24,.24,.24),a.color,a.a);
    cube.position.copy(a.dir).multiplyScalar(.95);
    this.handles.scale.push(cube);
   }
   const ring=this.makeMesh(new THREE.TorusGeometry(.92,.07,8,64),0xf6cb54,'y');
   ring.rotation.x=Math.PI/2;this.handles.rotate.push(ring);
   const center=this.makeMesh(new THREE.BoxGeometry(.19,.19,.19),0xffffff,'all');
   this.handles.scale.push(center);
   this.showMode();
  }
  showMode(){
   for(const [mode,handles] of Object.entries(this.handles))
    for(const mesh of handles)mesh.visible=this.mode===mode;
  }
  attach(obj){
   this.selected=obj||null;this.drag=null;this.group.visible=!!obj;this.update();
  }
  setMode(mode){
   if(!this.handles[mode])return;
   this.mode=mode;this.showMode();this.update();
  }
  update(){
   if(!this.selected){this.group.visible=false;return}
   this.group.visible=true;this.group.position.copy(this.selected.root.position);
   const d=this.camera.position.distanceTo(this.group.position);
   this.group.scale.setScalar(cap(d*.075,.45,2.5));
  }
  rayAt(e){
   const rect=this.canvas.getBoundingClientRect();
   const x=(e.clientX-rect.left)/rect.width*2-1;
   const y=-(e.clientY-rect.top)/rect.height*2+1;
   this.ray.setFromCamera(new THREE.Vector2(x,y),this.camera);
  }
  onPlane(e,y){
   this.rayAt(e);
   const plane=new THREE.Plane(V(0,1,0),-y),hit=V();
   return this.ray.ray.intersectPlane(plane,hit)?hit:null;
  }
  start(e){
   if(!this.selected||e.button!==0||e.isPrimary===false)return false;
   this.update();this.group.updateMatrixWorld(true);this.rayAt(e);
   const hits=this.ray.intersectObjects(this.group.children,true).filter(h=>h.object.visible);
   if(!hits.length)return false;
   const hit=hits[0],obj=this.selected;
   const p=this.onPlane(e,obj.root.position.y);
   const angle=p?Math.atan2(p.z-obj.root.position.z,p.x-obj.root.position.x):0;
   this.drag={pointerId:e.pointerId,axis:hit.object.userData.axis,
    mode:this.mode,sx:e.clientX,sy:e.clientY,
    basePosition:obj.root.position.clone(),baseRot:obj.rot||0,
    scale:obj.scale,axes:{...obj.axes},p,angle,changed:false};
   return true;
  }
  move(e,obj,options={}){
   // Grid is optional and independent of fine nudge step and socket magnet.
   const gridEnabled=options?.gridEnabled===true,
    gridStep=PrecisionPlacement.step(options?.gridStep,.25);
   const drag=this.drag;
   if(!drag||drag.pointerId!==e.pointerId||!obj)return false;
   const dy=e.clientY-drag.sy,dx=e.clientX-drag.sx;
   if(Math.hypot(dx,dy)<3&&!drag.changed)return true;
   drag.changed=true;
   if(drag.mode==='move'){
    const axis=drag.axis;
    if(axis==='y'){
     const distance=this.camera.position.distanceTo(obj.root.position);
     const units=-(dy*.005*Math.max(1,distance));
     obj.root.position.y=PrecisionPlacement.coordinate(
      drag.basePosition.y+units,gridEnabled,gridStep);
    }else{
     const hit=this.onPlane(e,drag.basePosition.y);
     if(hit&&drag.p){
      const units=hit[axis]-drag.p[axis];
      obj.root.position[axis]=PrecisionPlacement.coordinate(
       drag.basePosition[axis]+units,gridEnabled,gridStep);
     }
    }
   }else if(drag.mode==='rotate'){
    const hit=this.onPlane(e,drag.basePosition.y);
    if(hit){
     const theta=Math.atan2(hit.z-obj.root.position.z,hit.x-obj.root.position.x);
     const snap=Math.PI/36; // 5-degree increments.
     obj.rot=Math.round((drag.baseRot+theta-drag.angle)/snap)*snap;
     obj.root.rotation.y=obj.rot;
    }
   }else if(drag.mode==='scale'){
    const factor=Math.exp((dx-dy)*.008);
    if(drag.axis==='all')obj.scale=cap(drag.scale*factor,.1,10);
    else obj.axes[drag.axis]=cap(drag.axes[drag.axis]*factor,.1,10);
    obj.root.scale.set(obj.scale*obj.axes.x,obj.scale*obj.axes.y,obj.scale*obj.axes.z);
   }
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
