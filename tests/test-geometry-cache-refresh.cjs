const assert=require('node:assert/strict'),path=require('node:path');
const d=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(d,'three.min.js'));
global.BuildSnap=require(path.join(d,'build-snap.js'));
global.BuildPlacementValidator=require(path.join(d,'build-placement.js'));
global.WallThickness=require(path.join(d,'wall-thickness.js'));
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<.002,
 label+': expected '+expected+', got '+actual);
const root=new THREE.Group();
const wall=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.22),
 new THREE.MeshStandardMaterial());
wall.position.y=1.3;root.add(wall);
let box=BuildSnap.attrBounds(root),collision=BuildPlacementValidator.rect(root);
near(box.max.z-box.min.z,.22,'Original wall thickness in snap bounds');
near(collision.length,.22,'Original wall thickness in collision rectangle');
// Existing wall root transform does not change. Physical geometry does.
assert(WallThickness.apply(root,'wall','wall',.5),'Wall thickness changed');
box=BuildSnap.attrBounds(root);collision=BuildPlacementValidator.rect(root);
near(box.max.z-box.min.z,.5,'Snap bounds must update after thickness edit');
near(collision.length,.5,'Collision rectangle must update after thickness edit');
// Source-model editing mutates position attributes without replacing root.
wall.geometry.scale(1.5,1,1);
box=BuildSnap.attrBounds(root);collision=BuildPlacementValidator.rect(root);
near(box.max.x-box.min.x,3,'Snap bounds must reflect in-place mesh resize');
near(collision.width,3,'Collision rectangle must reflect in-place mesh resize');
// Replacing the geometry while reusing the same world transform is supported.
wall.geometry=new THREE.BoxGeometry(3.7,2.6,.32);
box=BuildSnap.attrBounds(root);collision=BuildPlacementValidator.rect(root);
near(box.max.x-box.min.x,3.7,'Snap bounds after geometry replacement');
near(collision.length,.32,'Collision bounds after geometry replacement');
console.log('Geometry cache refresh verified after thickness, in-place scaling and mesh replacement');
