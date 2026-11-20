/* Run after importing the original UV44 web assets and applying UV fixes.
 * node tests/test-uv44-postfix.cjs
 * Covers rotations, mirrors, corner UV finiteness, imported L-wall face
 * selection, and avoidance of transparent glass materials.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.UV44_JS_DIR ? path.resolve(process.env.UV44_JS_DIR) :
  path.resolve(__dirname, '../app/src/main/assets/js');
global.THREE = require(path.join(base, 'three.min.js'));
global.ArchitectureKit = {catalog: [], has: () => false};
global.CleanGeometry = require(path.join(base, 'clean-geometry.js'));
global.SurfaceWorkshop = require(path.join(base, 'surface-workshop.js'));
global.SurfaceMaterials = require(path.join(base, 'surface-materials.js'));
const T = THREE;
let projections = 0;
function projectFinite(root, kind) {
  const mesh = root.children[0];
  root.updateWorldMatrix(true, true);
  const geo = SurfaceWorkshop.project(root, mesh, mesh.geometry,
    {mapping:'repeat', tileMeters:1, rotation:0, offsetU:0, offsetV:0}, kind);
  assert(geo, 'UV projection failed for ' + kind);
  const uv = geo.getAttribute('uv');
  assert.equal(uv.count, geo.getAttribute('position').count);
  for (let i = 0; i < uv.count; i++) {
    assert(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)),
      'Nonfinite UV ' + i + ' for ' + kind);
  }
  geo.dispose();
  projections++;
}
for (const kind of ['corner', 'arc90', 'arc180']) {
  const root = CleanGeometry.create(kind);
  for (const yaw of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
    root.rotation.y = yaw;
    root.scale.set(1, 1, 1);
    projectFinite(root, kind);
    root.scale.set(-1, 1, 1);
    projectFinite(root, kind);
  }
}
function importedL() {
  const root = new T.Group();
  const x = new T.Mesh(new T.BoxGeometry(2, 2.6, .22),
    new T.MeshStandardMaterial());
  x.position.set(-.95, 1.3, 0);
  const z = new T.Mesh(new T.BoxGeometry(.22, 2.6, 2),
    new T.MeshStandardMaterial());
  z.position.set(0, 1.3, -.95);
  root.add(x, z);
  root.updateWorldMatrix(true, true);
  return {root, x, z};
}
const {root,x,z} = importedL();
assert.equal(CleanGeometry.sockets('glb:test', root, null, 'wall').length, 2,
  'Expected physical end sockets on L-wall');
function face(mesh, normal, localPoint) {
  root.updateWorldMatrix(true, true);
  const worldPoint = root.localToWorld(new T.Vector3(...localPoint));
  return SurfaceMaterials.faceFromHit({
    object:mesh, face:{normal:new T.Vector3(...normal), materialIndex:0},
    point:worldPoint
  }, root, 'wall', 'glb:test');
}
assert.equal(face(x, [0,0,1], [-1,1.3,.11]), 'front');
assert.equal(face(x, [0,0,-1], [-1,1.3,-.11]), 'back');
assert.equal(face(z, [1,0,0], [.11,1.3,-1]), 'front');
assert.equal(face(z, [-1,0,0], [-.11,1.3,-1]), 'back');
root.rotation.y = Math.PI/2;
root.scale.x = -1;
assert.equal(face(x, [0,0,1], [-1,1.3,.11]), 'front',
  'Mirroring/rotation must not invert the outside material');
x.material = new T.MeshStandardMaterial({transparent:true, opacity:.35});
assert.equal(face(x, [0,0,1], [-1,1.3,.11]), null,
  'Do not select glass for face repaint');
assert.equal(SurfaceMaterials.sideFromNormal(new T.Vector3(0,1,0),
  'floor', 'floor', new T.Vector3(0,.1,0)), 'front');
console.log('PASS: ' + projections + ' UV projections; L-wall side classification; mirror; glass; floor');
