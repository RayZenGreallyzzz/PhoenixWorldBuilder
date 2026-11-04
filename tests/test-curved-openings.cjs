const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
global.SurfaceMaterials=require(path.join(base,'js/surface-materials.js'));
const Open=require(path.join(base,'js/wall-openings.js'));
const near=(a,b,label,eps=.025)=>assert(Math.abs(a-b)<=eps,label+': '+a+' vs '+b);
const create=(kind,list,settings={})=>{
 const root=CleanGeometry.create(kind);
 const result=Open.render(root,kind,list,{thickness:.22,axes:{x:1,y:1,z:1},...settings});
 assert(result.ok,kind+': '+result.reason);return root;
};
const open=(type='window',x=0,w=1)=>({id:'test:'+type,group:'test',type,x,w,
 y:type==='door'?0:.9,h:type==='door'?2.08:1.1,hinge:'left',angle:0});
const structure=root=>root.children.find(m=>m.name==='structure:wall');
function holeRay(root,kind,opening){
 const prof=Open.profile(kind);
 const s=prof.length/2+opening.x,point=prof.pos(s);
 const n=new THREE.Vector3(point.nx,0,point.nz).normalize();
 const from=new THREE.Vector3(point.x,opening.y+opening.h/2,point.z).addScaledVector(n,.5);
 const ray=new THREE.Raycaster(from,n.clone().negate(),0,.9);
 root.updateMatrixWorld(true);
 return ray.intersectObject(structure(root),false).length;
}
for(const kind of ['wall','corner','arc90','arc180']){
 const cut=open('window',0,.85),root=create(kind,[cut]);
 assert.equal(holeRay(root,kind,cut),0,'A real ray passes through the actual '+kind+' window hole');
 const pos=Open.profile(kind).pos(Open.profile(kind).length/2);
 const n=new THREE.Vector3(pos.nx,0,pos.nz).normalize();
 const ray=new THREE.Raycaster(new THREE.Vector3(pos.x,.16,pos.z)
  .addScaledVector(n,.5),n.clone().negate(),0,.9);
 assert(ray.intersectObject(structure(root),false).length>0,
  'Lower structural wall remains solid under '+kind+' window');
 assert(root.children.some(m=>m.name==='phoenixOpening:'+cut.id),
  'Curved glazing and frame are inserted');
 const door=open('door',0,.8);
 const withDoor=create(kind,[door]);
 assert.equal(holeRay(withDoor,kind,door),0,'Door opening cuts through '+kind+' structural wall');
 assert(Open.setDoorAngle(withDoor,door.id,68),'Door is attached to a real rotating hinge on '+kind);
 const pivot=withDoor.children.find(g=>g.name==='phoenixOpening:'+door.id)?.children
  .find(g=>g.name==='phoenixDoorPivot:'+door.id);
 assert(pivot&&Math.abs(pivot.rotation.y)>1,'Door leaf rotates around hinge');
 const g=structure(root).geometry;
 assert(g.attributes.position.count>0&&g.attributes.position.count===g.attributes.uv.count,
  'Wall triangles have UVs after the window hole');
}
{
 const a={id:1,kind:'wall',category:'wall',storey:0,root:CleanGeometry.create('wall'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 const b={id:2,kind:'wall',category:'wall',storey:0,root:CleanGeometry.create('wall'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 a.root.position.set(0,0,0);b.root.position.set(2,0,0);
 a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
 const plan=Open.splitAtJunction(a,[a,b],open('door',.8,.8));
 assert(plan.ok&&plan.joint&&plan.parts.length===2,
  'A door can span the physical seam of two neighboring straight walls');
 const [left,right]=plan.parts;
 near(left.opening.w,.6,'First wall keeps first part');
 near(right.opening.w,.2,'Second wall continues same aperture');
 const aRoot=create('wall',[left.opening]),bRoot=create('wall',[right.opening]);
 aRoot.position.copy(a.root.position);bRoot.position.copy(b.root.position);
 aRoot.updateMatrixWorld(true);bRoot.updateMatrixWorld(true);
 const rayA=new THREE.Raycaster(new THREE.Vector3(.95,1,1),new THREE.Vector3(0,0,-1),0,2);
 const rayB=new THREE.Raycaster(new THREE.Vector3(1.06,1,1),new THREE.Vector3(0,0,-1),0,2);
 assert.equal(rayA.intersectObject(structure(aRoot),false).length,0,'Main wall is truly pierced at seam');
 assert.equal(rayB.intersectObject(structure(bRoot),false).length,0,'Neighbor wall is truly pierced at seam');
 assert.equal(left.opening.group,right.opening.group,'Both halves share a saved opening group');
 const third={...b,id:3,root:CleanGeometry.create('wall')};
 third.root.position.set(1,0,-1);third.root.rotation.y=Math.PI/2;
 third.root.updateMatrixWorld(true);
 const choose=Open.splitAtJunction(a,[b,third],open('door',.8,.8),3);
 assert(choose.ok&&choose.parts[1].entry.id===3,
  'Builder can explicitly choose a second wall at a three-way junction');
 const missing=Open.splitAtJunction(a,[b,third],open('door',.8,.8),1000);
 assert.equal(missing.ok,false,'Unconnected neighbor cannot be selected');
}
{
 const a={id:4,kind:'wall',category:'wall',storey:0,root:CleanGeometry.create('wall'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 const arc={id:5,kind:'arc180',category:'wall',storey:0,root:CleanGeometry.create('arc180'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 a.root.position.set(0,0,0);
 // Straight wall endpoint X=1 connects to arc endpoint angle 0 at X=2
 arc.root.position.set(-1,0,0);
 a.root.updateMatrixWorld(true);arc.root.updateMatrixWorld(true);
 const plan=Open.splitAtJunction(a,[arc],open('window',.78,.75));
 assert(plan.ok&&plan.parts.length===2,'Window may cross a straight-to-curved joint');
 assert(plan.parts.some(x=>x.entry===arc),'Arc segment is cut together with straight wall');
}
{
 const sample=open('window',0,.85);
 assert.equal(Open.validate([sample,{...sample,id:'other'}],'arc180').ok,false,
  'Overlapping windows are rejected on curved walls');
 assert.equal(Open.validate([{...sample,y:2.4}],'arc90').ok,false,
  'Aperture taller than wall is rejected');
 const root=CleanGeometry.create('wall'),original=root.children[0];
 const invalid=Open.render(root,'wall',[{...sample,x:12}]);
 assert.equal(invalid.ok,false,'Bad cut does not delete the source wall');
 assert.strictEqual(root.children[0],original);
}
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8'),
 html=fs.readFileSync(path.join(base,'index.html'),'utf8');
for(const text of ['WallOpenings.splitAtJunction','commitOpenings(plan)','addOpening()',
 'removeOpening()','setDoorSwing()','openings:WallOpenings.normalize'])
 assert(app.includes(text),'App is missing curved/junction opening wiring '+text);
for(const id of ['btnAddOpening','btnRemoveOpening','openingSelect','openingWidth','openingHeight',
 'openingX','openingBottom','doorSwing'])assert(html.includes('id="'+id+'"'),'Missing opening UI '+id);
console.log('Curved windows, semicircular doors, corner voids, two-wall/arc seams, hinges, UV and restore UI OK');
