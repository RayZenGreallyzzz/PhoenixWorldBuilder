const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const THREE=require(path.join(assets,'js/three.min.js'));
const Camera=require(path.join(assets,'js/free-camera.js'));
const eps=(a,b,what)=>assert(Math.abs(a-b)<1e-7,what+': '+a+' vs '+b);
const vect=(v,w,what)=>{eps(v.x,w.x,what+' x');eps(v.y,w.y,what+' y');eps(v.z,w.z,what+' z')};
{
 const camera=new THREE.PerspectiveCamera(59,1,.05,240);
 camera.position.set(12,14,18);
 const controls={target:new THREE.Vector3(0,1.2,0),updateCount:0,
  update(){this.updateCount++}};
 const beforeOffset=camera.position.clone().sub(controls.target);
 const house=new THREE.Group();house.position.set(23.237,0,-6.004);
 house.add(new THREE.Mesh(new THREE.BoxGeometry(4,3,2),
  new THREE.MeshStandardMaterial()));
 house.updateWorldMatrix(true,true);
 const originalHousePosition=house.position.clone();
 const originalHouseScale=house.scale.clone();
 const point=Camera.selectedCenter(THREE,house);
 vect(point,new THREE.Vector3(23.237,0,-6.004),'World-space selected wall centre');
 assert(Camera.focus(camera,controls,point),'Focus succeeds');
 vect(camera.position.clone().sub(controls.target),beforeOffset,
  'Moving focus must not change camera direction, zoom distance or angle');
 vect(controls.target,point,'Controls must rotate about selected point');
 vect(house.position,originalHousePosition,'Camera focus must not translate wall');
 vect(house.scale,originalHouseScale,'Camera focus must not rescale wall');
 assert.equal(controls.updateCount,1,'OrbitControls updated');
 const afterCamera=camera.position.clone(),afterTarget=controls.target.clone();
 assert(!Camera.focus(camera,controls,new THREE.Vector3(Infinity,0,0)),
  'Invalid point rejected without camera motion');
 vect(camera.position,afterCamera,'Invalid point leaves camera unchanged');
 vect(controls.target,afterTarget,'Invalid point leaves pivot unchanged');
 assert(!Camera.focus(camera,controls,null),'Empty focus rejected');
}
{
 const camera=new THREE.PerspectiveCamera(59,800/600,.05,240);
 camera.position.set(0,3,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),root=new THREE.Group();
 const box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());
 root.add(box);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshBasicMaterial());
 ground.rotation.x=-Math.PI/2;ground.position.y=-.01;
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
 const point=Camera.hitPosition(THREE,camera,ray,canvas,[{root}],ground,
  {clientX:400,clientY:300,isPrimary:true});
 assert(point&&Number.isFinite(point.x)&&point.z>0,
  'User can point at an installed module to move the orbit pivot');
 const floorPoint=Camera.hitPosition(THREE,camera,ray,canvas,[],ground,
  {clientX:400,clientY:300,isPrimary:true});
 assert(floorPoint&&Math.abs(floorPoint.y+.01)<.01,
  'User can select the ground as a camera orbit pivot even with no modules');
 const invalid=Camera.hitPosition(THREE,camera,ray,
  {getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})},
  [],ground,{clientX:10,clientY:10});
 assert.equal(invalid,null,'Missing canvas size does not reposition camera');
}
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
const app=fs.readFileSync(path.join(assets,'js/clean-app.js'),'utf8');
assert(html.includes('id="btnFocusCamera"'),'No camera pivot button');
assert(html.indexOf('js/free-camera.js')<html.indexOf('js/clean-app.js'),
 'Camera helper loaded before editor');
for(const token of [
 "this.controls.enablePan=mode!=='character'",
 "this.controls.screenSpacePanning=mode==='drone'",
 "this.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN",
 "this.cameraFocusPick=false",
 'startCameraFocus(){','setCameraFocusAt(event){',
 'FreeCamera.focus(this.camera,this.controls,point)',
 'FreeCamera.selectedCenter(THREE,this.selected.root)',
 'FreeCamera.hitPosition(THREE,this.camera,this.ray,this.canvas',
 "if(this.cameraFocusPick){this.setCameraFocusAt(e);return}",
 "e.pointerId!==start.pointerId||e.isPrimary===false"
])assert(app.includes(token),'Camera navigation not wired safely: '+token);
assert(!app.includes("this.controls.enablePan=mode==='drone'"),
 'Old forced build-mode centre lock must be removed');
console.log('Camera orbit target free: movement/pan, tap object/ground, safe player follow, no scene transformations OK');
