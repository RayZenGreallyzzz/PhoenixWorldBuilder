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
