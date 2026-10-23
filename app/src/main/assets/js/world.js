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
  this.objects=[];this.nextId=1;this.assetCache=new Map();this.assetAnimations=new Map();this.avatarMixer=null;this.avatarHeight=1.8;this.avatarModel=null;this.avatarOriginalHeight=0;this.avatarOriginalFitSize=0;this.avatarOriginalBounds=null;this.avatarSourceDimensions=null;this.avatarSource=null;this.avatarAnimationsEnabled=true;this.avatarGroundTimer=0;this.avatarGroundOffset=0;this.invertCameraX=false;this.avatarActions={};this.avatarClips=[];this.avatarMotionState='';this.avatarAnimationOverride=null;this.mode='build';this.invertJoystickX=false;this.invertJoystickY=false;this.avatarFacingOffset=Math.PI;this.placement=null;this.placementCategory=null;this.placementRotation=0;this.placementScale=1;this.placementAxes={x:1,y:1,z:1};this.wallThicknessMeters=null;this.placementModuleShape=null;this.smartSnap=true;this.joinMode='auto';this.autoThickness=true;this.cornerOffsetX=0;this.cornerOffsetZ=0;this.edgeShift=0;this.placementLift=0;this.centerOverhead=false;this.storeyHeight=2.6;this.lastSnapResult=null;this.categoryForKind=null;this.onSnapChanged=()=>{};this.selected=null;this.ghost=null;this.placementOutline=null;this.moveTarget=null;
  this.snap=2;this.floorLevel=0;this.stroke=false;this.brush='raise';this.brushSize=6;this.brushPower=.3;this.terrainPaint='#668358';this.currentPaint='#ffffff';this.textureId=null;this.placementSurfacePaint={};
  this.renderScale=.75;this.fpsLimit=30;this.tLast=0;this.frames=0;this.fps=0;this.undo=[];this.onChanged=()=>{};this.onSelected=()=>{};
  this.terrainSize=128;this.segments=64;this.terrain=new THREE.Mesh(new THREE.PlaneGeometry(128,128,64,64),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));this.terrain.rotation.x=-Math.PI/2;
  const ca=new Float32Array((65*65)*3);for(let i=0;i<ca.length;i+=3){ca[i]=.32;ca[i+1]=.48;ca[i+2]=.30;}
  this.terrain.geometry.setAttribute('color',new THREE.BufferAttribute(ca,3));this.terrain.material.needsUpdate=true;this.terrain.receiveShadow=false;this.scene.add(this.terrain);
  this.grid=new THREE.GridHelper(128,64,0x497c70,0x587569);this.grid.position.y=.025;this.grid.material.transparent=true;this.grid.material.opacity=.18;this.scene.add(this.grid);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(128,128),new THREE.MeshBasicMaterial({color:0x297f9d,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.y=-.4;this.scene.add(water);
  this.highlight=new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)),0x63ffce);this.scene.add(this.highlight);this.highlight.visible=false;
  this.player=new THREE.Group();this.player.position.set(0,1.4,0);this.scene.add(this.player);this.setupDefaultPlayer();this.player.visible=false;
  this.keys={};this.joy={x:0,y:0};this.running=false;this.playerSpeed=4;this.playerYaw=0;this.camOrbit=false;this.droneMode=false;this.droneReturnView=null;
  this.setQuality(.75,false);window.addEventListener('resize',()=>this.resize());this.resize();
 }
 setQuality(scale,shadows){
  const value=Number(scale);
  this.renderScale=Number.isFinite(value)?THREE.MathUtils.clamp(value,.6,1.25):.75;
  this.sun.castShadow=!!shadows;this.renderer.shadowMap.enabled=!!shadows;
  this.scene.traverse(o=>{if(o.isMesh){o.castShadow=!!shadows;o.receiveShadow=!!shadows}});
  this.resize();
 }
 // Mipmaps and anisotropic sampling keep paintings clear at oblique angles.
 // Preserve non-power-of-two art on WebGL1: mipmaps would force a downscale.
 tuneTexture(texture){
  if(!texture?.isTexture)return;
  const max=typeof this.renderer?.capabilities?.getMaxAnisotropy==='function'?
   this.renderer.capabilities.getMaxAnisotropy():1;
  const anisotropy=Math.max(1,Math.min(this.textureQuality||4,max||1));
  const image=texture.image;
  const pot=n=>Number.isInteger(n)&&n>0&&(n&(n-1))===0;
  const nonPOT=image?.width&&image?.height&&(!pot(image.width)||!pot(image.height));
  const clamped=texture.wrapS===THREE.ClampToEdgeWrapping&&texture.wrapT===THREE.ClampToEdgeWrapping;
  const preserveNative=nonPOT&&clamped&&!this.renderer?.capabilities?.isWebGL2;
  texture.anisotropy=anisotropy;texture.magFilter=THREE.LinearFilter;
  texture.minFilter=preserveNative?THREE.LinearFilter:THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=!preserveNative;texture.needsUpdate=true;
 }
 tuneModelTextures(root){
  root?.traverse?.(o=>{
   if(!o.isMesh)return;
   for(const m of(Array.isArray(o.material)?o.material:[o.material]))
    if(m?.map)this.tuneTexture(m.map);
  });
 }
 setTextureQuality(level){
  const n=Number(level);
  this.textureQuality=[1,4,8].includes(n)?n:4;
  for(const texture of this.textures?.values?.()||[])this.tuneTexture(texture);
  for(const root of this.assetCache?.values?.()||[])this.tuneModelTextures(root);
  this.tuneModelTextures(this.scene);
  this.tuneModelTextures(this.ghost);
  return this.textureQuality;
 }
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
  if((this.mode==='build'||this.mode==='style'||(this.mode==='playbuild'&&this.droneMode))&&this.floorLevel>0){
   // Plane is an editing aid, not a visible second floor or collision surface.
   const levelY=this.heightAt(this.target.x,this.target.z)+this.floorLevel*(this.storeyHeight||2.6);
   const supported=hits.find(h=>h.object!==this.terrain&&Math.abs(h.point.y-levelY)<1.2&&
     h.face?.normal?.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize().y>.55);
   if(supported)return supported.point;
   const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-levelY);
   const point=this.ray.ray.intersectPlane(plane,new THREE.Vector3());
   if(point)return point;
  }
  for(const hit of hits){
   if(hit.object===this.terrain)return hit.point;
   if(!hit.face)continue;
   const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
   if(normal.y>.55)return hit.point;
  }
  return this.ray.intersectObject(this.terrain,false)[0]?.point||null;
 }
 // Find the actual base of the chosen storey from nearby built geometry.
 // 1st-floor walls rest on the existing foundation; upper walls rest on the
 // selected storey's floor, or on the previous storey's wall/ceiling top.
 // No scene objects are moved and manual magnet-off placement is unchanged.
 floorDatumAt(x,z,category=this.placementCategory){
  const level=this.floorLevel||0,height=this.storeyHeight||2.6;
  const nominal=this.heightAt(x,z)+level*height;
  const result={height:nominal,source:'configured'};
  // In manual mode the user's configured storey height is authoritative.
  // In magnetic mode inspect physical supports in the built scene.
  if(this.smartSnap===false||!this.objects?.length||typeof BuildSnap==='undefined')return result;
  const cat=category||this.categoryForKind?.(this.placement)||'prop';
  const isSlab=cat==='foundation';
  let best=null;
  for(const entry of this.objects){
   const story=entry.data?.storey;
   if(!Number.isInteger(story))continue;
   const type=entry.data?.category||this.categoryForKind?.(entry.kind)||entry.kind;
   let priority;
   if(!isSlab&&story===level&&type==='foundation')priority=0;
   else if(level>0&&story===level-1&&type==='ceiling')priority=1;
   else if(level>0&&story===level-1&&['wall','corner','door','railing'].includes(type))priority=2;
   else continue;
   const mesh=entry.mesh;if(!mesh)continue;
   mesh.updateWorldMatrix(true,true);
   const bounds=BuildSnap.attrBounds(mesh);if(bounds.isEmpty())continue;
   const inverse=mesh.matrixWorld.clone().invert();
   const local=new THREE.Vector3(x,nominal,z).applyMatrix4(inverse);
   const near=new THREE.Vector3(
    THREE.MathUtils.clamp(local.x,bounds.min.x,bounds.max.x),
    bounds.max.y,
    THREE.MathUtils.clamp(local.z,bounds.min.z,bounds.max.z)
   ).applyMatrix4(mesh.matrixWorld);
   const distance=Math.hypot(near.x-x,near.z-z);
   if(distance>1.35)continue;
   const top=near.y;
   if(!Number.isFinite(top)||Math.abs(top-nominal)>Math.max(2.5,height*.8))continue;
   const score=priority*10+distance;
   if(!best||score<best.score)best={height:top,source:priority===0?'floor':priority===1?'ceiling':'wall',score};
  }
  return best?{height:best.height,source:best.source}:result;
 }
 placementHeight(x,z,kind=this.placement,category=this.placementCategory){
  const cat=category||this.categoryForKind?.(kind)||'prop';
  const raised=kind==='ceiling'||kind==='ceiling_finish'||kind==='roof'||cat==='ceiling'||cat==='ceiling_finish'||cat==='roof';
  const base=this.floorDatumAt(x,z,cat).height;
  return base+(raised?this.storeyHeight||2.6:0);
 }
 changeFloor(delta){return this.setFloorLevel(this.floorLevel+(Number(delta)||0)+1);}
 setFloorLevel(value){
  const raw=Number(value),level=raw-1;
  if(!Number.isSafeInteger(level)||level<0)return this.floorLevel+1;
  this.floorLevel=level;
  this.updateGameGhost();this.onChanged();return level+1;
 }
 focusBuildFloor(){
  // Focus the viewed building, not an old avatar location off-screen.
  // The camera follows the same measured support elevation as placements.
  const x=this.target.x,z=this.target.z;
  const datum=this.floorDatumAt(x,z,'wall');
  this.target.set(x,datum.height+1.25,z);
  this.distance=THREE.MathUtils.clamp(this.distance,5,26);
  this.updateCamera();
  return this.target.y;
 }
 setStoreyHeight(value){
  const n=Number(value);if(!Number.isFinite(n))return this.storeyHeight;
  this.storeyHeight=THREE.MathUtils.clamp(Math.round(n*100)/100,1.8,6);
  this.updateGameGhost();this.onChanged();return this.storeyHeight;
 }
 setPlacementLift(value){
  const n=Number(value);if(!Number.isFinite(n))return this.placementLift;
  this.placementLift=THREE.MathUtils.clamp(Math.round(n*100)/100,-5,5);
  this.updateGameGhost();return this.placementLift;
 }
 toggleOverheadCenter(){this.centerOverhead=!this.centerOverhead;this.updateGameGhost();return this.centerOverhead;}
 setJoinMode(mode){
  this.joinMode=['auto','corner','stack','free'].includes(mode)?mode:'auto';
  this.updateGameGhost();return this.joinMode;
 }
 toggleAutoThickness(){this.autoThickness=!this.autoThickness;this.updateGameGhost();this.onChanged();return this.autoThickness;}
 shiftCorner(dx,dz){
  this.cornerOffsetX=THREE.MathUtils.clamp(Math.round((this.cornerOffsetX+dx)*100)/100,-2,2);
  this.cornerOffsetZ=THREE.MathUtils.clamp(Math.round((this.cornerOffsetZ+dz)*100)/100,-2,2);
  this.updateGameGhost();return [this.cornerOffsetX,this.cornerOffsetZ];
 }
 static normalizedAxes(axes){
  return {x:THREE.MathUtils.clamp(Number(axes?.x)||1,.2,5),
   y:THREE.MathUtils.clamp(Number(axes?.y)||1,.2,5),
   z:THREE.MathUtils.clamp(Number(axes?.z)||1,.2,5)};
 }
 applyAxisScale(root,globalScale=1,axes=this.placementAxes,thicknessY=1){
  if(!root)return;
  const a=WorldBuilder.normalizedAxes(axes);
  root.scale.set(globalScale*a.x,globalScale*a.y*thicknessY,globalScale*a.z);
  root.updateMatrixWorld(true);
 }
 setPlacementScale(value){
  const n=Number(value);if(!Number.isFinite(n))return this.placementScale;
  this.placementScale=THREE.MathUtils.clamp(n,.1,10);
  if(this.ghost){
   this.applyAxisScale(this.ghost,this.placementScale);
   if(this.wallThicknessMeters&&typeof WallThickness!=='undefined')
    WallThickness.apply(this.ghost,this.placement,this.placementCategory,this.wallThicknessMeters);
  }
  this.updateGameGhost();return this.placementScale;
 }
 setDimensionFactor(axis,value,entry=null){
  if(!['x','y','z'].includes(axis))return null;
  const n=Number(value);if(!Number.isFinite(n))return null;
  const factor=THREE.MathUtils.clamp(Math.round(n*100)/100,.2,5);
  if(entry){
   this.remember();
   const previousBottom=new THREE.Box3().setFromObject(entry.mesh).min.y;
   entry.data.dimensionScale=WorldBuilder.normalizedAxes(entry.data.dimensionScale);
   entry.data.dimensionScale[axis]=factor;
   this.applyAxisScale(entry.mesh,entry.data.scale||1,entry.data.dimensionScale,entry.data.thicknessY||1);
   if(entry.data.wallThicknessMeters&&typeof WallThickness!=='undefined')
    WallThickness.apply(entry.mesh,entry.kind,entry.data.category,entry.data.wallThicknessMeters);
   const newBottom=new THREE.Box3().setFromObject(entry.mesh).min.y;
   if(Number.isFinite(previousBottom)&&Number.isFinite(newBottom)){
    entry.mesh.position.y+=previousBottom-newBottom;
    entry.data.pos=entry.mesh.position.toArray();
   }
   this.onChanged();this.onSelected?.(entry);
  }else{
   this.placementAxes=WorldBuilder.normalizedAxes(this.placementAxes);
   this.placementAxes[axis]=factor;
   if(this.ghost){
    this.applyAxisScale(this.ghost,this.placementScale,this.placementAxes);
    if(this.wallThicknessMeters&&typeof WallThickness!=='undefined')
     WallThickness.apply(this.ghost,this.placement,this.placementCategory,this.wallThicknessMeters);
   }
   this.updateGameGhost();
  }
  return factor;
 }
 // This changes only the cross-section of a recognizable wall, not the
 // length or radius of its path. Reject unknown GLB structures safely.
 setWallThickness(meters,entry=null){
  if(typeof WallThickness==='undefined')return false;
  const value=Number(meters);
  if(!Number.isFinite(value)||value<.025||value>.8)return false;
  const root=entry?.mesh||this.ghost;
  const kind=entry?.kind||this.placement;
  const cat=entry?.data?.category||this.placementCategory;
  if(!root||!WallThickness.info(root,kind,cat))return false;
  if(entry)this.remember();
  if(!WallThickness.apply(root,kind,cat,value))return false;
  if(entry){
   entry.data.wallThicknessMeters=value;
   this.onChanged();this.onSelected?.(entry);
  }else{
   this.wallThicknessMeters=value;
   this.updateGameGhost();
  }
  return true;
 }
  solvePlacement(p){
  const moving=this.moveTarget;
  // A moved building module uses its real category, geometry and dimensions,
  // never "prop" or the settings of the previously selected new module.
  const old={placement:this.placement,category:this.placementCategory,
   axes:this.placementAxes,scale:this.placementScale};
  if(moving){
   this.placement=moving.kind;this.placementCategory=moving.data.category||
    this.categoryForKind?.(moving.kind)||'prop';
   this.placementAxes=WorldBuilder.normalizedAxes(moving.data.dimensionScale);
   this.placementScale=moving.data.scale||1;
  }
  try{
   const fine=solved=>{
    const cat=this.placementCategory||this.categoryForKind?.(this.placement)||this.placement;
    if(solved&&['wall','corner','door','railing','stairs'].includes(cat)){
     solved.position.x+=this.cornerOffsetX||0;
     solved.position.z+=this.cornerOffsetZ||0;
    }
    return solved;
   };
   if(this.joinMode==='free'){
    const x=Math.round(p.x/this.snap)*this.snap,z=Math.round(p.z/this.snap)*this.snap;
    // Free placement also needs the true bottom pivot for imported GLBs.
    const b=this.ghost&&typeof BuildSnap!=='undefined'?
     BuildSnap.dimensionBounds(BuildSnap.attrBounds(this.ghost),this):null;
    const bottom=b&&!b.isEmpty()?b.min.y*(this.placementScale||1):0;
    return fine({position:new THREE.Vector3(x,
     this.placementHeight(x,z)-bottom+(this.placementLift||0),z),
     rotation:this.placementRotation||0,snapped:false,
     category:this.placementCategory,manual:true});
   }
   if(typeof BuildJoin!=='undefined'&&this.placement&&this.smartSnap!==false){
    const joined=BuildJoin.resolve(this,p);
    if(joined)return fine(joined);
   }
   if(typeof BuildSnap!=='undefined'&&this.placement)return fine(BuildSnap.resolve(this,p));
   const x=Math.round(p.x/this.snap)*this.snap,z=Math.round(p.z/this.snap)*this.snap;
   return fine({position:new THREE.Vector3(x,
    this.placementHeight(x,z)+(this.placementLift||0),z),
    rotation:this.placementRotation||0,snapped:false,category:this.placementCategory});
  }finally{
   if(moving){
    this.placement=old.placement;this.placementCategory=old.category;
    this.placementAxes=old.axes;this.placementScale=old.scale;
   }
  }
 }
 placeAt(p){
  if(!this.placement&&!this.moveTarget)return;
  const solved=this.ghost?this.applyGhostPlacement(p):this.solvePlacement(p);
  if(!solved||solved.valid===false)return null;
  const v=solved.position;
  this.remember();
  if(this.moveTarget){
   const moved=this.moveTarget;
   moved.mesh.position.copy(v);moved.data.pos=v.toArray();
   moved.mesh.rotation.y=solved.rotation*Math.PI/180;
   moved.data.rot=solved.rotation;
   moved.data.storey=this.floorLevel;
   this.moveTarget=null;
   if(this.ghost){this.ghost.removeFromParent();this.ghost=null;}
   if(this.placementOutline){
    this.placementOutline.removeFromParent();
    this.placementOutline.geometry?.dispose();this.placementOutline.material?.dispose();
    this.placementOutline=null;
   }
   this.select(moved);this.onChanged();return moved;
  }
  const color=typeof this.placement==='string'&&this.placement.startsWith('glb:')?null:this.placementCategory==='ceiling_finish'?'#ffffff':this.currentPaint;
  const rec=this.instantiate(this.placement,{id:this.nextId++,pos:v.toArray(),rot:solved.rotation,scale:this.placementScale,thicknessY:solved.thicknessY||1,
   dimensionScale:{...this.placementAxes},wallThicknessMeters:this.wallThicknessMeters||undefined,moduleShape:this.placementModuleShape||undefined,moduleUse:this.placementModuleUse||undefined,surfacePaint:JSON.parse(JSON.stringify(this.placementSurfacePaint||{})),decals:JSON.parse(JSON.stringify(this.placementDecals||[])),category:this.placementCategory||this.categoryForKind?.(this.placement)||null,storey:this.floorLevel,color,roughness:.85,metalness:0,texture:this.textureId||null,door:false,open:false});
  this.select(rec);this.onChanged();return rec;
 }
 instantiate(kind,data){let obj=this.makeBuiltin(kind); if(!obj){const cache=this.assetCache.get(kind);if(!cache)throw Error('Сначала импортируй '+kind);obj=cache.clone(true)}
  if(data.moduleShape&&typeof ModuleForge!=='undefined'){
   const result=ModuleForge.build(obj,data.moduleShape,
    ModuleForge.uses.includes(data.moduleUse)?data.moduleUse:
     data.category==='roof'?'roof':['foundation','ceiling','ceiling_finish'].includes(data.category)?'foundation':'wall');
   if(!result.ok)throw Error('Модуль из GLB: '+result.reason);
  }
  let entry={kind,data:JSON.parse(JSON.stringify(data)),mesh:obj};obj.userData.objectId=data.id;obj.userData.pwbCategory=data.category||this.categoryForKind?.(kind)||kind;
  if(!('scale' in data))entry.data.scale=1;
  obj.position.fromArray(data.pos);obj.rotation.y=(data.rot||0)*Math.PI/180;this.applyAxisScale(obj,data.scale||1,data.dimensionScale,Number(data.thicknessY)||1);
  if(data.wallThicknessMeters&&typeof WallThickness!=='undefined')
   WallThickness.apply(obj,kind,data.category||this.categoryForKind?.(kind),data.wallThicknessMeters);
  this.scene.add(obj);obj.updateMatrixWorld(true);this.objects.push(entry);this.applyAppearance(entry);this.nextId=Math.max(this.nextId,entry.data.id+1);return entry;
 }
 makeBuiltin(kind){
  if(typeof RoundedModules!=='undefined'&&RoundedModules.kinds.has(kind))
   return RoundedModules.create(kind);
  const group=new THREE.Group();let m=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,side:THREE.DoubleSide}); const add=(geo,x,y,z,mat=m)=>{let mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh};
  if(kind==='floor'||kind==='ceiling')add(new THREE.BoxGeometry(2,.17,2),0,.08,0);
   else if(kind==='ceiling_finish')add(new THREE.BoxGeometry(2,.024,2),0,-.012,0);
  else if(kind==='wall')add(new THREE.BoxGeometry(2,2.6,.22),0,1.3,0);
  else if(kind==='corner'){
   add(new THREE.BoxGeometry(2,2.6,.22),-.9,1.3,0);
   add(new THREE.BoxGeometry(.22,2.6,2),0,1.3,-.9);
   group.userData.joinAnchor=[0,0,0];
  }
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
 applyAppearance(entry){
  if(!this._pwbBaseMaterials)this._pwbBaseMaterials=new WeakMap();
  const c=entry.data.color?new THREE.Color(entry.data.color):null;
  entry.mesh.traverse(o=>{
   if(!o.isMesh)return;
   if(!this._pwbBaseMaterials.has(o))this._pwbBaseMaterials.set(o,o.material);
   const old=this._pwbBaseMaterials.get(o),previous=o.material;
   o.material=Array.isArray(old)?old.map(m=>m.clone()):old.clone();
   // Repeated image slider edits must release the previous GPU materials.
   if(previous!==old)for(const material of(Array.isArray(previous)?previous:[previous]))
    material?.dispose?.();
   const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{
   // Glass and metal accents in built-ins keep their characteristic surfaces.
   if(m.transparent&&entry.kind==='window')return;
   if(m.color&&c)m.color.copy(c);
   if(m.roughness!==undefined)m.roughness=entry.data.roughness??.8;
   if(m.metalness!==undefined)m.metalness=entry.data.metalness??0;
   if(entry.data.texture&&this.textures?.get(entry.data.texture)){m.map=this.textures.get(entry.data.texture);m.needsUpdate=true;}
  });});this.setDoor(entry,entry.data.open||false);
  entry.mesh.userData.pwbCategory=entry.data.category||this.categoryForKind?.(entry.kind)||entry.kind;
  if(typeof SurfacePaint!=='undefined'){
   const hasPaint=Object.keys(SurfacePaint.normalize(entry.data.surfacePaint)).length>0;
   if(hasPaint||entry.mesh.userData.pwbSurfaceCoated){
    SurfacePaint.applyToRoot(entry.mesh,entry.data.surfacePaint,this.textures);
    entry.mesh.userData.pwbSurfaceCoated=true;
   }
  }
  if(typeof DecalLayer!=='undefined'&&entry.data.decals?.length)
   DecalLayer.applyToRoot(entry.mesh,entry.data.decals,this.textures);
 }
 updateDecals(entry,decals){
  if(!entry||typeof DecalLayer==='undefined')return [];
  this.remember();
  entry.data.decals=DecalLayer.normalize(decals);
  this.applyAppearance(entry);this.onChanged();return entry.data.decals;
 }
 applyJoinedFloorFinish(entry,texture,settings={}){
  if(typeof SurfacePaint==='undefined')return 0;
  const group=SurfacePaint.joinedFloors(this,entry);
  if(!group.length)return 0;
  this.remember();
  for(const {entry:item,region} of group){
   let skin=SurfacePaint.normalize(item.data.surfacePaint);
   skin=SurfacePaint.update(skin,'top','texture',texture);
   skin=SurfacePaint.update(skin,'top','mode','joined');
   skin=SurfacePaint.update(skin,'top','region',region);
   skin=SurfacePaint.update(skin,'top','faithful',settings.faithful===true);
   item.data.surfacePaint=skin;
   this.applyAppearance(item);
  }
  this.onChanged();return group.length;
 }
 updateSurfacePaint(entry,face,kind,value){
  if(!entry||typeof SurfacePaint==='undefined')return null;
  this.remember();
  entry.data.surfacePaint=SurfacePaint.update(entry.data.surfacePaint,face,kind,value);
  this.applyAppearance(entry);this.onChanged();return entry.data.surfacePaint;
 }
 updatePreviewSurfacePaint(face,kind,value){
  if(typeof SurfacePaint==='undefined')return null;
  this.placementSurfacePaint=SurfacePaint.update(this.placementSurfacePaint,face,kind,value);
  if(this.ghost){
   this.ghost.userData.pwbCategory=this.placementCategory||this.categoryForKind?.(this.placement)||this.placement;
   this.ghost.userData.pwbPreview=true;
   SurfacePaint.applyToRoot(this.ghost,this.placementSurfacePaint,this.textures);
   this.colorPlacementPreview(this.lastSnapResult?.valid!==false);
  }
  return this.placementSurfacePaint;
 }
 clearSurfacePaint(entry,face){
  if(!entry||typeof SurfacePaint==='undefined')return;
  this.remember();const data=SurfacePaint.normalize(entry.data.surfacePaint);delete data[face];
  entry.data.surfacePaint=data;this.applyAppearance(entry);this.onChanged();
 }
 setDoor(entry,open){entry.data.open=!!open;const h=entry.mesh.userData.hinge; if(h)h.rotation.y=open?-1.65:0;}
 toggleDoor(entry){if(!entry)return;this.remember();entry.data.door=true;entry.data.open=!entry.data.open;this.setDoor(entry,entry.data.open);if(!entry.mesh.userData.hinge){entry.mesh.rotation.y=((entry.data.rot||0)+(entry.data.open?80:0))*Math.PI/180;}this.onChanged();}
 select(entry){this.selected=entry||null;if(entry){this.highlight.setFromObject(entry.mesh);this.highlight.visible=true}else this.highlight.visible=false;this.onSelected(entry);}
 setDroneMode(enabled){
  // Independent camera in construction: character position is untouched.
  if(enabled&&this.mode!=='playbuild'&&this.mode!=='build')return false;
  const turnOn=!!enabled;
  if(turnOn===!!this.droneMode)return !!this.droneMode;
  if(turnOn){
   this.droneReturnView={yaw:this.yaw,pitch:this.pitch,distance:this.distance};
   const x=this.mode==='build'?this.target.x:this.player.position.x;
   const z=this.mode==='build'?this.target.z:this.player.position.z;
   this.target.set(x,this.placementHeight(x,z,'wall','wall')+.6,z);
   this.pitch=1.13;this.distance=20;this.droneMode=true;
  }else{
   this.droneMode=false;
   if(this.droneReturnView){
    this.yaw=this.droneReturnView.yaw;this.pitch=this.droneReturnView.pitch;
    this.distance=this.droneReturnView.distance;
   }
   this.droneReturnView=null;
  }
  this.joy={x:0,y:0};
  this.player.visible=this.mode==='playbuild'?!turnOn:false;
  this.updateCamera();this.updateGameGhost();
  return this.droneMode;
 }
 setDroneView(view){
  if(!this.droneMode)return false;
  if(view==='top')this.pitch=1.535;
  else if(view==='angled')this.pitch=.86;
  else return false;
  this.updateCamera();this.updateGameGhost();
  return true;
 }
 centerDrone(){
  if(!this.droneMode)return false;
  const p=this.selected?.mesh?.position||this.player?.position;if(!p)return false;
  const x=THREE.MathUtils.clamp(p.x,-62,62),z=THREE.MathUtils.clamp(p.z,-62,62);
  this.target.set(x,this.placementHeight(x,z,'wall','wall')+.6,z);
  this.updateCamera();this.updateGameGhost();
  return true;
 }
 panDrone(dx,dy){
  if(!this.droneMode)return false;
  const scale=THREE.MathUtils.clamp(this.distance*.0028,.018,.34);
  const rightX=Math.cos(this.yaw),rightZ=-Math.sin(this.yaw);
  const upX=-Math.sin(this.yaw),upZ=-Math.cos(this.yaw);
  this.target.x=THREE.MathUtils.clamp(this.target.x+(-dx*rightX+dy*upX)*scale,-62,62);
  this.target.z=THREE.MathUtils.clamp(this.target.z+(-dx*rightZ+dy*upZ)*scale,-62,62);
  this.updateGameGhost();
  return true;
 }
 setMode(mode){
  const wasGame=this.mode==='walk'||this.mode==='playbuild',isGame=mode==='walk'||mode==='playbuild';
  if(mode!==this.mode&&this.droneMode)this.setDroneMode(false);
  this.mode=mode;this.player.visible=isGame&&!this.droneMode;this.grid.visible=!isGame;this.highlight.visible=!isGame&&!!this.selected;
  if(isGame&&!wasGame){this.player.position.set(this.target.x,this.heightAt(this.target.x,this.target.z)+.85,this.target.z);this.distance=5.2;this.pitch=.34;}
  else if(!isGame&&wasGame){this.target.copy(this.player.position);this.target.y+=1;this.distance=17;this.pitch=.58;}
  if(mode==='playbuild'&&this.placement&&!this.ghost)this.setPlacement(this.placement,this.placementCategory);
  if(mode==='walk'&&this.ghost){this.ghost.removeFromParent();this.ghost=null;this.placementOutline?.removeFromParent();}
  this.onChanged();
 }
 forwardPlacementPoint(){
  if(this.mode==='playbuild'&&this.droneMode){
   const x=THREE.MathUtils.clamp(this.target.x,-62,62),z=THREE.MathUtils.clamp(this.target.z,-62,62);
   return new THREE.Vector3(x,this.placementHeight(x,z),z);
  }
  const d=4.0,fx=-Math.sin(this.yaw),fz=-Math.cos(this.yaw);
  const x=THREE.MathUtils.clamp(this.player.position.x+fx*d,-62,62);
  const z=THREE.MathUtils.clamp(this.player.position.z+fz*d,-62,62);
  return new THREE.Vector3(x,this.placementHeight(x,z),z);
 }
 applyGhostPlacement(p){
  if(!this.ghost)return null;
  const solved=this.solvePlacement(p);
  this.ghost.position.copy(solved.position);
  this.ghost.userData.pwbCategory=solved.category||this.placementCategory||this.moveTarget?.data?.category;
  this.ghost.rotation.y=solved.rotation*Math.PI/180;
  this.applyAxisScale(this.ghost,this.moveTarget?.data?.scale||this.placementScale,
   this.moveTarget?.data?.dimensionScale||this.placementAxes,
   solved.thicknessY||this.moveTarget?.data?.thicknessY||1);
  const thickness=this.moveTarget?.data?.wallThicknessMeters||this.wallThicknessMeters;
  if(thickness&&typeof WallThickness!=='undefined')
   WallThickness.apply(this.ghost,this.moveTarget?.kind||this.placement,
    this.moveTarget?.data?.category||this.placementCategory,thickness);
  const checked=typeof BuildPlacementValidator!=='undefined'?
   BuildPlacementValidator.validate(this,solved,this.ghost):
   {...solved,valid:solved.valid!==false,reason:solved.missingTarget||(solved.snapped?'Привязано':'По сетке')};
  if(!checked.snapped){
   checked.manual=true;
   if(checked.valid!==false&&!checked.conflict&&
    typeof BuildPlacementValidator!=='undefined'&&
    typeof BuildPlacementValidator.manualAlignment==='function'){
    const actual=BuildPlacementValidator.manualAlignment(this,this.ghost,checked.category||
     this.moveTarget?.data?.category||this.placementCategory);
    if(actual)Object.assign(checked,actual);
   }
  }
  const colour=checked.valid===false||checked.conflict?'blocked':
   checked.manualAligned||checked.snapped&&!this.cornerOffsetX&&!this.cornerOffsetZ&&!this.placementLift?'snapped':'manual';
  this.colorPlacementPreview(colour);
  if(this.placementOutline){
   this.placementOutline.update();
   this.placementOutline.material.color.setHex(colour==='blocked'?0xff635c:
    colour==='snapped'?0x50f4a0:0xffc36a);
  }
  const previous=this.lastSnapResult;
  this.lastSnapResult=checked;
  if(previous?.valid!==checked.valid||previous?.reason!==checked.reason||
     previous?.reference!==checked.reference||previous?.joinedTo!==checked.joinedTo||
     previous?.snapped!==checked.snapped||previous?.overhead!==checked.overhead||
     previous?.thicknessY!==checked.thicknessY||
     previous?.manualAligned!==checked.manualAligned||
     previous?.conflict!==checked.conflict)this.onSnapChanged?.(checked);
  return checked;
 }
 colorPlacementPreview(state){
  if(!this.ghost)return;
  const colour=typeof state==='boolean'?(state?'snapped':'blocked'):state;
  const rgb=new THREE.Color(colour==='snapped'?'#66ffaa':
   colour==='blocked'?'#ff505c':'#ffc067');
  const strength=colour==='blocked'?.56:.35;
  this.ghost.traverse(obj=>{
   if(!obj.isMesh)return;
   for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material])){
    if(!mat)return;
    if(mat.color){
     if(!mat.userData.pwbPreviewOriginalColor)mat.userData.pwbPreviewOriginalColor=mat.color.clone();
     mat.color.copy(mat.userData.pwbPreviewOriginalColor).lerp(rgb,strength);
    }
    if(mat.emissive){
     if(!mat.userData.pwbPreviewOriginalEmissive)mat.userData.pwbPreviewOriginalEmissive=mat.emissive.clone();
     mat.emissive.copy(mat.userData.pwbPreviewOriginalEmissive).lerp(rgb,strength);
    }
    mat.opacity=.47;mat.transparent=true;mat.depthWrite=false;
   }
  });
 }
 updateGameGhost(){
  if(!this.ghost)return;
  if(this.mode==='playbuild')this.applyGhostPlacement(this.forwardPlacementPoint());
  else if(this.ghost.position&&this.lastSnapResult)this.applyGhostPlacement(this.ghost.position.clone());
 }
 toggleSmartSnap(){this.smartSnap=!this.smartSnap;this.updateGameGhost();return this.smartSnap;}
 shiftAlongEdge(delta){this.edgeShift=THREE.MathUtils.clamp(Math.round((this.edgeShift+delta)*100)/100,-20,20);this.updateGameGhost();return this.edgeShift;}
 rotatePlacement(){this.placementRotation=(this.placementRotation+90)%360;this.updateGameGhost();return this.placementRotation;}
 // Lightweight surface and obstacle collision for previewing assembled buildings.
 supportHeight(x,z,footY){
  let best=this.heightAt(x,z);const origin=new THREE.Vector3(x,footY+.58,z);
  const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,5);
  const targets=this.objects.filter(e=>{
    const cat=e.data.category||this.categoryForKind?.(e.kind)||e.kind;
    return !['tree','crate','ceiling_finish','prop','roof'].includes(cat)&&!(e.data.door&&e.data.open);
   }).map(e=>e.mesh);
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
  // The previous single eye-height ray let the character clip walls with
  // its shoulders, cross low obstacles and walk through slim corner seams.
  // Use capsule-like forward samples at two heights and three lateral
  // positions without requiring a heavyweight physics engine on Android.
  const dir=d.clone().normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);
  const radius=.23;
  const targets=this.objects.filter(e=>{
   const cat=e.data?.category||this.categoryForKind?.(e.kind)||e.kind;
   return !['floor','foundation','ceiling','stairs','roof','tree','foliage','ceiling_finish'].includes(cat)
    &&!(e.data.door&&e.data.open);
  }).map(e=>e.mesh);
  for(const h of [.42,1.06,1.58])for(const lateral of [-radius,0,radius]){
   const origin=new THREE.Vector3(a.x,footY+h,a.z).addScaledVector(side,lateral);
   const ray=new THREE.Raycaster(origin,dir,.015,length+radius);
   if(ray.intersectObjects(targets,true).some(hit=>hit.distance<=length+radius))return true;
  }
  return false;
 }

 // Build a standardized one-piece form from a selected/imported GLB.
 // Geometry is rebuilt per instance; source GLB in the asset cache is safe.
 setModuleShape(shape,use=null){
  if(!this.placement||!this.placement.startsWith('glb:')||
     typeof ModuleForge==='undefined')return {ok:false,reason:'Сначала выбери свой GLB'};
  const type=ModuleForge.uses.includes(use)?use:
   this.placementCategory==='roof'?'roof':
   ['foundation','ceiling','ceiling_finish'].includes(this.placementCategory)?'foundation':'wall';
  const root=this.assetCache.get(this.placement);
  if(!root)return {ok:false,reason:'Исходный GLB не загружен'};
  const built=root.clone(true),result=ModuleForge.build(built,shape,type);
  if(!result.ok)return result;
  this.placementModuleShape=shape;this.placementModuleUse=type;
  this.placementCategory=type==='foundation'?'foundation':
   type==='roof'?'roof':shape==='corner'?'corner':'wall';
  if(this.ghost)this.ghost.removeFromParent();
  this.ghost=built;
  this.applyAxisScale(built,this.placementScale,this.placementAxes);
  built.userData.pwbCategory=this.placementCategory;
  built.userData.pwbPreview=true;
  built.traverse(m=>{if(!m.isMesh)return;
   m.material=Array.isArray(m.material)?m.material.map(a=>a.clone()):m.material.clone();
   for(const mat of(Array.isArray(m.material)?m.material:[m.material])){
    mat.transparent=true;mat.opacity=.47;mat.depthWrite=false;
   }
  });
  if(typeof SurfacePaint!=='undefined'&&Object.keys(this.placementSurfacePaint||{}).length)
   SurfacePaint.applyToRoot(built,this.placementSurfacePaint,this.textures);
  this.scene.add(built);
  if(this.placementOutline){
   this.placementOutline.removeFromParent();
   this.placementOutline.geometry?.dispose();this.placementOutline.material?.dispose();
   this.placementOutline=null;
  }
  this.placementOutline=new THREE.BoxHelper(built,0x50f4a0);
  this.placementOutline.material.depthTest=false;this.scene.add(this.placementOutline);
  this.updateGameGhost();this.onChanged();
  return result;
 }
  setPlacement(kind,category=null){
  if(kind!==this.placement){
   this.placementSurfacePaint={};this.placementDecals=[];
   this.placementAxes={x:1,y:1,z:1};this.wallThicknessMeters=null;
  }
  this.placementModuleShape=null;this.placementModuleUse=null;
  this.placement=kind;this.placementCategory=category;this.moveTarget=null;this.edgeShift=0;this.cornerOffsetX=0;this.cornerOffsetZ=0;this.lastSnapResult=null;
  if(this.ghost)this.ghost.removeFromParent();
  if(this.placementOutline){this.placementOutline.removeFromParent();this.placementOutline.geometry.dispose();this.placementOutline.material.dispose();this.placementOutline=null;}
  this.ghost=kind?(this.makeBuiltin(kind)||this.assetCache.get(kind)?.clone(true)||null):null;
  if(this.ghost){
   this.ghost.traverse(m=>{if(m.isMesh){
    m.material=Array.isArray(m.material)?m.material.map(mat=>mat.clone()):m.material.clone();
    for(const mat of(Array.isArray(m.material)?m.material:[m.material])){mat.transparent=true;mat.opacity=.47;mat.depthWrite=false;}
   }});
   this.ghost.userData.pwbCategory=category||this.categoryForKind?.(kind)||kind;
   this.ghost.userData.pwbPreview=true;
   if(typeof SurfacePaint!=='undefined'&&Object.keys(this.placementSurfacePaint||{}).length)
    SurfacePaint.applyToRoot(this.ghost,this.placementSurfacePaint,this.textures);
   if(typeof DecalLayer!=='undefined'&&this.placementDecals?.length)DecalLayer.applyToRoot(this.ghost,this.placementDecals,this.textures);
   this.applyAxisScale(this.ghost,this.placementScale,this.placementAxes);
   if(this.wallThicknessMeters&&typeof WallThickness!=='undefined')
    WallThickness.apply(this.ghost,kind,category||this.categoryForKind?.(kind),this.wallThicknessMeters);
   this.scene.add(this.ghost);
   if(typeof THREE.BoxHelper==='function'){
    this.placementOutline=new THREE.BoxHelper(this.ghost,0x50f4a0);
    this.placementOutline.material.transparent=true;this.placementOutline.material.opacity=.92;
    this.placementOutline.material.depthTest=false;
    this.scene.add(this.placementOutline);
   }
   this.updateGameGhost();
  }
 }
 updateGhost(p){this.applyGhostPlacement(p)}
 action(act){const e=this.selected;if(!e)return false;this.remember();if(act==='rotate'){e.data.rot=(e.data.rot+90)%360;e.mesh.rotation.y=e.data.rot*Math.PI/180}
  else if(act==='copy'){const data=JSON.parse(JSON.stringify(e.data));data.id=this.nextId++;data.pos[0]+=2;let clone=this.instantiate(e.kind,data);this.select(clone)}
  else if(act==='move'){
   this.moveTarget=e;this.placement=null;
   this.ghost?.removeFromParent();this.ghost=e.mesh.clone(true);
   this.ghost.traverse(m=>{if(m.isMesh){
    m.material=Array.isArray(m.material)?m.material.map(mat=>mat.clone()):m.material.clone();
   }});
   this.scene.add(this.ghost);
   if(this.placementOutline){this.placementOutline.removeFromParent();this.placementOutline.geometry.dispose();this.placementOutline.material.dispose();}
   this.placementOutline=new THREE.BoxHelper(this.ghost,0xffc36a);
   this.placementOutline.material.depthTest=false;this.scene.add(this.placementOutline);
   this.applyGhostPlacement(e.mesh.position.clone());
  }
  else if(act==='delete'){this.scene.remove(e.mesh);this.objects.splice(this.objects.indexOf(e),1);this.select(null);}
  this.onChanged();return true;
 }
 remember(){const snap=this.snapshot();this.undo.push(snap);if(this.undo.length>15)this.undo.shift();}
 async undoLast(){
  const s=this.undo.pop();if(!s)return false;
  await this.restore(s);
  // Restoring replaces all world object instances. The old placement result
  // may reference a deleted wall or floor, so solve against the new scene now.
  this.moveTarget=null;
  this.lastSnapResult=null;
  if(this.ghost&&this.placement){
   const target=this.mode==='playbuild'?this.forwardPlacementPoint():this.ghost.position.clone();
   this.applyGhostPlacement(target);
  }
  this.onChanged();
  return true;
 }
 snapshot(){const pos=this.terrain.geometry.attributes.position,col=this.terrain.geometry.attributes.color;let heights=[];for(let i=0;i<pos.count;i++)heights.push(Math.round(pos.getZ(i)*1000)/1000);return {version:1,size:128,heights,colors:Array.from(col.array).map(x=>Math.round(x*1000)/1000),construction:{storeyHeight:this.storeyHeight||2.6,floorLevel:this.floorLevel||0,smartSnap:this.smartSnap!==false,autoThickness:this.autoThickness!==false},objects:this.objects.map(e=>({kind:e.kind,...JSON.parse(JSON.stringify(e.data))})),updated:new Date().toISOString()};}
 async restore(s){
  if(!s||!Array.isArray(s.objects)||!Array.isArray(s.heights))
   throw Error('Неверный формат проекта');
  // Assemble into a staging scene. A missing/corrupted GLB must NOT result in
  // an apparently successful load followed by a save of a truncated building.
  const previous=this.objects,previousNextId=this.nextId,previousSelection=this.selected;
  this.objects=[];this.nextId=1;
  try{
   for(const e of s.objects){
    if(!e||!e.kind||!Array.isArray(e.pos)||e.pos.length!==3||
       !e.pos.every(Number.isFinite))
     throw Error('Некорректный объект в сохранении: '+String(e?.kind||'?'));
    this.instantiate(e.kind,{id:e.id,pos:e.pos,rot:e.rot,scale:e.scale||1,
     thicknessY:e.thicknessY||1,dimensionScale:e.dimensionScale,
     wallThicknessMeters:e.wallThicknessMeters,moduleShape:e.moduleShape,moduleUse:e.moduleUse,
     category:e.category,storey:e.storey,surfacePaint:e.surfacePaint||{},
     decals:e.decals||[],color:e.color,roughness:e.roughness,metalness:e.metalness,
     texture:e.texture,door:e.door,open:e.open});
   }
  }catch(error){
   for(const item of this.objects)item.mesh.removeFromParent();
   this.objects=previous;this.nextId=previousNextId;
   this.select(previousSelection);
   throw Error('Проект не заменён: '+error.message);
  }
  const staged=this.objects;
  for(const item of previous)item.mesh.removeFromParent();
  this.objects=staged;this.select(null);
  const cfg=s.construction||{};
  this.storeyHeight=THREE.MathUtils.clamp(Number(cfg.storeyHeight)||2.6,1.8,6);
  this.floorLevel=Number.isSafeInteger(Number(cfg.floorLevel))&&Number(cfg.floorLevel)>=0?Number(cfg.floorLevel):0;
  this.smartSnap=cfg.smartSnap!==false;this.autoThickness=cfg.autoThickness!==false;this.joinMode='auto';
  const pos=this.terrain.geometry.attributes.position,col=this.terrain.geometry.attributes.color;
  for(let i=0;i<Math.min(pos.count,s.heights.length);i++)pos.setZ(i,s.heights[i]);
  if(s.colors&&s.colors.length===col.array.length)col.array.set(s.colors);
  pos.needsUpdate=true;col.needsUpdate=true;
  this.terrain.geometry.computeVertexNormals();
  this.terrain.geometry.computeBoundingBox();this.terrain.geometry.computeBoundingSphere();
  this.onChanged();
 }
 updateCamera(){if(this.mode==='walk'||(this.mode==='playbuild'&&!this.droneMode)){const forward=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));this.target.copy(this.player.position).add(new THREE.Vector3(0,1.15,0));const range=THREE.MathUtils.clamp(this.distance,2.7,9);this.camera.position.copy(this.target).addScaledVector(forward,-Math.cos(this.pitch)*range).add(new THREE.Vector3(0,Math.sin(this.pitch)*range,0));}
  else{this.camera.position.set(this.target.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,this.target.y+Math.sin(this.pitch)*this.distance,this.target.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);}this.camera.lookAt(this.target);}
 updatePlayer(dt){
  if(this.droneMode&&(this.mode==='playbuild'||this.mode==='build')){
   const strafe=this.joy.x*(this.invertJoystickX?-1:1)+(this.keys.KeyD||this.keys.ArrowRight?1:0)-(this.keys.KeyA||this.keys.ArrowLeft?1:0);
   const forward=-this.joy.y*(this.invertJoystickY?-1:1)+(this.keys.KeyW||this.keys.ArrowUp?1:0)-(this.keys.KeyS||this.keys.ArrowDown?1:0);
   const length=Math.hypot(strafe,forward);
   if(length>.05){
    const dx=(Math.cos(this.yaw)*strafe-Math.sin(this.yaw)*forward)/Math.max(1,length);
    const dz=(-Math.sin(this.yaw)*strafe-Math.cos(this.yaw)*forward)/Math.max(1,length);
    const speed=THREE.MathUtils.clamp(this.distance*.38,2,22)*(this.keys.ShiftLeft?1.8:1);
    this.target.x=THREE.MathUtils.clamp(this.target.x+dx*dt*speed,-62,62);
    this.target.z=THREE.MathUtils.clamp(this.target.z+dz*dt*speed,-62,62);
   }
   return;
  }
  if(this.mode!=='walk'&&this.mode!=='playbuild')return;let mx=this.joy.x*(this.invertJoystickX?-1:1)+(this.keys.KeyD||this.keys.ArrowRight?1:0)-(this.keys.KeyA||this.keys.ArrowLeft?1:0),my=-this.joy.y*(this.invertJoystickY?-1:1)+(this.keys.KeyW||this.keys.ArrowUp?1:0)-(this.keys.KeyS||this.keys.ArrowDown?1:0);const v=new THREE.Vector2(mx,my);if(v.length()>1)v.normalize();if(v.length()>.05){let f=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw)),r=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));let d=f.multiplyScalar(v.y).addScaledVector(r,v.x);let speed=this.playerSpeed*(this.running||this.keys.ShiftLeft?1.85:1);const next=this.player.position.clone().addScaledVector(d,dt*speed);
   next.x=THREE.MathUtils.clamp(next.x,-62,62);next.z=THREE.MathUtils.clamp(next.z,-62,62);
   if(!this.movementBlocked(this.player.position,next,this.player.position.y-.85)){
    this.player.position.x=next.x;this.player.position.z=next.z;
   }this.player.rotation.y=Math.atan2(-d.x,-d.z)+this.avatarFacingOffset;}
  this.player.position.y=THREE.MathUtils.lerp(this.player.position.y,this.supportHeight(this.player.position.x,this.player.position.z,this.player.position.y-.85)+.85,Math.min(1,dt*14));
  this.setAvatarMotion(v.length()>.05);
 }
 animate=(time)=>{requestAnimationFrame(this.animate);if(time-this.tLast<1000/this.fpsLimit)return;let dt=Math.min(.08,(time-this.tLast)/1000||.02);this.tLast=time;this.updatePlayer(dt);if(this.avatarMixer&&this.avatarAnimationsEnabled)this.avatarMixer.update(dt);this.syncAvatarGround(dt);this.updateCamera();this.updateGameGhost();if(this.selected&&this.highlight.visible)this.highlight.setFromObject(this.selected.mesh);this.renderer.render(this.scene,this.camera);this.frames++;this.fps=this.fps*.85+(1/Math.max(dt,.001))*.15;};
}
