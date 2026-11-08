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
// Switching to a walking pose must re-measure bones but not touch the
// exported source or animation-owned node scale.
bone.scale.y=10;
const nextPose=Fit.measure(model,wrapper);
const wanted=Fit.compute(nextPose,175);
assert(Math.abs(wanted.uniform/wrapper.scale.x-1)>.06,
 'A large walk pose should trigger auto re-fit');
Fit.apply(wrapper,nextPose,175);
eps(Fit.measure(model).size.y,1.75,'Walk-pose visible height',.025);
bone.scale.y=4;
const shortened=Fit.measure(model,wrapper);
Fit.apply(wrapper,shortened,165);
eps(Fit.measure(model).size.y,1.65,'Changing character height slider',.025);
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
 'this.avatarFitChecksLeft=3',
 'AvatarFit.measure(this.avatarModelRoot,this.avatarFitGroup)',
 'resetCharacterView(){',
 "$('btnResetCharacterView').onclick"
])assert(app.includes(snippet),'App missing safe avatar fit logic: '+snippet);
assert(html.includes('id="btnResetCharacterView"'),'User needs one-tap camera reset');
console.log('Skinned avatar real height: 8x rig, animation poses, relative frame, height slider and camera reset OK');
