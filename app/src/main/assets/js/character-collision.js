/* Phoenix Builder offline character collisions.
 * Capsule-like horizontal probes against ACTUAL rendered mesh triangles.
 * No invisible full-wall boxes: passage and door holes really pass.
 * Triangle collision is limited to near-field objects for Android FPS.
 */
const CharacterCollision=(()=>{
 'use strict';
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 class Solver{
  constructor({radius=.23,height=1.7,stepHeight=.32,groundY=0}={}){
   this.radius=radius;this.height=height;this.stepHeight=stepHeight;
   this.groundY=groundY;this.ray=new THREE.Raycaster();
   this.cache=new WeakMap();this.stats={nearby:0,blocked:0};
  }
  broad(entry,point,reach=1){
   if(!entry?.root||entry.collision===false||entry.root.visible===false)return false;
   const root=entry.root;root.updateWorldMatrix(true,true);
   const world=root.matrixWorld.elements,prev=this.cache.get(root);
   const changed=!prev||prev.elements.some((v,i)=>v!==world[i])||
    prev.children!==root.children.length;
   let saved=prev;
   if(changed){
    saved={elements:Array.from(world),children:root.children.length,
     bounds:new THREE.Box3().setFromObject(root),meshes:[]};
    // Reuse the stable collision mesh list instead of traversing complex
    // imported GLBs for every joystick sub-step. Visibility is checked below.
    root.traverse(mesh=>{
     if(mesh.isMesh&&mesh.geometry?.attributes?.position&&
        !mesh.userData?.phoenixLODProxy)saved.meshes.push(mesh);
    });
    this.cache.set(root,saved);
   }
   const box=saved.bounds;
   if(box.isEmpty())return false;
   return point.x>=box.min.x-reach&&point.x<=box.max.x+reach&&
    point.z>=box.min.z-reach&&point.z<=box.max.z+reach&&
    point.y<this.height+box.max.y+.25&&point.y+this.height>=box.min.y-.35;
  }
  meshes(entries,point,reach=1,isStair=()=>false){
   const list=[],stairMeshes=new Set();
   let stepLimit=this.stepHeight;
   for(const entry of entries||[]){
    if(!this.broad(entry,point,reach))continue;
    const saved=this.cache.get(entry.root);
    const stair=!!isStair(entry);
    if(stair){
     const scale=entry.root.getWorldScale(V());
     // Rise grows when a real staircase is scaled. Bound the assist to 70cm,
     // and NEVER apply the enlarged step cap to unrelated wall/floor meshes.
     stepLimit=Math.max(stepLimit,clamp(this.stepHeight*Math.max(1,Math.abs(scale.y)),
      this.stepHeight,.70));
    }
    for(const m of saved?.meshes||[])if((m.visible||m.userData?.phoenixLODInstalled)
     &&m.geometry?.attributes?.position){
      list.push(m);if(stair)stairMeshes.add(m);
     }
   }
   this.activeStepHeight=stepLimit;
   this.activeStairMeshes=stairMeshes;
   this.stats.nearby=list.length;
   return list;
  }
  // Raycaster with temporary Two-Sided triangle hits. Restored synchronously,
  // so no mesh materials are permanently altered and render looks unchanged.
  hits(ray,meshes,near,far){
   this.ray.set(ray.origin,ray.direction);
   this.ray.near=Math.max(0,near);this.ray.far=far;
   const saved=[];
   for(const mesh of meshes){
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const m of materials)if(m){
     saved.push([m,m.side]);m.side=THREE.DoubleSide;
    }
   }
   try{return this.ray.intersectObjects(meshes,false)}
   finally{for(const [m,side] of saved)m.side=side}
  }
  wallBlock(origin,step,meshes){
   const length=step.length();if(length<1e-7||!meshes.length)return false;
   const dir=step.clone().normalize(),across=V(-dir.z,0,dir.x);
   const r=this.radius;
   for(const y of [.25,.78,1.43]){
    const height=clamp(y,.1,this.height-.1);
    for(const offset of [-.6,0,.6]){
     const start=origin.clone().add(V(0,height,0))
      .addScaledVector(across,offset*r);
     // Reject walls only when their actual vertical polygon intersects
     // the capsule probes ahead. Door/window openings remain passable.
     const hits=this.hits(new THREE.Ray(start,dir),meshes,0,length+r+.002);
     for(const hit of hits){
      if(hit.distance>length+r+.002)continue;
      const norm=hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld);
      if(norm&&Math.abs(norm.y)>.65)continue; // walkable horizontal floors
      return true;
     }
    }
   }
   return false;
  }
  support(position,meshes){
   const cap=Math.max(this.stepHeight,this.activeStepHeight||this.stepHeight);
   const start=position.clone().add(V(0,cap+.16,0));
   const hits=this.hits(new THREE.Ray(start,V(0,-1,0)),meshes,0,
    cap+.16+.65);
   // Terrain is a sparse heightfield. An optional function lets the
   // unchanged collision solver follow authored hills/valleys with
   // existing joystick + camera movement (including negative heights).
   const terrain=typeof this.groundY==='function'?
    this.groundY(position.x,position.z):this.groundY;
   let support=Number.isFinite(terrain)?terrain:0;
   for(const hit of hits){
    const n=hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld);
    if(!n||n.y<.55||hit.point.y>start.y+.001)continue;
    const height=hit.point.y;
    const topLimit=this.activeStairMeshes?.has(hit.object)?cap:this.stepHeight;
    if(height>=position.y-.65&&height<=position.y+topLimit+.002)
     support=Math.max(support,height);
   }
   return support;
  }
  move(position,delta,entries,isStair=()=>false){
   if(!position||!delta)return {position:position?.clone()||V(),blocked:false};
   let point=position.clone(),blocked=false;
   const horizontal=Math.hypot(delta.x,delta.z),count=Math.max(1,Math.ceil(horizontal/.14));
   for(let i=0;i<count;i++){
    // Axis separation allows natural sliding along walls and column corners.
    for(const axis of ['x','z']){
     const diff=delta[axis]/count;
     if(Math.abs(diff)<1e-8)continue;
     const move=V(axis==='x'?diff:0,0,axis==='z'?diff:0);
     const candidate=point.clone().add(move);
     const near=this.meshes(entries,candidate,Math.abs(diff)+this.radius+1,isStair);
     const maxRise=this.activeStepHeight;
     // Determine whether the next tread is walkable BEFORE testing its riser.
     // Otherwise a vertical stair face is classified as a solid wall and the
     // character can never reach the horizontal surface above it.
     const nextGround=this.support(candidate,near);
     const canStep=nextGround<=point.y+maxRise+.002&&
      nextGround>=point.y-.65;
     const probe=point.clone();
     if(canStep)probe.y=Math.max(point.y,nextGround);
     let stopped=this.wallBlock(probe,move,near);
     if(stopped){
      // A capsule reaches a riser *before* its center is over the tread.
      // Probe a short distance ahead only when a wall test blocked motion;
      // this prevents 30 cm GLB stairs from acting like full-height walls.
      const reach=candidate.clone().addScaledVector(move.clone().normalize(),
       this.radius+.035);
      const ahead=this.support(reach,near);
      if(ahead>point.y+.002&&ahead<=point.y+maxRise+.002){
       probe.y=Math.max(probe.y,ahead);
       stopped=this.wallBlock(probe,move,near);
      }
     }
     if(stopped){blocked=true;this.stats.blocked++;continue}
     point.copy(candidate);
     if(canStep)point.y=nextGround;
    }
    const near=this.meshes(entries,point,this.radius+1,isStair);
    const level=this.support(point,near);
    // Enlarged rise applies only to recognized staircase tread meshes.
    if(level<=point.y+this.activeStepHeight+.002)point.y=level;
   }
   return {position:point,blocked,displacement:point.clone().sub(position)};
  }
 }
 return {Solver};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CharacterCollision;
