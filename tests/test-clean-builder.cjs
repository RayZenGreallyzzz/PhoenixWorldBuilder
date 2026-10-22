const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(dir,'js/three.min.js'));
const G=require(path.join(dir,'js/clean-geometry.js'));
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const close=(a,b,label,tol=.02)=>assert(Math.abs(a-b)<tol,label+': '+a+' instead of '+b);
function entry(id,kind,pos=[0,0,0],meta={}){
 const root=G.create(kind,meta.thickness||.22);
 root.position.fromArray(pos);root.updateMatrixWorld(true);
 return {id,kind,category:kind==='roof'?'roof':'wall',root,storey:0,
  thickness:meta.thickness||.22,scale:1,axes:{x:1,y:1,z:1}};
}
function matchAt(target,startIndex,kind,sourceIndex=0){
 const input=entry(-1,kind);
 const t=G.worldSockets(target)[startIndex],s=G.sockets(kind,input.root)[sourceIndex];
 const theta=p=>Math.atan2(-p.z,p.x);
 const yaw=theta(t.out.clone().negate())-theta(s.out);
 const rotated=G.rotate(s.point,yaw);
 const pos=t.point.clone().sub(rotated);
 const local=G.localBounds(input.root).getCenter(V());
 const cursor=G.rotate(local,yaw).add(pos);
 const solved=G.solveSnap(input,[target],cursor,0);
 assert(solved,'Magnet must find '+target.kind+' -> '+kind);
 assert.equal(solved.target,target.id);
 const placedPoint=G.rotate(s.point,solved.rotation).add(solved.position);
 close(placedPoint.x,t.point.x,'Physical X endpoints join');
 close(placedPoint.z,t.point.z,'Physical Z endpoints join');
 const actualOut=G.rotate(s.out,solved.rotation);
 close(actualOut.x,-t.out.x,'Endpoint tangents oppose X');
 close(actualOut.z,-t.out.z,'Endpoint tangents oppose Z');
 return solved;
}
const wall=entry(1,'wall');
for(const kind of ['wall','corner','arc90','arc180']){
 const root=G.create(kind),sockets=G.sockets(kind,root);
 assert.equal(sockets.length,2,'Exactly two real endpoints for '+kind);
 for(const s of sockets)close(s.out.length(),1,kind+' socket unit direction');
 matchAt(wall,1,kind);
}
for(const kind of ['arc90','arc180']){
 const source=entry(20,kind,[5,0,5]),socket=G.worldSockets(source)[1];
 matchAt(source,1,'wall',0);
 matchAt(source,1,'arc90',0);
 matchAt(source,1,'arc180',0);
 close(socket.out.length(),1,'Curved world socket normalized');
}
const arc=G.create('arc90',.3);
const b=G.localBounds(arc);
close(b.min.x,0-.15,'Arc shape inner boundary roughly x near zero',.16);
// User-visible centimetre thickness must stay physically constant when
// overall/axis scale changes, not silently inherit X/Z dimension multipliers.
{
 const scaledWall=G.create('wall',.28,2.5,1.4);
 scaledWall.scale.set(2.5,1,1.4);
 const size=G.bbox(scaledWall).getSize(V());
 close(size.x,5,'Independently wider wall is five metres long');
 close(size.z,.28,'World thickness remains exactly 28 cm');
 const corner=G.create('corner',.34,1.3,2.2);
 corner.scale.set(1.3,1,2.2);
 const first=G.bbox(corner.children[0]).getSize(V()),
  second=G.bbox(corner.children[1]).getSize(V());
 close(first.z,.34,'L-corner X arm physically 34 cm thick');
 close(second.x,.34,'L-corner Z arm physically 34 cm thick');
 const ellipse=G.create('arc90',.26,2.2,.65);
 ellipse.scale.set(2.2,1,.65);
 const attr=ellipse.children[0].geometry.attributes.position;
 const atStart=[],atEnd=[];
 for(let i=0;i<attr.count;i++){
  const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i);
  if(Math.abs(y)>.00001)continue;
  if(Math.abs(z)<.000001)atStart.push(x);
  if(Math.abs(x)<.05)atEnd.push(z);
 }
 close((Math.max(...atStart)-Math.min(...atStart))*2.2,.26,
  'Quarter-circle start cap stays 26 cm despite X scale');
 assert(atEnd.length>0,'Quarter-circle end cap has geometry');
}
const feet=G.sockets('arc90',arc);
close(feet[0].point.distanceTo(V(2,0,0)),0,'Arc actual start centerline');
close(feet[1].point.distanceTo(V(0,0,2)),0,'Arc actual end centerline');
const roof=entry(2,'roof',[3,2.6,0]);
const next=entry(-2,'roof',[0,0,0]);
const rear=G.worldSockets(roof)[1],front=G.sockets('roof',next.root)[0];
const pos=rear.point.clone().sub(front.point);
const center=G.localBounds(next.root).getCenter(V()).add(pos);
const glued=G.solveSnap(next,[roof],center,0);
assert(glued&&glued.target===roof.id,'Roof parts connect lengthwise at real ends');
close(glued.position.z,roof.root.position.z+1.65,'Roof longitudinal sections do not overlap');
const unknown=new THREE.Group();
unknown.add(new THREE.Mesh(new THREE.BoxGeometry(2,2.6,2),new THREE.MeshBasicMaterial()));
assert.equal(G.sockets('glb:unidentified',unknown,null,'wall').length,0,
 'No fictional AABB corner joins on unrecognized imported GLB');
// Real imported GLB quarter and semicircle strips: infer sockets from actual
// concentric cross-sections, not the diagonal bounding box.
for(const half of [Math.PI/4,Math.PI/2]){
 const radius=2.5,vertices=[];
 for(let i=0;i<=16;i++){
  const a=-half+(2*half*i/16);
  for(const r of [radius-.11,radius+.11]){
   vertices.push(r*Math.sin(a),0,r*Math.cos(a));
   vertices.push(r*Math.sin(a),2.6,r*Math.cos(a));
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const imported=new THREE.Group();imported.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
 const ends=G.sockets('glb:custom-curve',imported,null,'wall');
 assert.equal(ends.length,2,'Imported arc GLB must yield actual end sockets at '+half);
 const editable={id:900,kind:'glb:custom-curve',category:'wall',root:imported,storey:0};
 const physical=G.thicknessInfo(editable);
 assert(physical&&Math.abs(physical.meters-.22)<.02,'Imported curved wall source thickness detected');
 const beforeEnds=G.sockets('glb:custom-curve',imported,null,'wall');
 assert(G.resizeImportedThickness(editable,.35),'Imported curved wall thickens independently');
 const resized=G.thicknessInfo(editable);
 close(resized.meters,.35,'Imported curved wall target thickness measured');
 const afterEnds=G.sockets('glb:custom-curve',imported,null,'wall');
 for(let j=0;j<2;j++){
  close(afterEnds[j].point.x,beforeEnds[j].point.x,'Arc world end X unchanged');
  close(afterEnds[j].point.z,beforeEnds[j].point.z,'Arc world end Z unchanged');
 }
 assert(G.resizeImportedThickness(editable,.20),'Imported wall can also be made thinner');
 for(let i=0;i<2;i++)close(ends[i].out.length(),1,'Imported socket tangent normalized');
 for(const end of ends)
  close(Math.hypot(end.point.x,end.point.z),radius,'Imported arc ends on original radius');
 const onGround=entry(100,'wall');
 imported.position.set(4,0,0);imported.updateMatrixWorld(true);
 const shape={id:101,kind:'glb:custom-curve',category:'wall',root:imported,storey:0};
 const targets=G.worldSockets(shape);
 close(targets[0].point.y,0,'Imported arc socket lies on base');
 assert(targets.every(s=>s.out.lengthSq()>.99),'Imported arc orientations are usable');
}
{
 const cornerGLB=new THREE.Group();
 const first=new THREE.Mesh(new THREE.BoxGeometry(2,2.6,.22),new THREE.MeshBasicMaterial());
 first.position.set(-.9,1.3,0);
 const second=new THREE.Mesh(new THREE.BoxGeometry(.22,2.6,2),new THREE.MeshBasicMaterial());
 second.position.set(0,1.3,-.9);
 cornerGLB.add(first,second);
 const caps=G.sockets('glb:custom-corner',cornerGLB,null,'wall');
 assert.equal(caps.length,2,'Imported L corner with two arms yields correct end caps');
 close(caps[0].point.x,-1.9,'L-corner X cap');
 close(caps[1].point.z,-1.9,'L-corner Z cap');
 const cornerData={id:902,kind:'glb:custom-corner',category:'wall',root:cornerGLB,storey:0};
 assert(G.thicknessInfo(cornerData),'Imported separate-arm 90° corner supports physical thickness');
 assert(G.resizeImportedThickness(cornerData,.38),'Adjust both perpendicular corner panel widths');
 close(G.thicknessInfo(cornerData).meters,.38,'Measured thickness of both corner arms');
 const grown=G.sockets('glb:custom-corner',cornerGLB,null,'wall');
 close(grown[0].point.x,caps[0].point.x,'Corner long arm endpoint does not move');
 close(grown[1].point.z,caps[1].point.z,'Corner second arm endpoint does not move');
}
const ui=fs.readFileSync(path.join(dir,'index.html'),'utf8');
for(const id of ['modeBuild','modeCharacter','modeDrone','magnet','sizeX','sizeY','sizeZ',
 'scaleAll','thickness','posX','posY','posZ','socketAX','socketBZ','btnSave','btnLoad'])
 assert(ui.includes('id="'+id+'"'),'Clean UI has working control '+id);
assert(!ui.includes('js/app.js'),'Old overloaded app is not loaded in clean shell');
assert(!ui.includes('js/world.js'),'Legacy editor engine is not executed in clean shell');
assert(ui.includes('js/clean-app.js'),'New runtime is the only editor implementation');
const app=fs.readFileSync(path.join(dir,'js/clean-app.js'),'utf8');
assert(app.includes('setDefaultAvatar()')&&app.includes('importAvatar(file)'),'Character mode supported');
assert(app.includes('this.controls.enablePan=mode===')&&app.includes('setMode(mode)'),
 'Drone camera and orbit mode supported');
assert(app.includes("saveCleanProject(json)"),'Clean save must be separate from legacy files');
assert(!/autoSave|setInterval\(.*save/i.test(app),'Clean builder never autosaves');
const java=fs.readFileSync(path.join(dir,'../java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
assert(java.includes('phoenix_clean_scene_v2.json'));
assert(java.includes('saveCleanProject(')&&java.includes('loadCleanProject()'));
console.log('Phoenix Builder clean v2: precise straight/L/90°/180° sockets, roof sections, compact UI, native save OK');
