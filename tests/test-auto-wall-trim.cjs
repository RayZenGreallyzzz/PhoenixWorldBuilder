const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const G=require(path.join(base,'js/clean-geometry.js'));
global.FloorClip=require(path.join(base,'js/floor-clip.js'));
const FloorClip=global.FloorClip;
const Edges=require(path.join(base,'js/edge-auto-trim.js'));
const Mesh=require(path.join(base,'js/clean-mesh-edit.js'));
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const near=(x,y,label,t=.04)=>assert(Math.abs(x-y)<t,label+': '+x+' expected '+y);
function module(id,kind,pos=[0,0,0],rot=0,storey=0,category=kind==='floor'?'floor':'wall'){
 const root=G.create(kind);root.position.fromArray(pos);root.rotation.y=rot;
 root.updateWorldMatrix(true,true);
 return {id,kind,root,category,storey,scale:1,axes:{x:1,y:1,z:1}};
}
function rawBounds(module){return G.localBounds(G.create(module.kind))}
{
 const floor=module(1,'floor',[0,0,.5]);
 const wall=module(2,'wall',[0,0,0]);
 const result=Edges.resolve(floor,[wall],rawBounds(floor));
 assert(result.ok&&result.cuts.length===1,'A wall crossing an outer floor edge generates one cut');
 const original=G.create('floor'),before=Array.from(original.children[0].geometry.attributes.position.array);
 const copy=G.create('floor');
 const clipped=FloorClip.apply(copy,{cuts:result.cuts});
 assert(clipped.ok&&clipped.changed,'Cut from a real wall is applied to solid floor');
 const bb=G.localBounds(copy);
 near(bb.min.z,-.39,'Floor ends at inside wall face with 11 cm half thickness');
 near(bb.max.z,1,'Inside floor edge remains');
 assert.deepEqual(Array.from(original.children[0].geometry.attributes.position.array),before,
  'Auto-trim cannot mutate source floor geometry');
 const far=module(3,'wall',[20,0,0]),up=module(4,'wall',[0,2.6,0],0,1);
 assert.equal(Edges.resolve(floor,[far,up],rawBounds(floor)).ok,false,
  'Distant and other-storey walls cannot trim this tile');
}
{
 const floor=module(10,'floor',[.4,0,.4]);
 const wx=module(11,'wall',[0,0,0]);
 const wz=module(12,'wall',[0,0,0],Math.PI/2);
 const result=Edges.resolve(floor,[wx,wz],rawBounds(floor));
 assert(result.ok&&result.cuts.length===2,
  'Two wall faces at a corner must both trim one floor tile');
 const newFloor=G.create('floor');
 assert(FloorClip.apply(newFloor,{cuts:result.cuts}).ok);
 const bb=G.localBounds(newFloor);
 assert(bb.getSize(v()).x<1.9&&bb.getSize(v()).z<1.9,
  'Both local axes shortened at the building corner');
}
{
 const floor=module(20,'floor',[.4,0,.35]);
 const slanted=module(21,'wall',[0,0,0],Math.PI/4);
 const result=Edges.resolve(floor,[slanted],rawBounds(floor));
 assert(result.ok&&result.cuts.length===1,'A 45-degree wall creates an angled cut');
 assert(Math.abs(result.cuts[0].nx)>.1&&Math.abs(result.cuts[0].nz)>.1,
  'Wall cut normal carries both X and Z components');
 assert(FloorClip.apply(G.create('floor'),{cuts:result.cuts}).ok);
}
{
 const floor=module(25,'floor',[0,0,.5]);
 const arc=module(26,'arc90',[0,0,0]);
 const result=Edges.resolve(floor,[arc],rawBounds(floor));
 assert.equal(result.ok,false,'Unsupported curved wall must never trigger a fake straight cut');
 assert.equal(result.skippedCurved,1);
}
{
 const source=new THREE.Group();
 const a=new THREE.Mesh(new THREE.BoxGeometry(2,.2,2),new THREE.MeshStandardMaterial());
 source.add(a);
 const original=Array.from(a.geometry.attributes.position.array),uv=Array.from(a.geometry.attributes.uv.array);
 const importCopy=source.clone(true);
 const result=Mesh.apply(importCopy,{planeCuts:[{nx:1,nz:0,offset:.5}]});
 assert(result.ok&&result.openCut,'Imported GLB supports exact vertical plane clipping');
 const box=G.localBounds(importCopy);
 near(box.max.x,.5,'Clipped imported GLB has correct physical limit');
 near(box.min.x,-1,'Uncut imported GLB side remains');
 assert.equal(importCopy.children[0].geometry.attributes.position.count,
  importCopy.children[0].geometry.attributes.uv.count,'UV remains aligned to triangles');
 assert.deepEqual(Array.from(a.geometry.attributes.position.array),original,'Source GLB geometry untouched');
 assert.deepEqual(Array.from(a.geometry.attributes.uv.array),uv,'Source GLB UV untouched');
 const second=new THREE.Mesh(new THREE.BoxGeometry(.5,.2,.5),new THREE.MeshStandardMaterial());
 second.position.x=3;source.add(second);
 const multi=source.clone(true);
 assert(Mesh.apply(multi,{planeCuts:[{nx:-1,nz:0,offset:-.5}]}).ok,
  'Import with a completely cut-away child still succeeds');
 assert.equal(multi.children[1].visible,false,'Removed child mesh stops rendering');
 assert.equal(source.children[1].visible,true,'Source child keeps visibility');
 const bad=source.clone(true);
 assert.equal(Mesh.apply(bad,{planeCuts:[{nx:1,nz:0,offset:100}]}).ok,false,
  'Reject a GLB cut removing all components');
 const normalized=Mesh.normalize({planeCuts:[{nx:4,nz:0,offset:2}]});
 near(normalized.planeCuts[0].nx,1,'Plane normal is normalized');
 near(normalized.planeCuts[0].offset,.5,'Offset is normalized with the plane normal');
}
{
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 for(const id of ['autoCutPanel','btnAutoTrim','btnResetAutoTrim','glbCutPanel',
  'glbCutAngle','glbCutOffset','glbCutSide','btnApplyGlbCut','btnResetGlbCut'])
  assert(html.includes('id="'+id+'"'),'Missing button '+id);
 assert(html.indexOf('js/edge-auto-trim.js')<html.indexOf('js/clean-app.js'),'Engine loads before app');
 for(const text of ['EdgeAutoTrim.resolve','applyAutomaticTrim(reset=false)',
  'applyImportedCut(reset=false)','planeCuts:this.importedCuts','autoEdgeCuts:FloorClip.normalizeCuts'])
  assert(app.includes(text),'Missing persisted editor wiring: '+text);
}
console.log('Auto wall-edge floor trimming + imported angled GLB clipping tests OK');
