const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const Edit=require(path.join(base,'js/clean-mesh-edit.js'));
const G=require(path.join(base,'js/clean-geometry.js'));
const near=(v,x,m,t=.035)=>assert(Math.abs(v-x)<t,m+' '+v+' vs '+x);
const source=new THREE.Group();
const geometry=new THREE.BoxGeometry(3,2,.2,3,2,1);
const original=geometry.attributes.position.array.slice();
const originalUV=geometry.attributes.uv.array.slice();
const sourceMesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
source.add(sourceMesh);
assert(Edit.check(source).ok,'Normal GLB style static mesh editable');
let copy=source.clone(true);
let result=Edit.apply(copy,{axis:'x',cutStart:20,cutEnd:10,bendAxis:'x',bend:0});
assert(result.ok&&result.changed&&result.openCut,'Physical trim removes triangles');
const first=G.localBounds(copy);
near(first.min.x,-1.5+3*.2,'20% start trim clips actual geometry');
near(first.max.x,1.5-3*.1,'10% end trim clips actual geometry');
assert(copy.children[0].geometry.attributes.uv.count===copy.children[0].geometry.attributes.position.count,
 'UV triangles remain aligned after plane clipping');
assert.deepEqual(Array.from(geometry.attributes.position.array),Array.from(original),
 'Original GLB source geometry unchanged by trim');
assert.deepEqual(Array.from(geometry.attributes.uv.array),Array.from(originalUV),
 'Original GLB texture coordinates unchanged');
copy=source.clone(true);
result=Edit.apply(copy,{axis:'z',cutStart:0,cutEnd:0,bendAxis:'x',bend:90});
assert(result.ok&&result.triangles>geometry.index.count/3,'Bend subdivides geometry');
const b=G.localBounds(copy);
assert(b.max.z-b.min.z>.6,'Physical bend curves model in 3D, not just rotation/scale');
copy=source.clone(true);
result=Edit.apply(copy,{axis:'x',cutStart:18,cutEnd:15,bendAxis:'x',bend:-65});
assert(result.ok,'Trim and bend can be applied together');
assert(Edit.apply(source.clone(true),{axis:'x',cutStart:80,cutEnd:40}).ok===false,
 'Reject impossible 120% crop');
const skinned=new THREE.Group();
const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
skinned.add(skin);
assert(!Edit.check(skinned).ok,'Skinned meshes remain safe from destructive edits');
const huge={axis:'q',cutStart:1000,cutEnd:0,bend:999,bendAxis:'bad'};
const normalized=Edit.normalize(huge);
assert.deepEqual(normalized,{axis:'x',cutStart:90,cutEnd:0,bendAxis:'x',bend:180},
 'Editable numeric controls remain bounded');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
for(const id of ['trimAxis','trimStart','trimEnd','bendAxis','bendAngle','btnApplyMeshEdit',
 'btnResetMeshEdit','moduleCategory'])assert(html.includes('id="'+id+'"'));
for(const script of ['js/clean-mesh-edit.js','js/clean-app.js'])
 assert(html.includes(script),'Editor includes actual editing engine: '+script);
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
assert(app.includes("this.aimPlacement()"),'Character and drone use placement aim');
assert(app.includes("attachDecor(obj,hit)"),'Wall decorations attach by collision intersection');
assert(app.includes("this.locatePointer(e)"),'Touch selection and placement use the same raycast');
assert(app.includes("meshEdit:CleanMeshEdit.normalize(obj.meshEdit)"),'Deformation persists in project data');
console.log('Mesh editor: trim, bend, UV, source preservation, safe complex-model handling and UI OK');
