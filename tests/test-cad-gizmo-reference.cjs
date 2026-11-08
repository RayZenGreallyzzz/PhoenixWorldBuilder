/* Video-style CAD gizmo: gold view-axis ring, real 3D XYZ rings,
 * stable physical W/H/D badges and quick mobile mode/camera controls.
 */
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../app/src/main/assets');
const THREE=global.THREE=require(path.join(base,'js/three.min.js'));
const Geometry=require(path.join(base,'js/clean-geometry.js'));
const elements={};
for(const id of ['gizmoCadOverlay','gizmoMeasureWidth','gizmoMeasureHeight',
 'gizmoMeasureDepth'])
 elements[id]={hidden:true,style:{},textContent:''};
const previousDocument=global.document;
global.document={getElementById:id=>elements[id]||null};
const Gizmo=require(path.join(base,'js/builder-gizmo.js'));
const camera=new THREE.PerspectiveCamera(60,1,.1,300);
camera.position.set(8,8,10);camera.lookAt(0,1,0);
camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
const scene=new THREE.Scene();
const canvas={getBoundingClientRect:()=>({left:0,top:0,width:900,height:900})};
const gizmo=new Gizmo(scene,camera,canvas,new THREE.Raycaster());
assert.equal(gizmo.mode,'rotate','The reference-style rings should be shown by default');
assert.equal(gizmo.handles.rotate.length,8);
assert.equal(gizmo.viewRings.length,2);
assert.equal(gizmo.viewRings[0].userData.axis,'view');
assert.equal(gizmo.viewRings[1].userData.axis,'view');
assert.equal(gizmo.viewRings[1].material.opacity,0,'Large ring is invisible touch target');
assert(gizmo.handles.rotate.some(x=>x.userData.axis==='x'));
assert(gizmo.handles.rotate.some(x=>x.userData.axis==='y'));
assert(gizmo.handles.rotate.some(x=>x.userData.axis==='z'));
const root=Geometry.create('wall');
scene.add(root);
root.position.set(1,0,1);
const selected={root,rot:0,rotation:{x:0,y:0,z:0},scale:1,
 axes:{x:1,y:1,z:1}};
gizmo.attach(selected);
assert(gizmo.group.visible);
assert.equal(elements.gizmoCadOverlay.hidden,false);
assert(elements.gizmoMeasureWidth.textContent.includes('2.00 м'),
 'Width badge should show physical metres');
assert(elements.gizmoMeasureHeight.textContent.includes('2.60 м'),
 'Height badge should show physical metres');
assert(elements.gizmoMeasureDepth.textContent.includes('0.22 м'),
 'Depth badge should show physical metres');
const q=new THREE.Quaternion();
camera.getWorldQuaternion(q);
assert(gizmo.viewRings[0].quaternion.angleTo(q)<1e-6,
 'Gold ring must face the user camera');
const pointerAt=world=>{
 const p=world.clone().project(camera);
 return {pointerId:11,button:0,isPrimary:true,shiftKey:false,
  clientX:(p.x+1)*450,clientY:(1-p.y)*450};
};
const origin=gizmo.group.position.clone();
const scalar=gizmo.group.scale.x;
const outerStart=new THREE.Vector3(1.30,0,0).applyQuaternion(q)
 .multiplyScalar(scalar).add(origin);
const touch=pointerAt(outerStart);
assert(gizmo.start(touch),'Outer gold ring should be targetable directly');
assert.equal(gizmo.drag.axis,'view','Gold drag selects camera-axis rotation');
const centre=pointerAt(origin);
let current={...touch};
for(const angle of [.2,.4,.6,.8,1.0]){
 current={...touch,clientX:centre.clientX+
  (touch.clientX-centre.clientX)*Math.cos(angle)-
  (touch.clientY-centre.clientY)*Math.sin(angle),
 clientY:centre.clientY+
  (touch.clientX-centre.clientX)*Math.sin(angle)+
  (touch.clientY-centre.clientY)*Math.cos(angle)};
 gizmo.move(current,selected);
}
assert(selected.root.quaternion.angleTo(new THREE.Quaternion())>.3,
 'Free ring must rotate the real object');
assert(Math.abs(selected.rotation.x)+Math.abs(selected.rotation.y)+
 Math.abs(selected.rotation.z)>.1,
 'Free rotation must persist as full XYZ Euler angles');
const done=gizmo.end(current);
assert(done.changed&&done.axis==='view');
gizmo.toggleCad(false);
assert.equal(elements.gizmoCadOverlay.hidden,true);
gizmo.toggleCad(true);
assert.equal(elements.gizmoCadOverlay.hidden,false);
gizmo.setMode('move');
assert(gizmo.handles.rotate.every(x=>!x.visible),
 'Rotation rings must hide during translation');
gizmo.setMode('scale');
assert(gizmo.handles.rotate.every(x=>!x.visible),
 'Rotation rings must hide during scaling');
gizmo.attach(null);
assert.equal(elements.gizmoCadOverlay.hidden,true);
assert.equal(gizmo.group.visible,false);
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),
 css=fs.readFileSync(path.join(base,'clean.css'),'utf8'),
 app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['gizmoCadOverlay','gizmoMeasureWidth','gizmoMeasureHeight',
 'gizmoMeasureDepth','gizmoQuickbar','quickGizmoRotate',
 'quickGizmoMove','quickGizmoScale','quickGizmoCad','quickGizmoFocus',
 'quickViewFront','quickViewSide','quickViewTop',
 'gizmoCadSizePanel','gizmoWidthMeters','gizmoHeightMeters',
 'gizmoDepthMeters','btnGizmoApplyDimensions'])
 assert(html.includes('id="'+id+'"'),'Gizmo HUD is missing '+id);
assert(css.includes('pointer-events:none'),'Dimension badges must not intercept touch');
for(const fragment of ['updateGizmoDock(){','selectGizmoMode(mode){',
 'focusGizmoView(view=',"this.gizmo.toggleCad(true)",
 'applyGizmoCadDimensions(){','this.recordEdit();',
 "this.focusGizmoView('front')","this.focusGizmoView('side')",
 "this.focusGizmoView('top')"])
 assert(app.includes(fragment),'Missing reference-style gizmo behavior '+fragment);
global.document=previousDocument;
console.log('CAD video gizmo: RGB axes, finger-friendly view ring, XYZ rotation, dimension badges and dock OK');
