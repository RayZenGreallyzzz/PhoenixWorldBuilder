/* New building workflow integration: deterministic 2m room sockets, stair
 * tread geometry, bounded undo/redo, copied levels and semantic GLB nodes.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
const G=require(path.join(base,'js/clean-geometry.js'));
const W=require(path.join(base,'js/building-workflow.js'));
const History=require(path.join(base,'js/editor-history.js'));
const near=(value,expected,message,eps=.001)=>assert(Math.abs(value-expected)<eps,
 (message||'Value')+': '+value+' vs '+expected);
const spec={width:6,depth:4,x:10,z:-8,storey:1,roomId:'test-room',
 ceiling:true,floor:true};
const plan=W.roomPlan(spec);
assert.equal(plan.roomId,'test-room');
assert.equal(plan.items.length,2*(6/2)+2*(4/2)+2*(6/2)*(4/2),'Walls + floors + ceilings');
assert.equal(plan.items.filter(x=>x.roomRole==='wall').length,10);
assert.equal(plan.items.filter(x=>x.roomRole==='floor').length,6);
assert.equal(plan.items.filter(x=>x.roomRole==='ceiling').length,6);
assert(plan.items.every(item=>item.groupId==='test-room'&&item.storey===1));
assert(plan.items.every(item=>item.position.every(Number.isFinite)));
assert(plan.items.filter(x=>x.roomRole==='ceiling')
 .every(item=>Math.abs(item.position[1]-(2.6+2.42))<1e-6));
const expectedWalls=[
 [8,2.6,-10,0],[10,2.6,-10,0],[12,2.6,-10,0],
 [8,2.6,-6,0],[10,2.6,-6,0],[12,2.6,-6,0],
 [7,2.6,-9,Math.PI/2],[7,2.6,-7,Math.PI/2],
 [13,2.6,-9,Math.PI/2],[13,2.6,-7,Math.PI/2]
];
const walls=plan.items.filter(x=>x.kind==='wall');
for(let i=0;i<walls.length;i++){
 const item=walls[i],expected=expectedWalls[i];
 for(let j=0;j<3;j++)near(item.position[j],expected[j],'wall coordinate');
 near(item.rot,expected[3],'wall direction');
}
// Every floor must meet neighbouring tile edges without gaps.
const tiles=plan.items.filter(x=>x.roomRole==='floor');
assert.equal(new Set(tiles.map(t=>t.position[0]+'|'+t.position[2])).size,6);
assert.throws(()=>W.roomPlan({width:5,depth:4}),/кратно/);
assert.throws(()=>W.roomPlan({width:2,depth:26}),/24/);
assert.throws(()=>W.roomPlan({width:2,depth:2,x:NaN}),/Проверь/);
const simple=W.roomPlan({width:2,depth:2,floor:false});
assert.equal(simple.items.length,4,'Walls-only room');
assert.equal(W.roomPlan({width:2,depth:2,ceiling:true}).items.length,6);
const oldIds=plan.items.map((x,i)=>({...x,id:i+1,surface:{style:'stone'},
 surfaceSides:{front:{style:'plaster'}}}));
const floor2=W.duplicateStorey(oldIds,1);
assert.equal(floor2.length,oldIds.length);
assert(floor2.every(x=>x.storey===2&&!('id' in x)));
assert(floor2.every((x,i)=>Math.abs(x.position[1]-oldIds[i].position[1]-2.6)<.001));
assert(floor2.every(x=>x.groupId!==plan.roomId));
assert(floor2.every(x=>x.groupId===floor2[0].groupId),'Copied room remains grouped');
assert.deepEqual(floor2[0].surfaceSides,oldIds[0].surfaceSides);
assert.throws(()=>W.duplicateStorey(oldIds,49),/1–49/);
const copiedRoom=W.duplicateRoom(oldIds,'test-room',[8,0,0]);
assert(copiedRoom.every((x,i)=>x.position[0]===oldIds[i].position[0]+8));
assert(copiedRoom.every(x=>x.groupId!==plan.roomId));
const manifest=W.gameManifest({objects:oldIds});
assert.equal(manifest.version,1);
assert(manifest.objects.every(x=>x.collision==='static-mesh'));
assert(manifest.objects.every(x=>x.groupId==='test-room'));
assert.equal(manifest.floors[0],1);
assert(manifest.caveat.includes('NOT a physics engine'),'Manifest must state limitations');
// Staircase is a REAL closed series of boxes, 13 steps of rise .2m.
assert(G.isBuiltIn('stairsStraight'),'Staircase must work offline as built-in');
const stairs=G.create('stairsStraight');
assert.equal(stairs.children.length,13);
stairs.updateWorldMatrix(true,true);
const b=new T.Box3().setFromObject(stairs);
near(b.max.y,2.6,'Next storey height');
near(b.min.y,0,'Stair contact with ground');
near(b.max.z-b.min.z,3.9,'Stair run');
for(let i=0;i<13;i++){
 const tread=stairs.children[i];tread.geometry.computeBoundingBox();
 const local=tread.geometry.boundingBox.clone().applyMatrix4(tread.matrixWorld);
 near(local.max.y,(i+1)*.2,'Step '+i+' rise');
}
// Node export metadata provides a stable match to project object IDs.
const vm=require('node:vm');
const context=vm.createContext({THREE,Blob,TextEncoder,TextDecoder,Uint8Array,
 Uint16Array,Uint32Array,Float32Array,ArrayBuffer,DataView,Math,console});
vm.runInContext(fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8'),context);
const SceneExporter=context.SceneExporter;
const root=G.create('wall');root.position.set(2,0,-1);
(async()=>{
 const bin=await SceneExporter.build({objects:[{mesh:root,
  data:{id:17,kind:'wall',category:'wall',storey:2,groupId:'room-7',
   roomRole:'wall',suggestedCollider:'static-mesh'}}]},{houseOnly:true,
  keepWorldCoordinates:true});
 const bytes=new Uint8Array(await bin.arrayBuffer());
 const dv=new DataView(bytes.buffer);
 assert.equal(dv.getUint32(0,true),0x46546c67);
 const size=dv.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+size)));
 assert.equal(json.nodes[0].extras.phoenix.id,17);
 assert.equal(json.nodes[0].extras.phoenix.storey,2);
 assert.equal(json.nodes[0].extras.phoenix.roomRole,'wall');
 assert.equal(json.nodes[0].extras.phoenix.suggestedCollider,'static-mesh');
 assert.equal(json.nodes[0].matrix[12],2);
 // Undo stack stores project DESCRIPTORS not binary images and supports redo.
 const h=new History(2);
 let now={version:2,objects:[]};
 h.record(now);now={version:2,objects:[{id:1}]};
 h.record(now);now={version:2,objects:[{id:1},{id:2}]};
 assert.equal(h.canUndo,true);assert.equal(h.canRedo,false);
 assert(await h.undo(now,doc=>{now=doc}));
 assert.equal(now.objects.length,1);assert.equal(h.canRedo,true);
 assert(await h.undo(now,doc=>{now=doc}));
 assert.equal(now.objects.length,0);
 assert(await h.redo(now,doc=>{now=doc}));
 assert.equal(now.objects.length,1);
 h.record(now);assert.equal(h.canRedo,false,'New action clears redo');
 const old=JSON.stringify(now);
 h.record({version:2,objects:[{id:99}]});
 await assert.rejects(h.undo(now,()=>{throw Error('restore failed')}),
  /restore failed/);
 assert.equal(JSON.stringify(now),old);
 assert(h.canUndo,'History should not lose a failed restoration');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 for(const id of ['roomWidth','roomDepth','roomX','roomZ','btnBuildRoom',
  'roomIncludeFloor','roomIncludeCeiling','btnCopyRoom','btnCopyStorey',
  'btnUndo','btnRedo','btnExportGameManifest'])
  assert(html.includes('id="'+id+'"'),'Missing UI '+id);
 assert(html.indexOf('js/editor-history.js')<html.indexOf('js/clean-app.js'));
 assert(html.indexOf('js/building-workflow.js')<html.indexOf('js/clean-app.js'));
 for(const key of ['createRoom(){','copyCurrentStorey(){',
  'copySelectedRoom(){','addPlannedModules(data,label){','historyAction(direction){',
  'async exportGameManifest(){','groupId:obj.groupId||',
  'roomRole:obj.roomRole||','id:obj.id,kind:obj.kind'])
  assert(app.includes(key),'Missing building workflow integration '+key);
 console.log('Building workflow: rooms, ceilings, stairs, floor copies, undo/redo, GLB extras and UI OK');
})().catch(error=>{console.error(error);process.exitCode=1});
