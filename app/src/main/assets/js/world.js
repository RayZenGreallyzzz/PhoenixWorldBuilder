/* Phoenix World Builder runtime, Three.js r140. All rendering local/offline. */
class WorldBuilder{
 constructor(canvas){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1));this.renderer.outputEncoding=THREE.sRGBEncoding;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=0.80;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#8ba8b9');this.scene.fog=new THREE.Fog('#8ba8b9',75,190);
  this.scene.add(new THREE.HemisphereLight('#dce5e6','#515c50',0.68));this.sun=new THREE.DirectionalLight('#fff0db',0.78);this.sun.position.set(30,58,20);this.scene.add(this.sun);
  this.camera=new THREE.PerspectiveCamera(59,1,.08,280);this.yaw=.65;this.pitch=.55;this.distance=26;this.target=new THREE.Vector3(0,2,0);
  this.clock=new THREE.Clock();this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();
  this.objects=[];this.nextId=1;this.assetCache=new Map();this.assetAnimations=new Map();this.avatarMixer=null;this.avatarHeight=1.8;this.avatarModel=null;this.avatarOriginalHeight=0;this.avatarOriginalFitSize=0;this.avatarOriginalBounds=null;this.avatarSourceDimensions=null;this.avatarSource=null;this.avatarAnimationsEnabled=true;this.avatarGroundTimer=0;this.avatarGroundOffset=0;this.invertCameraX=false;this.avatarActions={};this.avatarClips=[];this.avatarMotionState='';this.avatarAnimationOverride=null;this.mode='build';this.invertJoystickX=false;this.invertJoystickY=false;this.avatarFacingOffset=Math.PI;this.placement=null;this.placementCategory=null;this.placementRotation=0;this.placementScale=1;this.smartSnap=true;this.edgeShift=0;this.lastSnapResult=null;this.categoryForKind=null;this.onSnapChanged=()=>{};this.selected=null;this.ghost=null;this.moveTarget=null;
  this.snap=2;this.floorLevel=0;this.stroke=false;this.brush='raise';this.brushSize=6;this.brushPower=.3;this.terrainPaint='#668358';this.currentPaint='#b7ac91';this.textureId=null;
  this.renderScale=.75;this.fpsLimit=30;this.tLast=0;this.frames=0;this.fps=0;this.undo=[];this.onChanged=()=>{};this.onSelected=()=>{};
  this.terrainSize=128;this.segments=64;this.terrain=new THREE.Mesh(new THREE.PlaneGeometry(128,128,64,64),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));this.terrain.rotation.x=-Math.PI/2;
  const ca=new Float32Array((65*65)*3);for(let i=0;i<ca.length;i+=3){ca[i]=.32;ca[i+1]=.48;ca[i+2]=.30;}
  this.terrain.geometry.setAttribute('color',new THREE.BufferAttribute(ca,3));this.terrain.material.needsUpdate=true;this.terrain.receiveShadow=false;this.scene.add(this.terrain);
  this.grid=new THREE.GridHelper(128,64,0x497c70,0x587569);this.grid.position.y=.025;this.grid.material.transparent=true;this.grid.material.opacity=.18;this.scene.add(this.grid);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(128,128),new THREE.MeshBasicMaterial({color:0x297f9d,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.y=-.4;this.scene.add(water);
  this.highlight=new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)),0x63ffce);this.scene.add(this.highlight);this.highlight.visible=false;
  this.player=new THREE.Group();this.player.position.set(0,1.4,0);this.scene.add(this.player);this.setupDefaultPlayer();this.player.visible=false;
  this.keys={};this.joy={x:0,y:0};this.running=false;this.playerSpeed=4;this.playerYaw=0;this.camOrbit=false;
  this.setQuality(.75,false);window.addEventListener('resize',()=>this.resize());this.resize();
 }
 setQuality(scale,shadows){this.renderScale=scale;this.sun.castShadow=!!shadows;this.renderer.shadowMap.enabled=!!shadows;this.scene.traverse(o=>{if(o.isMesh){o.castShadow=!!shadows;o.receiveShadow=!!shadows}});this.resize()}
 resize(){let r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;this.renderer.setSize(Math.round(r.width*this.renderScale),Math.round(r.height*this.renderScale),false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();}
 setupDefaultPlayer(){this.player.clear();const mat=new THREE.MeshStandardMaterial({color:'#475d7b'}),skin=new THREE.MeshStandardMaterial({color:'#e6be91'}),dark=new THREE.MeshStandardMaterial({color:'#253349'});
  const mk=(geo,m,x,y,z)=>{let o=new THREE.Mesh(geo,m);o.position.set(x,y,z);this.player.add(o);return o};
  mk(new THREE.CapsuleGeometry(.28,.72,4,8),mat,0,.35,0);mk(new THREE.SphereGeometry(.23,10,9),skin,0,1.17,0);
  mk(new THREE.BoxGeometry(.22,.69,.25),dark,-.17,-.45,0);mk(new THREE.BoxGeometry(.22,.69,.25),dark,.17,-.45,0);
  mk(new THREE.BoxGeometry(.15,.65,.22),skin,-.43,.43,0);mk(new THREE.BoxGeometry(.15,.65,.22),skin,.43,.43,0);
 }
 async setAvatar(id){
  const root=await this.getAsset(id);if(!root)throw new Error('Персонаж не найден в памяти');
  const clone=THREE.SkeletonUtils?.clone?THREE.SkeletonUtils.clone(root):root.clone(true);
  clone.updateMatrixWorld(true);
  if(this.avatarMixer)this.avatarMixer.stopAllAction();
  // Keep avatar scaling outside animated GLB nodes, whose animation
  // tracks may override the scene root's scale.
  this.player.clear();
  const wrapper=new THREE.Group();wrapper.name='AvatarScaleWrapper';
  wrapper.add(clone);this.player.add(wrapper);
  this.avatarModel=wrapper;this.avatarSource=clone;
  // glTF animation tracks sometimes target source-node UUIDs instead of names.
  const srcNodes=[],dstNodes=[];root.traverse(o=>srcNodes.push(o));clone.traverse(o=>dstNodes.push(o));
  const idMap=new Map(srcNodes.map((node,i)=>[node.uuid,dstNodes[i]?.uuid]));
  const clips=(this.assetAnimations.get(id)||[]).map(clip=>{
   const copy=clip.clone();
   for(const track of copy.tracks){
    const dot=track.name.indexOf('.');if(dot<=0)continue;
    const target=track.name.slice(0,dot);
    if(idMap.has(target))track.name=idMap.get(target)+track.name.slice(dot);
   }
   this.lockAvatarRootMotion(copy,dstNodes);
   return copy;
  });
  this.avatarClips=clips;this.avatarActions={};this.avatarMixer=clips.length?new THREE.AnimationMixer(clone):null;
  for(const clip of clips)this.avatarActions[clip.name]=this.avatarMixer.clipAction(clip);
  this.avatarAnimationOverride=null;this.avatarMotionState='';
  this.player.userData.avatar=id;
  this.setAvatarMotion(false,true);
  if(this.avatarMixer)this.avatarMixer.update(0);
  // The actual animated, skin-deformed mesh can be 100x larger than Box3.
  const bounds=this.measureAvatarPoseBounds(clone),size=bounds.getSize(new THREE.Vector3());
  if(bounds.isEmpty()||!Number.isFinite(size.y)||size.y<.000001)
   throw new Error('Не удалось измерить скелетную модель');
  this.avatarOriginalHeight=size.y;
  this.avatarOriginalFitSize=Math.max(size.y,size.x/1.6,size.z/1.6);
  this.avatarSourceDimensions={width:size.x,height:size.y,depth:size.z};
  this.avatarOriginalBounds={min:bounds.min.clone(),max:bounds.max.clone()};
  this.avatarGroundTimer=0;this.avatarGroundOffset=0;
  this.setAvatarHeight(this.avatarHeight);
  let rigged=false;clone.traverse(o=>{if(o.isSkinnedMesh)rigged=true});
  return {rigged,animations:clips.map(c=>c.name),originalSize:{width:size.x,height:size.y,depth:size.z},fitSize:this.avatarOriginalFitSize};
 }
 measureAvatarPoseBounds(sceneRoot,limit=3500){
  this.player.updateWorldMatrix(true,true);
  const toPlayer=new THREE.Matrix4().copy(this.player.matrixWorld).invert();
  const result=new THREE.Box3().makeEmpty(),point=new THREE.Vector3(),v=new THREE.Vector3(),temp=new THREE.Vector3();
  sceneRoot.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   const attr=mesh.geometry.attributes.position, count=attr.count,step=Math.max(1,Math.floor(count/limit));
   const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
   const skin=mesh.isSkinnedMesh&&mesh.skeleton&&indices&&weights;
   const matrices=skin?mesh.skeleton.bones.map((bone,i)=>
    new THREE.Matrix4().multiplyMatrices(bone.matrixWorld,mesh.skeleton.boneInverses[i])):null;
   for(let i=0;i<count;i+=step){
    point.fromBufferAttribute(attr,i);
    if(skin){
     v.set(0,0,0);let total=0;
     for(let k=0;k<4;k++){
      const axis=['getX','getY','getZ','getW'][k];
      const weight=weights[axis](i);if(weight<=0)continue;
      const matrix=matrices[indices[axis](i)];if(!matrix)continue;
      v.add(temp.copy(point).applyMatrix4(matrix).multiplyScalar(weight));total+=weight;
     }
     if(total<=0)v.copy(point).applyMatrix4(mesh.matrixWorld);
     else if(Math.abs(total-1)>.01)v.multiplyScalar(1/total);
    }else v.copy(point).applyMatrix4(mesh.matrixWorld);
    result.expandByPoint(v.applyMatrix4(toPlayer));
   }
  });
  return result;
 }
 lockAvatarRootMotion(clip,nodes){
  const lookup=new Map();
  for(const node of nodes){lookup.set(node.uuid,node);if(node.name&&!lookup.has(node.name))lookup.set(node.name,node)}
  let corrected=0;
  clip.tracks=clip.tracks.map(track=>{
   const dot=track.name.lastIndexOf('.');
   if(dot<1||track.name.slice(dot+1)!=='position')return track;
   const bone=lookup.get(track.name.slice(0,dot));
   if(!bone?.isBone||!(/(?:^|[:_]|mixamorig)(?:hips|pelvis)$/i.test(bone.name)||/^(?:root|rootbone)$/i.test(bone.name)))return track;
   // Keep the clip's initial pelvis translation (Mixamo bind pose differs).
   // Only remove horizontal drift so joystick controls world-space movement.
   if(track.values.length!==track.times.length*3)return track;
   const startX=track.values[0],startZ=track.values[2],copy=track.clone();
   for(let i=0;i<copy.values.length;i+=3){
    copy.values[i]=startX;copy.values[i+2]=startZ;
   }
   corrected++;
   return copy;
  });
  if(corrected)clip.resetDuration();
  return corrected;
 }
 setAvatarHeight(meters){
  const n=Number(meters);this.avatarHeight=THREE.MathUtils.clamp(Number.isFinite(n)?n:1.8,.01,20);
  if(!this.avatarModel||!this.avatarOriginalHeight||!this.avatarOriginalBounds)return;
  const s=this.avatarHeight/(this.avatarOriginalFitSize||this.avatarOriginalHeight),b=this.avatarOriginalBounds;
  this.avatarModel.scale.setScalar(s);
  this.avatarModel.position.set(-(b.min.x+b.max.x)*s*.5,-b.min.y*s-.85+this.avatarGroundOffset,-(b.min.z+b.max.z)*s*.5);
  this.avatarModel.updateMatrixWorld(true);
 }
 clearAvatar(){
  if(this.avatarMixer)this.avatarMixer.stopAllAction();
  this.avatarMixer=null;this.avatarActions={};this.avatarClips=[];this.avatarMotionState='';this.avatarAnimationOverride=null;this.avatarModel=null;this.avatarOriginalHeight=0;this.avatarOriginalFitSize=0;this.avatarOriginalBounds=null;this.avatarSourceDimensions=null;this.avatarSource=null;this.avatarAnimationsEnabled=true;this.avatarGroundOffset=0;this.avatarGroundTimer=0;
  this.player.userData.avatar=null;this.setupDefaultPlayer();
 }
 setAvatarGroundOffset(offset){
  const next=THREE.MathUtils.clamp(Number(offset)||0,-1,1);
  if(!this.avatarModel){this.avatarGroundOffset=next;return next}
  this.avatarModel.position.y+=next-this.avatarGroundOffset;
  this.avatarGroundOffset=next;return next;
 }
 syncAvatarGround(dt){
  if(!this.avatarSource||!this.avatarModel||this.mode==='build')return;
  this.avatarGroundTimer+=dt;if(this.avatarGroundTimer<.2)return;
  this.avatarGroundTimer=0;
  const bounds=this.measureAvatarPoseBounds(this.avatarSource,420);
  if(bounds.isEmpty()||!Number.isFinite(bounds.min.y))return;
  const diff=-.85+this.avatarGroundOffset-bounds.min.y;
  if(Math.abs(diff)>.015)this.avatarModel.position.y+=THREE.MathUtils.clamp(diff,-.35,.35)*.65;
 }
 toggleAvatarAnimations(){
  this.avatarAnimationsEnabled=!this.avatarAnimationsEnabled;
  if(!this.avatarAnimationsEnabled){this.avatarMixer?.stopAllAction();this.avatarMotionState='';}
  else{this.avatarMotionState='';this.setAvatarMotion(false,true);}
  return this.avatarAnimationsEnabled;
 }
 setAvatarMotion(moving,force=false){
  if(!this.avatarAnimationsEnabled||!this.avatarMixer||!this.avatarClips.length)return;
  const run=moving&&this.running;
  const state=this.avatarAnimationOverride||(!moving?'idle':run?'run':'walk');
  if(this.avatarMotionState===state&&!force)return;
  const clips=this.avatarClips;
  const find=rx=>clips.find(c=>rx.test(c.name.toLowerCase()));
  let desired=this.avatarAnimationOverride?clips.find(c=>c.name===this.avatarAnimationOverride):
   state==='idle'?find(/idle|stand|rest|breath|wait|покой|ожидан/):
   state==='run'?find(/run|sprint|бег/)||find(/walk|move|ход/):
   find(/walk|move|ход/)||find(/run|бег/);
  if(!desired&&state==='idle')desired=clips[0];
  if(!desired&&moving)desired=clips[0];
  if(!desired)return;
  const next=this.avatarActions[desired.name];
  if(!next)return;
  for(const [name,action] of Object.entries(this.avatarActions)){
   if(name!==desired.name&&action.isRunning())action.fadeOut(.18);
  }
  if(!next.isRunning()){next.reset().fadeIn(.18).play();}
  next.timeScale=run&&!/run|sprint|бег/i.test(desired.name)?1.6:1;
  this.avatarMotionState=state;
 }
 heightAt(x,z){const arr=this.terrain.geometry.attributes.position;const divisions=64,seg=2;let fx=Math.max(0,Math.min(63.999,(x+64)/seg)),fz=Math.max(0,Math.min(63.999,(z+64)/seg));let ix=Math.floor(fx), iz=Math.floor(fz),dx=fx-ix,dz=fz-iz;const get=(i,j)=>arr.getZ(j*65+i);let h0=get(ix,iz)*(1-dx)+get(ix+1,iz)*dx,h1=get(ix,iz+1)*(1-dx)+get(ix+1,iz+1)*dx;return h0*(1-dz)+h1*dz;}
 sculpt(x,z,amount=1){const pos=this.terrain.geometry.attributes.position,col=this.terrain.geometry.attributes.color,rad=this.brushSize,paint=new THREE.Color(this.terrainPaint);
  for(let j=0;j<65;j++)for(let i=0;i<65;i++){
   let vx=-64+i*2,vz=-64+j*2,d=Math.hypot(vx-x,vz-z);if(d>rad)continue;let fall=(1-d/rad)**2,idx=j*65+i;let h=pos.getZ(idx);
   if(this.brush==='raise')h+=fall*this.brushPower*.7*amount;
   else if(this.brush==='lower')h-=fall*this.brushPower*.7*amount;
   else if(this.brush==='smooth'){let sum=0,n=0;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){let ni=i+ox,nj=j+oy;if(ni>=0&&ni<65&&nj>=0&&nj<65){sum+=pos.getZ(nj*65+ni);n++}}h+=(sum/n-h)*fall*this.brushPower*amount;}
   else if(this.brush==='paint'){let k=Math.min(1,fall*this.brushPower*.65*amount);col.setXYZ(idx,THREE.MathUtils.lerp(col.getX(idx),paint.r,k),THREE.MathUtils.lerp(col.getY(idx),paint.g,k),THREE.MathUtils.lerp(col.getZ(idx),paint.b,k));}
   if(this.brush!=='paint')pos.setZ(idx,Math.max(-12,Math.min(22,h)));
  }
  pos.needsUpdate=true;col.needsUpdate=true;this.terrain.geometry.computeVertexNormals();this.terrain.geometry.computeBoundingSphere();this.terrain.geometry.computeBoundingBox();this.onChanged();
 }
 hit(cx,cy,objectOnly=false){const r=this.canvas.getBoundingClientRect();this.pointer.set(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);this.ray.setFromCamera(this.pointer,this.camera);
  if(objectOnly){const targets=this.objects.map(x=>x.mesh);const hits=this.ray.intersectObjects(targets,true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.objectId)o=o.parent;return o?.userData.objectId||null;}return null;}
  const floors=this.objects.filter(e=>{
   const cat=e.data.category||this.categoryForKind?.(e.kind)||e.kind;
   return cat==='foundation'||cat==='ceiling';
  }).map(e=>e.mesh);
  const hits=this.ray.intersectObjects([...floors,this.terrain],true);
  for(const hit of hits){
   if(hit.object===this.terrain)return hit.point;
   if(!hit.face)continue;
   const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
   if(normal.y>.55)return hit.point;
  }
  return this.ray.intersectObject(this.terrain,false)[0]?.point||null;
 }
 placementHeight(x,z,kind=this.placement,category=this.placementCategory){
  const raised=kind==='ceiling'||kind==='roof'||category==='ceiling'||category==='roof';
  return this.heightAt(x,z)+(this.floorLevel+(raised?1:0))*2.6;
 }
 changeFloor(delta){this.floorLevel=THREE.MathUtils.clamp(this.floorLevel+delta,0,20);this.updateGameGhost();return this.floorLevel+1;}
 setPlacementScale(value){const n=Number(value);if(!Number.isFinite(n))return this.placementScale;this.placementScale=THREE.MathUtils.clamp(n,.1,10);if(this.ghost)this.ghost.scale.setScalar(this.placementScale);this.updateGameGhost();return this.placementScale;}
 solvePlacement(p){
  if(typeof BuildSnap!=='undefined'&&this.placement&&!this.moveTarget)return BuildSnap.resolve(this,p);
  const x=Math.round(p.x/this.snap)*this.snap,z=Math.round(p.z/this.snap)*this.snap;
  return {position:new THREE.Vector3(x,this.placementHeight(x,z),z),rotation:this.placementRotation||0,snapped:false};
 }
 placeAt(p){
  if(!this.placement&&!this.moveTarget)return;
  const solved=this.solvePlacement(p),v=solved.position;
  this.remember();
  if(this.moveTarget){
   this.moveTarget.mesh.position.copy(v);this.moveTarget.data.pos=v.toArray();
   this.moveTarget=null;this.onChanged();return;
  }
  const color=typeof this.placement==='string'&&this.placement.startsWith('glb:')?null:this.currentPaint;
  const rec=this.instantiate(this.placement,{id:this.nextId++,pos:v.toArray(),rot:solved.rotation,scale:this.placementScale,category:this.placementCategory||this.categoryForKind?.(this.placement)||null,color,roughness:.85,metalness:0,texture:this.textureId||null,door:false,open:false});
  this.select(rec);this.onChanged();return rec;
 }
 instantiate(kind,data){let obj=this.makeBuiltin(kind); if(!obj){const cache=this.assetCache.get(kind);if(!cache)throw Error('Сначала импортируй '+kind);obj=cache.clone(true)}
  let entry={kind,data:JSON.parse(JSON.stringify(data)),mesh:obj};obj.userData.objectId=data.id;
  if(!('scale' in data))entry.data.scale=1;
  obj.position.fromArray(data.pos);obj.rotation.y=(data.rot||0)*Math.PI/180;obj.scale.setScalar(data.scale||1);this.scene.add(obj);obj.updateMatrixWorld(true);this.objects.push(entry);this.applyAppearance(entry);this.nextId=Math.max(this.nextId,entry.data.id+1);return entry;
 }
 makeBuiltin(kind){const group=new THREE.Group();let m=new THREE.MeshStandardMaterial({color:'#b7ac91',roughness:.85,side:THREE.DoubleSide}); const add=(geo,x,y,z,mat=m)=>{let mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh};
  if(kind==='floor'||kind==='ceiling')add(new THREE.BoxGeometry(2,.17,2),0,.08,0);
  else if(kind==='wall')add(new THREE.BoxGeometry(2,2.6,.22),0,1.3,0);
  else if(kind==='window'){add(new THREE.BoxGeometry(.38,2.6,.25),-.81,1.3,0);add(new THREE.BoxGeometry(.38,2.6,.25),.81,1.3,0);add(new THREE.BoxGeometry(1.28,.34,.25),0,2.43,0);add(new THREE.BoxGeometry(1.28,.55,.25),0,.27,0);add(new THREE.BoxGeometry(1.28,1.6,.035),0,1.35,0,new THREE.MeshStandardMaterial({color:'#a8d9e6',roughness:.05,metalness:.15,transparent:true,opacity:.43,side:THREE.DoubleSide}));}
  else if(kind==='roof'){const g=new THREE.BoxGeometry(2.5,.16,1.65);add(g,-.62,.65,0).rotation.z=-Math.PI/4;add(g,.62,.65,0).rotation.z=Math.PI/4;}
  else if(kind==='door'){const frame=new THREE.MeshStandardMaterial({color:'#6a5141',roughness:.9});add(new THREE.BoxGeometry(.18,2.6,.32),-.94,1.3,0,frame);add(new THREE.BoxGeometry(.18,2.6,.32),.94,1.3,0,frame);add(new THREE.BoxGeometry(2,.18,.3),0,2.52,0,frame);
    const hinge=new THREE.Group();hinge.position.x=-.86;group.add(hinge);const door=new THREE.Mesh(new THREE.BoxGeometry(1.75,2.35,.12),m);door.position.set(.88,1.19,0);hinge.add(door);const handle=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshStandardMaterial({color:'#c6ab55',metalness:.8,roughness:.35}));handle.position.set(1.53,1.18,.11);hinge.add(handle);group.userData.hinge=hinge;
  }else if(kind==='pillar')add(new THREE.CylinderGeometry(.25,.3,2.6,10),0,1.3,0);
  else if(kind==='stairs'){for(let n=0;n<6;n++)add(new THREE.BoxGeometry(2,.45,.45),0,.2+n*.38,-.95+n*.36)}
  else if(kind==='tree'){const bark=new THREE.MeshStandardMaterial({color:'#665044'}),leaf=new THREE.MeshStandardMaterial({color:'#31694a'});add(new THREE.CylinderGeometry(.25,.36,3,7),0,1.5,0,bark);add(new THREE.ConeGeometry(1.8,3.5,8),0,4.2,0,leaf)}
  else if(kind==='crate')add(new THREE.BoxGeometry(1,1,1),0,.5,0);
  else return null;
  group.name=kind;return group;
 }
 applyAppearance(entry){const c=entry.data.color?new THREE.Color(entry.data.color):null;entry.mesh.traverse(o=>{if(!o.isMesh)return;const old=o.material;o.material=Array.isArray(old)?old.map(m=>m.clone()):old.clone();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{
   // Glass and metal accents in built-ins keep their characteristic surfaces.
   if(m.transparent&&entry.kind==='window')return;
   if(m.color&&c)m.color.copy(c);
   if(m.roughness!==undefined)m.roughness=entry.data.roughness??.8;
   if(m.metalness!==undefined)m.metalness=entry.data.metalness??0;
   if(entry.data.texture&&this.textures?.get(entry.data.texture)){m.map=this.textures.get(entry.data.texture);m.needsUpdate=true;}
  });});this.setDoor(entry,entry.data.open||false);
 }
 setDoor(entry,open){entry.data.open=!!open;const h=entry.mesh.userData.hinge; if(h)h.rotation.y=open?-1.65:0;}
 toggleDoor(entry){if(!entry)return;this.remember();entry.data.door=true;entry.data.open=!entry.data.open;this.setDoor(entry,entry.data.open);if(!entry.mesh.userData.hinge){entry.mesh.rotation.y=((entry.data.rot||0)+(entry.data.open?80:0))*Math.PI/180;}this.onChanged();}
 select(entry){this.selected=entry||null;if(entry){this.highlight.setFromObject(entry.mesh);this.highlight.visible=true}else this.highlight.visible=false;this.onSelected(entry);}
 setMode(mode){
  const wasGame=this.mode==='walk'||this.mode==='playbuild',isGame=mode==='walk'||mode==='playbuild';
  this.mode=mode;this.player.visible=isGame;this.grid.visible=!isGame;this.highlight.visible=!isGame&&!!this.selected;
  if(isGame&&!wasGame){this.player.position.set(this.target.x,this.heightAt(this.target.x,this.target.z)+.85,this.target.z);this.distance=5.2;this.pitch=.34;}
  else if(!isGame&&wasGame){this.target.copy(this.player.position);this.target.y+=1;this.distance=17;this.pitch=.58;}
  if(mode==='playbuild'&&this.placement&&!this.ghost)this.setPlacement(this.placement,this.placementCategory);
  if(mode==='walk'&&this.ghost){this.ghost.removeFromParent();this.ghost=null;}
  this.onChanged();
 }
 forwardPlacementPoint(){
  const d=4.0,fx=-Math.sin(this.yaw),fz=-Math.cos(this.yaw);
  const x=THREE.MathUtils.clamp(this.player.position.x+fx*d,-62,62);
  const z=THREE.MathUtils.clamp(this.player.position.z+fz*d,-62,62);
  return new THREE.Vector3(x,this.placementHeight(x,z),z);
 }
 applyGhostPlacement(p){
  if(!this.ghost)return;
  const solved=this.solvePlacement(p);
  this.ghost.position.copy(solved.position);
  this.ghost.rotation.y=solved.rotation*Math.PI/180;
  this.ghost.scale.setScalar(this.placementScale);
  const last=this.lastSnapResult;
  this.lastSnapResult=solved;
  if(!!last?.snapped!==!!solved.snapped||last?.reference!==solved.reference)this.onSnapChanged(solved);
 }
 updateGameGhost(){if(this.mode!=='playbuild'||!this.ghost)return;this.applyGhostPlacement(this.forwardPlacementPoint());}
 toggleSmartSnap(){this.smartSnap=!this.smartSnap;this.updateGameGhost();return this.smartSnap;}
 shiftAlongEdge(delta){this.edgeShift=THREE.MathUtils.clamp(Math.round((this.edgeShift+delta)*100)/100,-20,20);this.updateGameGhost();return this.edgeShift;}
 rotatePlacement(){this.placementRotation=(this.placementRotation+90)%360;this.updateGameGhost();return this.placementRotation;}
 // Lightweight surface and obstacle collision for previewing assembled buildings.
 supportHeight(x,z,footY){
  let best=this.heightAt(x,z);const origin=new THREE.Vector3(x,footY+.58,z);
  const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,5);
  const targets=this.objects.filter(e=>e.kind!=='tree'&&e.kind!=='crate'&&!(e.data.door&&e.data.open)).map(e=>e.mesh);
  for(const hit of ray.intersectObjects(targets,true)){
   const normal=hit.face?.normal?.clone();if(!normal)continue;
   const nMatrix=new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);normal.applyMatrix3(nMatrix).normalize();
   if(normal.y<.60)continue;
   const y=hit.point.y;if(y>best&&y<=footY+.53&&y>=footY-1.1)best=y;
  }
  return best;
 }
 movementBlocked(a,b,footY){
  const d=b.clone().sub(a);d.y=0;const length=d.length();if(length<.0001)return false;
  const ray=new THREE.Raycaster(new THREE.Vector3(a.x,footY+1.05,a.z),d.normalize(),.02,length+.22);
  const targets=this.objects.filter(e=>!['floor','stairs','roof','tree'].includes(e.kind)&&!(e.data.door&&e.data.open)).map(e=>e.mesh);
  return ray.intersectObjects(targets,true).some(hit=>hit.distance<=length+.22);
 }

 setPlacement(kind,category=null){
  this.placement=kind;this.placementCategory=category;this.moveTarget=null;this.edgeShift=0;this.lastSnapResult=null;
  if(this.ghost)this.ghost.removeFromParent();
  this.ghost=kind?(this.makeBuiltin(kind)||this.assetCache.get(kind)?.clone(true)||null):null;
  if(this.ghost){
   this.ghost.traverse(m=>{if(m.isMesh){m.material=Array.isArray(m.material)?m.material.map(mat=>mat.clone()):m.material.clone();for(const mat of(Array.isArray(m.material)?m.material:[m.material])){mat.transparent=true;mat.opacity=.4;mat.depthWrite=false;}}});
   this.ghost.scale.setScalar(this.placementScale);this.scene.add(this.ghost);this.updateGameGhost();
  }
 }
 updateGhost(p){this.applyGhostPlacement(p)}
 action(act){const e=this.selected;if(!e)return false;this.remember();if(act==='rotate'){e.data.rot=(e.data.rot+90)%360;e.mesh.rotation.y=e.data.rot*Math.PI/180}
  else if(act==='copy'){const data=JSON.parse(JSON.stringify(e.data));data.id=this.nextId++;data.pos[0]+=2;let clone=this.instantiate(e.kind,data);this.select(clone)}
  else if(act==='move'){this.moveTarget=e;this.placement=null;this.ghost?.removeFromParent();this.ghost=null;}
  else if(act==='delete'){this.scene.remove(e.mesh);this.objects.splice(this.objects.indexOf(e),1);this.select(null);}
  this.onChanged();return true;
 }
 remember(){const snap=this.snapshot();this.undo.push(snap);if(this.undo.length>15)this.undo.shift();}
 async undoLast(){const s=this.undo.pop();if(!s)return;await this.restore(s);this.onChanged();}
 snapshot(){const pos=this.terrain.geometry.attributes.position,col=this.terrain.geometry.attributes.color;let heights=[];for(let i=0;i<pos.count;i++)heights.push(Math.round(pos.getZ(i)*1000)/1000);return {version:1,size:128,heights,colors:Array.from(col.array).map(x=>Math.round(x*1000)/1000),objects:this.objects.map(e=>({kind:e.kind,...JSON.parse(JSON.stringify(e.data))})),updated:new Date().toISOString()};}
 async restore(s){if(!s||!Array.isArray(s.objects)||!Array.isArray(s.heights))throw Error('Неверный формат проекта');this.objects.forEach(e=>e.mesh.removeFromParent());this.objects=[];this.select(null);this.nextId=1;
  const pos=this.terrain.geometry.attributes.position,col=this.terrain.geometry.attributes.color;
  for(let i=0;i<Math.min(pos.count,s.heights.length);i++)pos.setZ(i,s.heights[i]);if(s.colors&&s.colors.length===col.array.length)col.array.set(s.colors);
  pos.needsUpdate=true;col.needsUpdate=true;this.terrain.geometry.computeVertexNormals();this.terrain.geometry.computeBoundingBox();this.terrain.geometry.computeBoundingSphere();
  for(const e of s.objects){if(this.makeBuiltin(e.kind)||this.assetCache.has(e.kind)){try{this.instantiate(e.kind,{id:e.id,pos:e.pos,rot:e.rot,scale:e.scale||1,category:e.category,color:e.color,roughness:e.roughness,metalness:e.metalness,texture:e.texture,door:e.door,open:e.open})}catch(err){console.warn(err)}}}
  this.onChanged();}
 updateCamera(){if(this.mode==='walk'||this.mode==='playbuild'){const forward=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));this.target.copy(this.player.position).add(new THREE.Vector3(0,1.15,0));const range=THREE.MathUtils.clamp(this.distance,2.7,9);this.camera.position.copy(this.target).addScaledVector(forward,-Math.cos(this.pitch)*range).add(new THREE.Vector3(0,Math.sin(this.pitch)*range,0));}
  else{this.camera.position.set(this.target.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,this.target.y+Math.sin(this.pitch)*this.distance,this.target.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);}this.camera.lookAt(this.target);}
 updatePlayer(dt){if(this.mode!=='walk'&&this.mode!=='playbuild')return;let mx=this.joy.x*(this.invertJoystickX?-1:1)+(this.keys.KeyD||this.keys.ArrowRight?1:0)-(this.keys.KeyA||this.keys.ArrowLeft?1:0),my=-this.joy.y*(this.invertJoystickY?-1:1)+(this.keys.KeyW||this.keys.ArrowUp?1:0)-(this.keys.KeyS||this.keys.ArrowDown?1:0);const v=new THREE.Vector2(mx,my);if(v.length()>1)v.normalize();if(v.length()>.05){let f=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw)),r=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));let d=f.multiplyScalar(v.y).addScaledVector(r,v.x);let speed=this.playerSpeed*(this.running||this.keys.ShiftLeft?1.85:1);const next=this.player.position.clone().addScaledVector(d,dt*speed);
   next.x=THREE.MathUtils.clamp(next.x,-62,62);next.z=THREE.MathUtils.clamp(next.z,-62,62);
   if(!this.movementBlocked(this.player.position,next,this.player.position.y-.85)){
    this.player.position.x=next.x;this.player.position.z=next.z;
   }this.player.rotation.y=Math.atan2(-d.x,-d.z)+this.avatarFacingOffset;}
  this.player.position.y=THREE.MathUtils.lerp(this.player.position.y,this.supportHeight(this.player.position.x,this.player.position.z,this.player.position.y-.85)+.85,Math.min(1,dt*14));
  this.setAvatarMotion(v.length()>.05);
 }
 animate=(time)=>{requestAnimationFrame(this.animate);if(time-this.tLast<1000/this.fpsLimit)return;let dt=Math.min(.08,(time-this.tLast)/1000||.02);this.tLast=time;this.updatePlayer(dt);if(this.avatarMixer&&this.avatarAnimationsEnabled)this.avatarMixer.update(dt);this.syncAvatarGround(dt);this.updateCamera();this.updateGameGhost();if(this.selected&&this.highlight.visible)this.highlight.setFromObject(this.selected.mesh);this.renderer.render(this.scene,this.camera);this.frames++;this.fps=this.fps*.85+(1/Math.max(dt,.001))*.15;};
}
