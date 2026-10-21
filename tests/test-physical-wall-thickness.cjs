const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
global.WallThickness=require(path.join(dir,'wall-thickness.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const close=(actual,expected,description)=>assert(Math.abs(actual-expected)<.035,
 description+': '+actual+' instead of '+expected);
const dims=mesh=>new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),nextId:1,
  ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'build',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},wallThicknessMeters:null,smartSnap:true,joinMode:'auto',
  autoThickness:true,cornerOffsetX:0,cornerOffsetZ:0,edgeShift:0,placementLift:0,
  floorLevel:0,storeyHeight:2.6,snap:2,currentPaint:'#ffffff',
  placementSurfacePaint:{},placementDecals:[],undo:[],lastSnapResult:null});
 w.heightAt=()=>0;w.onChanged=()=>{};w.onSelected=()=>{};w.onSnapChanged=()=>{};w.remember=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.player=new THREE.Group();w.player.position.set(0,.85,0);w.scene.add(w.player);
 w.categoryForKind=kind=>({wall:'wall',corner:'corner',roof:'roof',floor:'foundation'})[kind]||
  (kind.includes('полукругл')?'wall':'prop');
 const ground=new THREE.BufferGeometry();
 ground.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
 ground.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1],3));
 w.terrain={geometry:ground};
 return w;
}
{
 const w=world();
 w.setPlacement('wall','wall');
 const base=dims(w.ghost);
 close(base.x,2,'Straight wall original length');
 close(base.z,.22,'Straight wall native depth');
 assert(w.setWallThickness(.35),'Straight wall supports real thickness');
 const after=dims(w.ghost);
 close(after.x,2,'New thickness leaves wall length intact');
 close(after.y,2.6,'New thickness leaves height intact');
 close(after.z,.35,'Straight wall depth now exactly 35cm');
 const placed=w.placeAt(new THREE.Vector3(10,0,0));
 assert(placed,'Thicker wall can be installed');
 close(placed.data.wallThicknessMeters,.35,'Thickness saved in project object');
 close(dims(placed.mesh).z,.35,'Saved scene contains actual thickened geometry');
 // Original catalog geometry is immutable, and another plain wall remains 22cm.
 const ordinary=w.makeBuiltin('wall');
 close(dims(ordinary).z,.22,'Built-in original not modified by another wall');
 assert(!w.setWallThickness(1.2,placed),'Impossible unsafe thickness rejected');
 close(dims(placed.mesh).z,.35,'Rejected edit must leave geometry untouched');
 w.setWallThickness(.3,placed);
 close(dims(placed.mesh).z,.3,'Selected existing wall may be made thinner in place');
}
{
 const w=world();w.setPlacement('corner','corner');
 const before=BuildJoin.cornerArms(w.ghost,'corner','corner');
 assert.equal(before.length,2,'L corner should expose two separate arms');
 const ends=before.map(a=>a.tip.clone());
 assert(w.setWallThickness(.38),'Built-in corner supports physical 38cm cross-section');
 close(dims(w.ghost).y,2.6,'Corner height remains unchanged');
 const profiles=WallThickness.info(w.ghost,'corner','corner');
 assert(profiles&&profiles.type==='corner');
 const arms=BuildJoin.cornerArms(w.ghost,'corner','corner');
 for(let i=0;i<2;i++){
  close(arms[i].tip.x,ends[i].x,'Corner tip X remains in place');
  close(arms[i].tip.z,ends[i].z,'Corner tip Z remains in place');
 }
 const lengths=w.ghost.children.map(m=>new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()));
 close(lengths[0].x,2,'Horizontal arm length unchanged');
 close(lengths[0].z,.38,'Horizontal arm thickened only across Z');
 close(lengths[1].z,2,'Vertical arm length unchanged');
 close(lengths[1].x,.38,'Vertical arm thickened only across X');
 const saved=w.placeAt(new THREE.Vector3(12,0,0));
 assert(saved,'Thicker corner installed');
 assert(saved.data.wallThicknessMeters===.38);
 close(saved.mesh.children[1].geometry.boundingBox.max.x-
  saved.mesh.children[1].geometry.boundingBox.min.x,.38,'Thickness survives instantiate');
}
{
 const w=world(),id='glb:полукруглая_стена.glb';
 const geom=new THREE.BufferGeometry(),vertices=[];
 const radius=2.2,thick=.18,N=8;
 for(let i=0;i<=N;i++){
  const a=(-Math.PI/4+i/N*Math.PI/2);
  for(const r of [radius-thick/2,radius+thick/2]){
   vertices.push(r*Math.sin(a),0,r*Math.cos(a));
   vertices.push(r*Math.sin(a),2.6,r*Math.cos(a));
  }
 }
 geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const root=new THREE.Group();root.add(new THREE.Mesh(geom,new THREE.MeshStandardMaterial()));
 w.assetCache.set(id,root);w.setPlacement(id,'wall');
 const found=WallThickness.info(w.ghost,id,'wall');
 assert(found&&found.type==='arc','Consistent radius GLB arc recognized safely');
 close(found.meters,.18,'Detect source physical arc thickness');
 const original=w.ghost.children[0].geometry.attributes.position;
 const origMid={x:(original.getX(0)+original.getX(2))/2,
  z:(original.getZ(0)+original.getZ(2))/2};
 assert(w.setWallThickness(.28),'Arc wall can increase to 28cm without scaling radius');
 const newPos=w.ghost.children[0].geometry.attributes.position;
 close(newPos.getX(0)+newPos.getX(2),origMid.x*2,'Arc endpoint centre X preserved');
 close(newPos.getZ(0)+newPos.getZ(2),origMid.z*2,'Arc endpoint centre Z preserved');
 const r1=Math.hypot(newPos.getX(0),newPos.getZ(0));
 const r2=Math.hypot(newPos.getX(2),newPos.getZ(2));
 close((r1+r2)/2,radius,'Arc radius remains exactly 2.2m');
 close(Math.abs(r2-r1),.28,'Arc wall radial thickness is 28cm');
 close(newPos.getY(1),2.6,'Arc height unchanged');
 // Import source cannot be corrupted: a new uncropped GLB still has native width.
 close(WallThickness.info(root,id,'wall').meters,.18,'Imported GLB stays unchanged');
 const placed=w.placeAt(new THREE.Vector3(0,0,9));
 assert(placed&&placed.data.wallThicknessMeters===.28);
 const beforeCopy=newPos.getX(0);
 w.setWallThickness(.34,placed);
 assert.equal(placed.data.wallThicknessMeters,.34);
 close(newPos.getX(0),beforeCopy,'Editing placed wall must not corrupt ghost geometry');
}
{
 const w=world(),id='glb:corner_opaque.glb';
 const opaque=new THREE.Group();
 opaque.add(new THREE.Mesh(new THREE.BoxGeometry(2,2.6,2),new THREE.MeshStandardMaterial()));
 w.assetCache.set(id,opaque);w.setPlacement(id,'corner');
 const original=dims(w.ghost).clone();
 assert.equal(WallThickness.info(w.ghost,id,'corner'),null,'Unknown solid is not assumed to be an L');
 assert.equal(w.setWallThickness(.22),false,'Unknown geometry safely unchanged');
 assert.deepEqual(dims(w.ghost).toArray(),original.toArray());
}
{
 const w=world();
 const placed=w.instantiate('roof',{id:1,pos:[0,2.6,0],rot:0,scale:1,category:'roof',storey:0});
 w.setPlacement('roof','roof');
 const depth=dims(placed.mesh).z;
 const p=new THREE.Vector3(0,2.6,depth);
 const first=w.solvePlacement(p);
 assert.equal(first.roofSection,true,'Two matching roof parts join lengthwise');
 assert.equal(first.reference,1);
 close(first.position.z,depth,'Roof module placed at the back cap of first roof');
 close(first.position.y,2.6,'Roof sections align vertically, never stack');
 const built=w.placeAt(p);
 assert(built&&built.data.id!==placed.data.id,'Second section can be installed');
 const third=w.solvePlacement(new THREE.Vector3(0,2.6,depth*2));
 assert(third.roofSection&&third.reference===built.data.id,
  'Roof can be extended by a third longitudinal module');
 const different=world();
 different.instantiate('roof',{id:3,pos:[0,2.6,0],rot:0,scale:1,category:'roof',storey:0,
  dimensionScale:{x:1.5,y:1,z:1}});
 different.setPlacement('roof','roof');
 assert.equal(different.solvePlacement(p).roofSection,undefined,
  'Roof with mismatched widths must not force a false seam');
}
for(const id of ['wallThicknessEditor','wallThicknessGame']){
 const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
 assert(html.includes('id="'+id+'"'),'Centimetre thickness control present: '+id);
}
console.log('Physical wall thickness: straight, L-corner and circular arcs; safe GLB handling; modular roof end snapping OK');
