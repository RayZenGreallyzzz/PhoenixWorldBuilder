/* Regression checks: anchored textures, three axis gizmo, analogue joystick.
 * Tests run on pinned offline Three.js r140 without a WebGL context.
 */
const assert=require('node:assert/strict');
const path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
const Geometry=require(path.join(base,'js/clean-geometry.js'));
const Workshop=require(path.join(base,'js/surface-workshop.js'));
const Gizmo=require(path.join(base,'js/builder-gizmo.js'));
const Joystick=require(path.join(base,'js/touch-joystick.js'));
const spec={mapping:'repeat',repeat:1,tileMeters:.45,rotation:0,offsetU:0,offsetV:0};
const root=Geometry.create('wall'),mesh=root.children[0],original=mesh.geometry;
function project(){
 const geometry=Workshop.project(root,mesh,original,spec,'wall');
 assert(geometry,'A valid UV geometry must be created');
 const uv=Array.from(geometry.getAttribute('uv').array);
 geometry.dispose();return uv;
}
function equalUV(a,b,message){
 assert.equal(a.length,b.length,message);
 for(let i=0;i<a.length;i++)
  assert(Math.abs(a[i]-b[i])<.0005,message+' at '+i+': '+a[i]+' '+b[i]);
}
const initial=project();
root.position.set(7.314,2.45,-11.76);
root.updateWorldMatrix(true,true);
equalUV(project(),initial,'Texture must not swim when module is moved');
root.rotation.y=Math.PI*.41;
root.updateWorldMatrix(true,true);
equalUV(project(),initial,'Texture must follow module rotation');
root.scale.set(1.9,1,1.3);root.updateWorldMatrix(true,true);
const scaled=project();
assert(scaled.some((x,i)=>Math.abs(x-initial[i])>.1),
 'Repeating textures preserve their physical tile size when module is resized');
// GLB source UVs are left unchanged even after moving an object.
const imported=new T.Group(),box=new T.Mesh(new T.BoxGeometry(3,1,.2),
 new T.MeshStandardMaterial());imported.add(box);
const authored=Array.from(box.geometry.toNonIndexed().getAttribute('uv').array);
const src=Workshop.project(imported,box,box.geometry,{mapping:'source'},'glb:test');
equalUV(Array.from(src.getAttribute('uv').array),authored,'Authored GLB UV are preserved');
src.dispose();
// Test actual touch geometry and Euler rotations with a real THREE.Raycaster.
const scene=new T.Scene(),cam=new T.PerspectiveCamera(60,1,.05,100);
cam.position.set(5,6,9);cam.lookAt(0,0,0);
cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
const canvas={getBoundingClientRect:()=>({left:0,top:0,width:800,height:800})};
const gizmo=new Gizmo(scene,cam,canvas,new T.Raycaster());
const obj={root:new T.Group(),rot:0,rotation:{x:0,y:0,z:0},
 scale:1,axes:{x:1,y:1,z:1}};
scene.add(obj.root);gizmo.attach(obj);gizmo.setMode('rotate');
assert.equal(gizmo.handles.rotate.length,6,'There must be three coloured rings and large touch targets');
const angleAxes={
 x:a=>new T.Vector3(0,Math.cos(a),Math.sin(a)),
 y:a=>new T.Vector3(Math.sin(a),0,Math.cos(a)),
 z:a=>new T.Vector3(Math.cos(a),Math.sin(a),0)
};
const pointer=(point,id=1)=>{
 const p=point.clone().project(cam);
 return {pointerId:id,clientX:(p.x+1)*400,clientY:(1-p.y)*400,
  button:0,isPrimary:true,shiftKey:false};
};
for(const axis of ['x','y','z']){
 const p=pointer(angleAxes[axis](1));
 const angle=gizmo.rotationAngle(p,axis,new T.Vector3());
 assert(Math.abs(angle-1)<.001,'Rotation picking must match '+axis);
 const base={...obj.rotation};
 gizmo.drag={pointerId:1,mode:'rotate',axis,origin:new T.Vector3(),
  sx:p.clientX,sy:p.clientY,px:p.clientX,py:p.clientY,
  baseEuler:base,lastAngle:angle,accumulated:0,changed:false};
 for(let a=1.2;a<1+Math.PI*2+.3;a+=.2)
  gizmo.move(pointer(angleAxes[axis](a)),obj);
 assert(obj.rotation[axis]>Math.PI*2,
  'Axis '+axis+' must rotate smoothly through 360° without discontinuity');
 assert.equal(obj.root.rotation[axis],obj.rotation[axis],'Mesh rotation follows '+axis);
 gizmo.drag=null;
}
// Analog joystick: movement is proportional and always resets on release.
const oldWindow=global.window,oldDocument=global.document;
const listeners={};
global.window={addEventListener(){}};
global.document={addEventListener(){}};
const knob={style:{}},pad={
 querySelector(){return knob},
 addEventListener(name,cb){listeners[name]=cb},
 getBoundingClientRect(){return {left:0,top:0,width:150,height:150}},
 setPointerCapture(){this.captured=true},
 hasPointerCapture(){return !!this.captured},
 releasePointerCapture(){this.captured=false}
};
let last=null;
const joystick=new Joystick(pad,p=>last=p,{deadzone:.12});
const event=(x,y)=>({pointerId:7,button:0,clientX:x,clientY:y,
 preventDefault(){},stopPropagation(){}});
listeners.pointerdown(event(75,75));
assert(Math.abs(last.x)<.001&&Math.abs(last.y)<.001);
listeners.pointermove(event(90,75));
assert(last.x>0&&last.x<.4,'Small thumb movement should walk slowly');
listeners.pointermove(event(150,75));
assert(last.x>.99&&Math.abs(last.y)<.001,'Full right deflection');
listeners.pointermove(event(75,0));
assert(last.y<-.99,'Up means moving forward');
listeners.pointerup(event(75,0));
assert.deepEqual(last,{x:0,y:0},'Releasing pad stops movement immediately');
assert.equal(joystick.pointerId,null);
global.window=oldWindow;global.document=oldDocument;
const fs=require('node:fs');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
assert(app.includes('rotation:{x:obj.root.rotation.x,y:obj.root.rotation.y,z:obj.root.rotation.z}'),
 'XYZ rotations must persist in project');
assert(app.includes('Number(item.rotation?.y??item.rot)'),
 'Old yaw-only saves must remain compatible');
assert(app.includes('raw.clampLength(0,1)'),
 'Analogue speed must not be normalized to one constant velocity');
for(const id of ['rotX','rotY','rotZ','joystickPad'])
 assert(html.includes('id="'+id+'"'),'Missing interactive control: '+id);
assert(html.indexOf('js/touch-joystick.js')<html.indexOf('js/clean-app.js'));
console.log('Texture stability, 360° XYZ gizmo, analogue joystick and persistence OK');
