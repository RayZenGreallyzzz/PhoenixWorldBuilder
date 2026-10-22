/* True endpoint sockets for curved walls (Phoenix dungeon arcs).
 * No extra meshes or online dependencies; supports existing imported GLBs.
 */
const BuildCurves=(()=>{
 const cache=new WeakMap();
 const isArc=(kind,root)=>['arc90','arc180'].includes(root?.userData?.pwbModuleShape)||/(?:^|[\/:_-])arc[_-]?r\d|полукругл|curved[_-]?wall|wall[_-]?curved|round[_-]?wall/i.test(String(kind||''));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const avg=(a,b)=>a.clone().add(b).multiplyScalar(.5);
 const theta=v=>Math.atan2(-v.z,v.x);
 const rotate=(v,r)=>new THREE.Vector3(v.x*Math.cos(r)+v.z*Math.sin(r),0,-v.x*Math.sin(r)+v.z*Math.cos(r));
 const localToWorld=(root,p)=>p.clone().applyMatrix4(root.matrixWorld);
 const direction=(root,vec)=>vec.clone().transformDirection(root.matrixWorld).setY(0).normalize();
 function rawArcSockets(root,kind){
  if(!isArc(kind,root))return null;
  if(root.userData?.pwbModuleSockets?.length===2)
   return root.userData.pwbModuleSockets.map((s,i)=>({
    name:i===0?'begin':'end',point:new THREE.Vector3(...s.point),out:new THREE.Vector3(...s.out)
   }));
  root.updateWorldMatrix(true,true);
  const bounds=BuildSnap.attrBounds(root);
  if(bounds.isEmpty())return null;
  // The provided arc GLBs store cross-sections as consecutive
  // bottom-inner/bottom-outer/top-inner/top-outer vertices.
  // The first/last pairs are REAL end caps, unlike the rectangle's extrema.
  const inverse=root.matrixWorld.clone().invert(),mat=new THREE.Matrix4();
  const pos=new THREE.Vector3(),points=[];
  let found=false;
  root.traverse(obj=>{
   if(found||!obj.isMesh||!obj.geometry?.attributes?.position)return;
   const attr=obj.geometry.attributes.position;
   if(attr.count>20000||attr.count<12)return;
   mat.multiplyMatrices(inverse,obj.matrixWorld);
   let vertices=[];
   for(let i=0;i<attr.count;i++){
    pos.set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(mat);
    if(Math.abs(pos.y-bounds.min.y)<.015){
     if(!vertices.length||pos.distanceTo(vertices[vertices.length-1])>1e-5)
      vertices.push(pos.clone());
    }
   }
   if(vertices.length>=6&&vertices.length%2===0){
    points.push(...vertices);found=true;
   }
  });
  if(points.length<6)return null;
  const first=avg(points[0],points[1]),next=avg(points[2],points[3]);
  const n=points.length,last=avg(points[n-2],points[n-1]),before=avg(points[n-4],points[n-3]);
  const beginWidth=dist(points[0],points[1]),endWidth=dist(points[n-2],points[n-1]);
  if(beginWidth<.015||endWidth<.015||beginWidth>2||endWidth>2||
     dist(first,next)<.04||dist(last,before)<.04||dist(first,last)<.3)return null;
  // A cap's two vertices define the actual joint plane. Its perpendicular
  // is the exact outgoing tangent, unlike a neighboring arc-segment chord
  // which is 3.75–5 degrees off and leaves visible seams on thick walls.
  const capOut=(a,b,rough)=>{
   const cross=b.clone().sub(a).setY(0);
   const tangent=new THREE.Vector3(-cross.z,0,cross.x).normalize();
   if(tangent.dot(rough)<0)tangent.negate();
   return tangent;
  };
  const beginOut=capOut(points[0],points[1],first.clone().sub(next));
  const endOut=capOut(points[n-2],points[n-1],last.clone().sub(before));
  return [{name:'begin',point:first,out:beginOut},{name:'end',point:last,out:endOut}];
 }
 function localSockets(root,kind){
  if(!isArc(kind,root))return null;
  const previous=cache.get(root);
  if(previous&&previous.kind===kind)return previous.sockets;
  const sockets=rawArcSockets(root,kind);
  if(sockets)cache.set(root,{kind,sockets});
  return sockets;
 }
 function sourceSockets(info){
  // A 90-degree corner exposes two genuine arm-end sockets. Its AABB
  // extrema describe a phantom diagonal and must not be used for arcs.
  if(info.root?.userData?.pwbModuleSockets?.length===2)
   return info.root.userData.pwbModuleSockets.map((s,i)=>({
    name:i===0?'begin':'end',point:localToWorld(info.root,new THREE.Vector3(...s.point)),
    out:direction(info.root,new THREE.Vector3(...s.out)),curved:isArc(info.entry.kind,info.root)
   }));
  if(info.sockets?.length)return info.sockets.map(x=>({...x,point:x.point.clone(),out:x.out.clone()}));
  const local=localSockets(info.root,info.entry.kind);
  if(local)return local.map(s=>({name:s.name,point:localToWorld(info.root,s.point),out:direction(info.root,s.out),curved:true}));
  return [{name:'a',point:info.a.clone(),out:info.dir.clone().negate(),curved:false},
   {name:'c',point:info.c.clone(),out:info.dir.clone(),curved:false}];
 }
 function incomingSockets(w,box){
  const root=w.ghost||w.assetCache?.get(w.placement)||w.makeBuiltin?.(w.placement);
  if(!root)return null;
  if(root.userData?.pwbModuleSockets?.length===2)
   return root.userData.pwbModuleSockets.map((s,i)=>({
    name:i===0?'begin':'end',point:new THREE.Vector3(...s.point),
    out:new THREE.Vector3(...s.out)
   }));
  const cat=w.placementCategory||w.categoryForKind?.(w.placement)||'wall';
  if(cat==='corner'&&typeof BuildJoin!=='undefined'){
   const arms=BuildJoin.cornerArms(root,w.placement,cat);
   if(arms)return arms.map(x=>({name:x.name,point:x.tip.clone(),
    out:x.tip.clone().sub(x.pivot).setY(0).normalize()}));
   return null; // Unknown L-shaped GLB: do not guess endpoints.
  }
  const curve=localSockets(root,w.placement);
  if(curve)return curve;
  // Standard walls and doors retain their real bounding-box end sockets.
  const xWide=(box.max.x-box.min.x)>=(box.max.z-box.min.z);
  const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2,y=box.min.y;
  return xWide?[
   {name:'a',point:new THREE.Vector3(box.min.x,y,cz),out:new THREE.Vector3(-1,0,0)},
   {name:'c',point:new THREE.Vector3(box.max.x,y,cz),out:new THREE.Vector3(1,0,0)}
  ]:[
   {name:'a',point:new THREE.Vector3(cx,y,box.min.z),out:new THREE.Vector3(0,0,-1)},
   {name:'c',point:new THREE.Vector3(cx,y,box.max.z),out:new THREE.Vector3(0,0,1)}
  ];
 }
 function connect(w,p,candidates,box){
  if(w.joinMode==='free'||w.joinMode==='stack')return null;
  const isIncomingArc=isArc(w.placement,w.ghost);
  if(!isIncomingArc&&!candidates.some(x=>isArc(x.entry.kind,x.root)))return null;
  const slots=incomingSockets(w,box);if(!slots)return null;
  const scale=w.placementScale||1;
  const center=new THREE.Vector3((box.min.x+box.max.x)/2,0,(box.min.z+box.max.z)/2);
  const floorIndex=w.floorLevel||0;
  const nominal=w.heightAt(p.x,p.z)+floorIndex*(w.storeyHeight||2.6);
  const maxReach=Math.max(3.25,Math.min(9,Math.hypot(box.max.x-box.min.x,box.max.z-box.min.z)*scale*.65+2.5));
  let best=null;
  for(const info of candidates){
   const otherStory=info.entry.data?.storey;
   if(Number.isInteger(otherStory)&&otherStory!==floorIndex)continue;
   if(!Number.isInteger(otherStory)&&floorIndex>0&&Math.abs(info.bottom-nominal)>2)continue;
   if(!isIncomingArc&&!isArc(info.entry.kind,info.root))continue;
   for(const target of sourceSockets(info)){
    for(const slot of slots){
     const desired=target.out.clone().negate();
     let yaw=theta(desired)-theta(slot.out);
     yaw+=(w.placementRotation||0)*Math.PI/180;
     const shifted=rotate(slot.point,yaw).multiplyScalar(scale);
     const position=new THREE.Vector3(target.point.x-shifted.x,
       info.bottom-slot.point.y*scale+(w.placementLift||0),
       target.point.z-shifted.z);
     const visualCenter=position.clone().add(rotate(center,yaw).multiplyScalar(scale));
     const d=dist(visualCenter,p);
     if(d>maxReach)continue;
     const endpointDist=dist(target.point,p);
     // Cursor chooses the intended joint. Preserve the user's selected
     // rotation as a deliberate additional turn around the socket.
     const score=d+endpointDist*.08+(isIncomingArc?0:.05);
     if(best===null||score<best.score)best={score,position,yaw,reference:info.entry.data?.id,
      target:target.name,source:slot.name,curveJoin:true};
    }
   }
  }
  if(!best)return null;
  return {position:best.position,rotation:((best.yaw*180/Math.PI)%360+360)%360,
   snapped:true,wallEnd:true,curveJoin:true,edge:true,
   joinedTo:'curved-socket',reference:best.reference,
   category:w.placementCategory||'wall',
   sourceSocket:best.source,targetSocket:best.target};
 }
 return {isArc,localSockets,sourceSockets,incomingSockets,connect};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildCurves;
