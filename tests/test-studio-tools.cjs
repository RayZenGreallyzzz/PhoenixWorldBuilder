const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const Fit=require(path.join(base,'js/avatar-fit.js'));
const Materials=require(path.join(base,'js/surface-materials.js'));
const Gizmo=require(path.join(base,'js/builder-gizmo.js'));
const close=(a,b,eps=.005)=>assert(Math.abs(a-b)<=eps,a+' differs from '+b);
{
 const root=new THREE.Group(),source=new THREE.Mesh(
  new THREE.BoxGeometry(60,120,40),new THREE.MeshStandardMaterial());
 root.add(source);
 const sourceSize=root.scale.clone();
 const metrics=Fit.measure(root);
 const wrapper=new THREE.Group();wrapper.add(root);
 const fit=Fit.apply(wrapper,metrics,175);
 assert(fit.uniform>0&&fit.uniform<1,'Giant imported GLB must shrink to human scale');
 assert.deepEqual(root.scale.toArray(),sourceSize.toArray(),
  'Animation-owned GLB transform remains untouched');
 const box=new THREE.Box3().setFromObject(wrapper),size=box.getSize(new THREE.Vector3());
 assert(size.y<=1.75001&&size.x<=1.20&&size.z<=.93,
  'Huge game character fits the real-life envelope');
 close(box.min.y,0,.01);
 const second=Fit.apply(wrapper,metrics,150);
 assert(second.uniform<fit.uniform,'Height slider scales avatar down without touching animation');
 const target=Fit.apply(wrapper,metrics,210);
 assert(target.uniform>second.uniform,'Height slider scales avatar back up');
}
{
 const group=new THREE.Group();
 const sourceMaterial=new THREE.MeshStandardMaterial({color:0xffffff});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),sourceMaterial);group.add(mesh);
 const result=Materials.apply(group,{style:'paint',color:'#ff3300',repeat:3});
 assert(result.ok&&result.changed&&mesh.material.color.r>.8,'Tint is applied to selected instance');
 assert.notStrictEqual(mesh.material,sourceMaterial,'Original imported GLB material cannot be mutated');
 assert.equal(Materials.normalize({style:'tile',repeat:999}).repeat,12);
 assert.equal(Materials.normalize({style:'dangerous'}).style,'none');
}
{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),canvas={getBoundingClientRect(){
  return {left:0,top:0,width:800,height:600};
 }};
 camera.position.set(5,5,10);
 const gizmo=new Gizmo(scene,camera,canvas,new THREE.Raycaster());
 const root=new THREE.Group();
 root.position.set(1,0,3);
 const entry={root,rot:0,scale:1,axes:{x:1,y:1,z:1}};
 gizmo.attach(entry);assert(gizmo.group.visible,'Gizmo visible when object is selected');
 gizmo.update();close(gizmo.group.position.x,1);
 for(const mode of ['rotate','scale','move'])gizmo.setMode(mode);
 assert.equal(gizmo.mode,'move','Gizmo switches between three transform modes');
 gizmo.attach(null);assert.equal(gizmo.group.visible,false,'Gizmo hides when deselected');
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['avatarHeight','tabTextures','textureLibrary','btnApplyTexture','btnClearTexture',
 'gizmoMove','gizmoRotate','gizmoScale'])assert(html.includes('id="'+id+'"'),'UI missing '+id);
for(const x of ['new BuilderGizmo','this.applyAvatarHeight','WallOpenings.splitAtJunction',
 'SurfaceMaterials.normalize','applySurfaceTo(obj)','this.gizmo.move'])
 assert(app.includes(x),'Feature is not connected: '+x);
for(const path of ['js/avatar-fit.js','js/wall-openings.js','js/builder-gizmo.js','js/surface-materials.js'])
 assert(html.indexOf(path)<html.indexOf('js/clean-app.js'),'Dependency scripts load too late: '+path);
console.log('Avatar real-height fitting, safe paint materials, touch gizmo modes and feature wiring OK');
