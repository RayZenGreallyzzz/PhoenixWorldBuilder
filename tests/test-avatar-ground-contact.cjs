/* Grounding imported animated GLB characters must move feet, NOT change
 * avatar:stable-fit scale during walking. Keep the character on real floors.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const THREE=global.THREE;
const AvatarFit=require(path.join(base,'js/avatar-fit.js'));
const Collision=require(path.join(base,'js/character-collision.js'));
const Geometry=require(path.join(base,'js/clean-geometry.js'));
const near=(a,b,msg,eps=.025)=>assert(Math.abs(a-b)<=eps,
 msg+': '+a+' vs '+b);
function skinnedCharacter(){
 const geo=new THREE.BoxGeometry(.44,2,.24),pos=geo.getAttribute('position');
 const index=[],weight=[];
 for(let i=0;i<pos.count;i++){
  index.push(0,0,0,0);weight.push(1,0,0,0);
 }
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));
 geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial());
 const hip=new THREE.Bone();mesh.add(hip);mesh.bind(new THREE.Skeleton([hip]));
 const root=new THREE.Group();root.add(mesh);
 const fitGroup=new THREE.Group();fitGroup.add(root);
 const player=new THREE.Group();player.add(fitGroup);
 const scene=new THREE.Scene();scene.add(player);
 const metrics=AvatarFit.measure(root,fitGroup),fit=AvatarFit.apply(fitGroup,metrics,175);
 return {scene,root,fitGroup,player,hip,fit,mesh};
}
const {root,fitGroup,player,hip}=skinnedCharacter();
const scale=fitGroup.scale.x,
 initial={x:fitGroup.position.x,z:fitGroup.position.z};
near(AvatarFit.measure(root).min.y,0,'Initial character feet on ground',.005);
for(const lift of [.42,.83,.55,.11,0,.62]){
 hip.position.y=lift;
 const before=AvatarFit.measure(root).min.y;
 const target=AvatarFit.groundTarget(root,fitGroup);
 assert(Number.isFinite(target));
 assert(AvatarFit.ground(fitGroup,target,1/60),'Grounding should adjust feet');
 for(let frame=0;frame<60;frame++)
  AvatarFit.ground(fitGroup,target,1/60);
 near(AvatarFit.measure(root).min.y,0,'Feet grounded for animated lift '+lift,.004);
 near(fitGroup.scale.x,scale,'Scale X stays fixed',1e-10);
 near(fitGroup.scale.y,scale,'Scale Y stays fixed',1e-10);
 near(fitGroup.scale.z,scale,'Scale Z stays fixed',1e-10);
 near(fitGroup.position.x,initial.x,'No X drift',1e-10);
 near(fitGroup.position.z,initial.z,'No Z drift',1e-10);
 assert(Math.abs(before)>.001,
  'New animation pose should move feet relative to the previous planted pose');
}
const oldScale=fitGroup.scale.x;
hip.position.y=.5;
const target=AvatarFit.groundTarget(root,fitGroup);
assert(AvatarFit.ground(fitGroup,target,0,true),'Manual ground button snaps immediately');
near(AvatarFit.measure(root).min.y,0,'Manual feet snap',.001);
near(fitGroup.scale.x,oldScale,'Manual snap must never alter height',1e-10);
// Explicit height-slider operation is the only allowed change to fit scale.
const metrics=AvatarFit.measure(root,fitGroup);
AvatarFit.apply(fitGroup,metrics,185);
assert(Math.abs(fitGroup.scale.x-oldScale)>.0001);
const next=AvatarFit.groundTarget(root,fitGroup);
AvatarFit.ground(fitGroup,next,0,true);
near(AvatarFit.measure(root).min.y,0,'Feet stay planted after changing height',.001);
// Real floor top is .18m, not the Y=0 editor grid.
const floor=Geometry.create('floor');floor.updateWorldMatrix(true,true);
const solver=new Collision.Solver();
const nearMeshes=solver.meshes([{root:floor,category:'floor'}],
 new THREE.Vector3(0,0,0),1.3);
assert(nearMeshes.length>0,'Ground mesh should be found');
const floorTop=solver.support(new THREE.Vector3(0,0,0),nearMeshes);
near(floorTop,.18,'Player physics snaps to actual floor top',.003);
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
assert(html.includes('id="btnGroundAvatar"'));
for(const expression of ['refreshAvatarFeet(instant=false){',
 'snapPlayerToFloor(){','placeAvatarOnGround(){',
 'AvatarFit.groundTarget(this.avatarRoot,this.avatarFitGroup)',
 'AvatarFit.ground(this.avatarFitGroup,this.avatarGroundY,dt)',
 'this.avatarGroundTimer>=.22',
 "this.snapPlayerToFloor();",
 "$('btnGroundAvatar').onclick"])
 assert(app.includes(expression),'Missing ground contact logic: '+expression);
const update=app.slice(app.indexOf(' updatePlayer(dt){'),app.indexOf(' bind(){'));
assert(!update.includes('AvatarFit.apply(')&&
 !update.includes('AvatarFit.compute(')&&
 !update.includes('AvatarFit.measure('),
 'Running and idle animation must NEVER resize the character');
console.log('Animated avatar ground contact: real skeleton, six poses, immutable scale, floor physics and manual snap OK');
