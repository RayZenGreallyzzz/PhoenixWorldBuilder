const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.ArchitectureKit=require(path.join(base,'js/architecture-kit.js'));
const G=require(path.join(base,'js/clean-geometry.js'));
const Wall=require(path.join(base,'js/wall-openings.js'));
const kit=global.ArchitectureKit;
const ids=kit.catalog.map(m=>m.kind);
assert.equal(ids.length,17,'The lightweight bundle has 5 doors + 4 frames + 8 roofs');
assert.equal(new Set(ids).size,ids.length,'Architecture ids are unique');
const roofs=ids.filter(id=>id.startsWith('roof'));
const doors=ids.filter(id=>id.startsWith('door'));
const frames=ids.filter(id=>id.startsWith('frame'));
assert.equal(roofs.length,8);
assert.equal(doors.length,5);
assert.equal(frames.length,4);
let total=0;
for(const kind of ids){
 assert(G.isBuiltIn(kind),'Built-in catalog must see '+kind);
 const root=G.create(kind);
 assert(root&&root.name===kind&&root.children.length>0,'Prefab is not empty '+kind);
 root.updateWorldMatrix(true,true);
 const bounds=G.localBounds(root),sz=bounds.getSize(new THREE.Vector3());
 assert(!bounds.isEmpty()&&[sz.x,sz.y,sz.z].every(Number.isFinite),'Finite geometry '+kind);
 assert(sz.x>.35&&sz.y>.4,'Physical-size prefab '+kind);
 let triangles=0,meshes=0;
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  meshes++;
  const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv;
  assert(p&&p.count>0,'Mesh has nonempty geometry '+kind);
  assert(uv&&uv.count===p.count,'Prefab retains per-face UVs '+kind);
  triangles+=(g.index?g.index.count:p.count)/3;
  for(let i=0;i<p.count;i++){
   assert([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite),
    'No invalid vertices '+kind);
  }
 });
 assert(meshes<=80,'Module mesh budget is high '+kind+' '+meshes);
 assert(triangles<2200,'Excessive triangles in lightweight prefab '+kind+' '+triangles);
 total+=triangles;
 const again=G.create(kind);
 assert.notStrictEqual(root,again,'Distinct prefab instances '+kind);
 assert.notStrictEqual(root.children[0],again.children[0],
  'Independent geometry source for edits '+kind);
 if(kind.startsWith('roof')){
  assert.equal(kit.catalog.find(x=>x.kind===kind).category,'roof','All roofs snap to walls');
  assert(bounds.min.y>=-.2&&bounds.min.y<=.02,'Roof eaves at y=0 '+kind);
  assert(sz.x>=3.5&&sz.z>=3,'Useful physical roof footprint '+kind);
 }
 if(kind.startsWith('frame')){
  assert(!root.children.some(c=>c.name==='door:leaf'),'Frames have true empty centre');
 }
 if(kind.startsWith('door')){
  const pivots=[];
  root.traverse(m=>{if(m.name.startsWith('door:pivot'))pivots.push(m)});
  assert(pivots.length=== (kind==='doorDouble'?2:1),
   'Hinged model '+kind+' has correct number of movable leaves');
  assert(root.getObjectByName('door:hinge'),'Physical hinges on '+kind);
  assert(kit.setDoorAngle(root,50),'Ready-made door hinges animate');
  assert(pivots.some(p=>Math.abs(p.rotation.y)>.5),
   'Ready-made door moves around its own hinges');
 }
}
assert(total<9500,'Architecture library must stay small on Android');
const pitchCount={roofGable2:2,roofHip3:3,roofHip4:4,roofPyramid4:4};
for(const [kind,count] of Object.entries(pitchCount)){
 const module=G.create(kind);
 assert.equal(module.children.filter(c=>c.name==='roof:facet').length,count,
  'Correct number of roof slopes for '+kind);
}
{
 const one=G.create('roofGable2'),two=G.create('roofGable2');
 assert.notStrictEqual(one.children[0].material,two.children[0].material,
  'Roof texture changes should not corrupt other installations');
}
for(const [style,frameStyle] of [['round','round'],['gothic','gothic'],['rune','portal']]){
 const opening={id:'styled:'+style,group:'styled',type:'door',x:0,y:0,
  w:.95,h:2.15,hinge:'left',angle:20,doorStyle:style,frameStyle};
 const wall=G.create('wall');
 const result=Wall.render(wall,'wall',[opening],{thickness:.22,axes:{x:1,y:1,z:1}});
 assert(result.ok,'Cannot install '+style+' door in wall');
 const saved=Wall.normalize([opening])[0];
 assert.equal(saved.doorStyle,style,'Door style survives project serialization');
 assert.equal(saved.frameStyle,frameStyle,'Frame style survives project serialization');
 const structure=wall.getObjectByName('structure:wall');
 assert(structure&&!wall.getObjectByName('structure:arched-lintel'),
  'Rounded/gothic arch must be carved into one structural wall mesh, without overlay');
 const material=structure.material,oldSide=material.side;
 material.side=THREE.DoubleSide;wall.updateMatrixWorld(true,true);
 const rayAt=(x,y)=>new THREE.Raycaster(
  new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1),0,2)
  .intersectObject(structure,false).length;
 assert.equal(rayAt(0,2.02),0,'Arch remains open at its curved peak');
 assert(rayAt(.42,2.02)>0,'Solid masonry actually fills arch shoulders');
 material.side=oldSide;
 assert(wall.getObjectByName('frame:curved-arch'),'Arched frame follows door opening');
 assert(Wall.setDoorAngle(wall,opening.id,45),'Styled door stays hinged');
}
{
 const door={id:'double-door',group:'double',type:'door',x:0,y:0,
  w:1.55,h:2.1,hinge:'left',angle:0,doorStyle:'double',frameStyle:'classic'};
 const wall=G.create('wall');
 assert(Wall.render(wall,'wall',[door]).ok,'Double door can be cut into a real wall');
 const pivots=[];wall.traverse(o=>{
  if(o.name.startsWith('phoenixDoorPivot:double-door:'))pivots.push(o);
 });
 assert.equal(pivots.length,2,'One double door has two independent hinge pivots');
 assert(Wall.setDoorAngle(wall,door.id,75),'One swing control opens both door leaves');
 assert(pivots.some(p=>p.rotation.y>0)&&pivots.some(p=>p.rotation.y<0),
  'Double door pivots rotate in opposite hinge directions');
}
{
 const roundWindow={id:'round-window',group:'window',type:'window',x:0,y:.8,
  w:1.1,h:1.0,frameStyle:'round'};
 const wall=G.create('arc180');
 assert(Wall.render(wall,'arc180',[roundWindow]).ok,'Round window in semicircular wall');
 assert(wall.getObjectByName('structure:arched-lintel'),
  'Curved wall has 3D arch masonry over window');
 assert(wall.getObjectByName('window:glass'),'Curved glazing inserted');
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),
 app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
assert(html.indexOf('js/architecture-kit.js')<html.indexOf('js/clean-geometry.js'),
 'Procedural architecture library must load before core geometry');
for(const id of ['openingDoorStyle','openingFrameStyle','btnChangeOpeningStyle'])
 assert(html.includes('id="'+id+'"'),'Missing integrated door style UI '+id);
for(const str of ["this.restyleOpening()","doorStyle:$('openingDoorStyle').value",
 "frameStyle:$('openingFrameStyle').value","restyleOpening()"])
 assert(app.includes(str),'Prefab style is not connected to the editor: '+str);
console.log('17 light door/frame/roof models, 2-3-4 slopes, 3 arch styles, double hinges, save-ready modules OK');
