/* Regression for giant GLB characters on Android: Three.js r140 Box3
 * ignores skinning. The visible, ANIMATED skeleton pose must drive fit.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE,Fit=require(path.join(base,'js/avatar-fit.js'));
const eps=(a,b,label,tol=.03)=>assert(Math.abs(a-b)<tol,
 label+': expected '+b+', actual '+a);
function rig(){
 const geo=new T.BoxGeometry(.5,2,.25);
 const pos=geo.getAttribute('position'),indices=[],weights=[];
 for(let i=0;i<pos.count;i++){
  indices.push(0,0,0,0);weights.push(1,0,0,0);
 }
 geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
 geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geo,new T.MeshStandardMaterial());
 const bone=new T.Bone();bone.name='pose:height';
 mesh.add(bone);mesh.bind(new T.Skeleton([bone]));
 const model=new T.Group();model.add(mesh);
 const wrapper=new T.Group();wrapper.name='avatar:stable-fit';wrapper.add(model);
 const player=new T.Group();player.position.set(11,0,-9);
 player.rotation.y=Math.PI/4;player.add(wrapper);
 const scene=new T.Scene();scene.add(player);
 return {scene,player,wrapper,model,mesh,bone};
}
const {wrapper,model,bone,mesh,player}=rig();
const bind=Fit.measure(model,wrapper);
eps(bind.size.y,2,'Bind-pose height');
bone.scale.y=8;
const pose=Fit.measure(model,wrapper);
assert(pose.size.y>15.5,'Skinning changes actual height eight-fold');
const stale=new T.Box3().setFromObject(model).getSize(new T.Vector3()).y;
assert(stale<pose.size.y/4,
 'Old Box3.setFromObject() ignores the deformed skeleton and underestimates');
const first=Fit.apply(wrapper,pose,175);
assert(first.uniform<.12,'Giant pose must shrink drastically');
eps(Fit.measure(model).size.y,1.75,'Real visible character after fitting',.025);
eps(Fit.measure(model,wrapper).size.y,16,'Local measurements ignore fit wrapper',.02);
// Regression from real Android recording: when the first walk begins,
 // the old code re-fit the avatar THREE TIMES (.38s apart), so the same
 // character seemed to grow/shrink repeatedly. A changing pose must NEVER
 // change avatar:stable-fit's scale or position.
const fixedScale=wrapper.scale.x,fixedPosition=wrapper.position.clone();
for(const boneScale of [10,8.5,6.4,10,8]){
 bone.scale.y=boneScale;
 const animatedPose=Fit.measure(model,wrapper);
 assert(animatedPose.size.y>2,'The actual skeleton is still moving');
 eps(wrapper.scale.x,fixedScale,'Fit scale stays fixed during walk/idle',1e-8);
 assert(wrapper.position.distanceTo(fixedPosition)<1e-8,
  'Fit position stays fixed during animation');
}
// Only an explicit change to the height slider is allowed to re-fit.
const adjusted=Fit.apply(wrapper,pose,165);
eps(adjusted.uniform,fixedScale*165/175,
 'Height slider changes the fixed imported scale exactly once',1e-7);
bone.scale.y=8;
eps(Fit.measure(model).size.y,1.65,'Height slider at imported pose',.025);
// Imported avatars also contain static shoes/ornaments. Include them
// without letting a hidden helper floor influence bounds.
const shoe=new T.Mesh(new T.BoxGeometry(.4,.12,.32),new T.MeshStandardMaterial());
shoe.position.y=-1;model.add(shoe);
const helper=new T.Mesh(new T.BoxGeometry(400,900,400),new T.MeshStandardMaterial());
helper.visible=false;model.add(helper);
const mixed=Fit.measure(model,wrapper);
assert(mixed.size.y<10,'Hidden GLB helper cannot make avatar tiny');
const newFit=Fit.apply(wrapper,mixed,175);
assert(newFit.uniform>0&&newFit.uniform<1);
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const snippet of [
 'AvatarFit.measure(root,fitted)',
 'this.avatarMixer.update(1/60)',
 'this.avatarFitGroup=fitted;this.avatarMetrics=metrics;',
 'resetCharacterView(){',
 "$('btnResetCharacterView').onclick"
])assert(app.includes(snippet),'App missing safe avatar fit logic: '+snippet);
assert(html.includes('id="btnResetCharacterView"'),'User needs one-tap camera reset');
// Ensure future refactoring cannot silently restore triple animation refits.
assert(!app.includes('avatarFitChecksLeft'),'Animation must not re-trigger avatar scale fitting');
assert(!app.includes('avatarFitCheckTimer'),'Animation must not run timed avatar refits');
const update=app.slice(app.indexOf(' updatePlayer(dt){'),app.indexOf(' bind(){'));
assert(!update.includes('AvatarFit.apply(')&&!update.includes('AvatarFit.measure('),
 'updatePlayer is only allowed to animate/move, not change avatar size');
const switchAnimation=app.slice(app.indexOf(' setAvatarAnimation(moving){'),
 app.indexOf(' updatePlayer(dt){'));
assert(!switchAnimation.includes('AvatarFit.apply(')&&
 !switchAnimation.includes('avatarFitChecksLeft'),
 'Idle/walk transitions may not change the overall avatar size');
console.log('Skinned avatar real height: fixed import size, no triple changes on first walk, stable idle/walk pose and manual height slider OK');
