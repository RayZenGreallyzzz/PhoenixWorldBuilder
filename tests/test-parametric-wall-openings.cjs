const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
global.ParametricWall=require(path.join(dir,'parametric-wall.js'));
global.ModuleTopology=require(path.join(dir,'module-topology.js'));
global.BuildSnap=require(path.join(dir,'build-snap.js'));
global.BuildCore=require(path.join(dir,'build-core.js'));
global.BuildJoin=require(path.join(dir,'build-join.js'));
global.BuildCurves=require(path.join(dir,'build-curves.js'));
global.BuildPlacementValidator=require(path.join(dir,'build-placement.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const near=(a,b,label)=>assert(Math.abs(a-b)<.002,label+': '+a+' vs '+b);
const raycast=(root,x,y)=>{
 root.updateWorldMatrix(true,true);
 const ray=new THREE.Raycaster(new THREE.Vector3(x,y,2),
  new THREE.Vector3(0,0,-1),0,5);
 return ray.intersectObject(root,true);
};
for(const [kind,openY,solidY] of [['pwindow',1.4,.4],['pdoor',1,2.4]]){
 const root=ParametricWall.build(kind);
 assert(root.userData.pwbParametricWall,'Parametric flag');
 near(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x,2,'Width '+kind);
 assert.equal(raycast(root,0,openY).length,0,kind+' has real through opening');
 assert(raycast(root,.87,openY).length>0,'Solid side jamb '+kind);
 assert(raycast(root,0,solidY).length>0,'Solid wall above/below '+kind);
 assert.equal(root.userData.pwbModuleSockets.length,2,'Structural wall sockets');
}
const multi=ParametricWall.build('pwall',{length:6,height:3,thickness:.3,openings:[
 {type:'door',width:1.2,height:2.2,offset:-1.5,sill:0},
 {type:'window',width:1.4,height:1.2,offset:1.5,sill:1}
]});
assert.equal(raycast(multi,-1.5,1.2).length,0,'Real door open through');
assert.equal(raycast(multi,1.5,1.5).length,0,'Real window open through');
assert(raycast(multi,0,1.5).length>0,'Centre wall still solid');
const bounds=new THREE.Box3().setFromObject(multi);
near(bounds.max.x-bounds.min.x,6,'6m length');
near(bounds.max.y-bounds.min.y,3,'3m height');
near(bounds.max.z-bounds.min.z,.3,'0.3m thickness');
const normalized=ParametricWall.normalize({length:1,height:2.6,thickness:-1,openings:[
 {type:'door',width:50,height:50,sill:1,offset:100}]});
assert(normalized.thickness>=.06&&normalized.openings[0].width<=1,
 'Bad numeric inputs are bounded');
assert.equal(normalized.openings[0].sill,0,'Door always begins at floor');
function world(){
 const w=Object.create(WorldBuilder.prototype);
 Object.assign(w,{scene:new THREE.Scene(),objects:[],assetCache:new Map(),textures:new Map(),
  nextId:1,ghost:null,placementOutline:null,selected:null,moveTarget:null,mode:'build',
  placement:null,placementCategory:null,placementRotation:0,placementScale:1,
  placementAxes:{x:1,y:1,z:1},smartSnap:true,joinMode:'auto',autoThickness:false,
  edgeShift:0,placementLift:0,cornerOffsetX:0,cornerOffsetZ:0,storeyHeight:2.6,
  floorLevel:0,snap:2,currentPaint:'#fff',placementSurfacePaint:{},lastSnapResult:null});
 w.heightAt=()=>0;w.remember=()=>{};w.onChanged=()=>{};w.onSelected=()=>{};
 w.select=e=>w.selected=e;w.updateGameGhost=()=>{};
 w.highlight={setFromObject(){},visible:false};
 w.categoryForKind=kind=>ParametricWall.kinds.has(kind)?'wall':'prop';
 return w;
}
const w=world();
w.setPlacement('pwindow','wall');
assert.equal(w.placementParamWall.openings[0].type,'window');
assert.equal(raycast(w.ghost,0,1.4).length,0,'Preview already has hole');
assert(w.updateParametricWall({length:5,height:3.4,thickness:.3,openings:[
 {type:'window',width:1.5,height:1.7,sill:1,offset:0}
]}));
const preview=ParametricWall.normalize(w.placementParamWall,'pwindow');
near(preview.length,5,'Changed length');
near(new THREE.Box3().setFromObject(w.ghost).getSize(new THREE.Vector3()).x,5,
 'Preview geometry immediately reflects edited length');
const placed=w.instantiate('pwindow',{id:10,pos:[4,0,-7],rot:33,scale:1,
 category:'wall',paramWall:preview,storey:0});
assert(placed.data.moduleTopology.role==='wall');
assert.equal(placed.data.paramWall.openings.length,1);
assert(placed.mesh.userData.pwbParametricWall);
const saved=JSON.parse(JSON.stringify(placed.data));
const restored=w.instantiate('pwindow',{...saved,id:11,pos:[7,0,-7]});
assert.equal(restored.data.paramWall.openings[0].width,1.5,'Opening is serializable');
assert.equal(raycast(ParametricWall.build('pwindow',restored.data.paramWall),0,1.4).length,0,
 'Restored window remains physically open');
const oldId=placed.data.id,oldPosition=placed.mesh.position.clone();
assert(w.updateParametricWall({length:5,height:3.4,thickness:.3,openings:[]},placed));
assert.equal(placed.data.id,oldId,'Editable wall keeps its object ID');
assert(placed.mesh.position.distanceTo(oldPosition)<.00001,'Editable wall keeps position');
assert(raycast(ParametricWall.build('pwall',placed.data.paramWall),0,1.4).length>0,
 'Clearing openings makes solid wall');
assert.equal(placed.data.moduleTopology.sizeMeters[0],5,
 'Structural dimensions updated when wall rebuilt');
assert(!!placed.data.moduleTopology.sockets.L,'New wall has structural wall socket');
const html=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
assert(html.indexOf('js/parametric-wall.js')<html.indexOf('js/world.js'),
 'Procedural geometry code loaded before WorldBuilder');
assert(app.includes("['pwindow','Стена • с оконным проёмом','wall']"),
 'Window variant appears as real built-in');
assert(app.includes("$('btnParamWallApply').onclick"),
 'Accessible editor controls wired');
console.log('Parametric walls: true door/window holes, multiple openings, metric edits, wall snaps and save/restore OK');
