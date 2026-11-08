/* A styled ARCH MUST BE A REAL THROUGH-HOLE in the wall mesh,
 * not a rectangular hole covered by a decorative cap. Regression based
 * on the user's Android screenshots: round prefab + empty door passage.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const T=global.THREE,W=require(path.join(base,'js/wall-openings.js'));
const make=(kind='wall',cuts=[])=>{
 const root=CleanGeometry.create(kind);
 const r=W.render(root,kind,cuts,{thickness:.22,axes:{x:1,y:1,z:1}});
 assert(r.ok,kind+' failed: '+r.reason);
 root.updateMatrixWorld(true,true);
 return root;
};
const define=(shape,type='passage')=>({
 id:'arch1',group:'arch1',type,x:0,y:0,w:1,h:2.2,
 doorStyle:'round',frameStyle:'round',shape,hinge:'left',angle:0
});
const hit=(root,x,y,z=0)=>{
 const wall=root.getObjectByName('structure:wall');
 assert(wall,'No structural geometry');
 const mat=wall.material,old=mat.side;mat.side=T.DoubleSide;
 const ray=new T.Raycaster(new T.Vector3(x,y,z+1.5),new T.Vector3(0,0,-1),0,3);
 const count=ray.intersectObject(wall,false).length;mat.side=old;
 return count;
};
{
 const original=make('wall',[define('rectangle')]);
 assert.equal(hit(original,0,2.05),0,'Flat door has rectangular void as before');
 assert.equal(hit(original,.46,2.05),0,'Flat opening reaches full height at shoulders');
}
for(const shape of ['round','gothic']){
 const root=make('wall',[define(shape,'passage')]);
 assert.equal(root.children.filter(x=>x.name.startsWith('phoenixOpening')).length,0,
  'Empty arched passage has no hidden frame or fake door');
 assert.equal(hit(root,0,1.2),0,'Walk through the open '+shape+' arch at human height');
 assert.equal(hit(root,0,2.05),0,'Arched hole reaches its full height at centre');
 assert(hit(root,.43,2.05)>0,'Solid masonry must fill the curved '+shape+' shoulder');
 assert(hit(root,0,2.35)>0,'Lintel remains solid above the shaped opening');
 assert(hit(root,.57,1.5)>0,'Wall remains solid outside the doorway');
 const wall=root.getObjectByName('structure:wall');
 assert.equal(wall.geometry.attributes.position.count,wall.geometry.attributes.uv.count);
 assert(!root.getObjectByName('structure:arched-lintel'),
  'No separately overlaid fake cap: arch must be part of the structural wall mesh');
 assert.equal(wall.geometry.attributes.position.count%3,0);
 // A real arched door leaf must fit the very same hole.
 const framed=make('wall',[define(shape,'door')]);
 assert(framed.getObjectByName('door:leaf'),'Door leaf remains real');
 assert(framed.getObjectByName('frame:curved-arch'),'Arch decoration follows real cut');
 assert(hit(framed,.43,2.05)>0,'Wall also follows '+shape+' with fitted door');
}
{
 // Auto follows the selected rounded door/frame even for the empty
 // passage mode shown in the screenshot.
 const auto=define('auto');
 const root=make('wall',[auto]);
 assert(hit(root,.43,2.05)>0,
  'Auto shaped passage should follow round style without a fake rectangular hole');
}
{
 const a={id:1,kind:'wall',category:'wall',storey:0,root:CleanGeometry.create('wall'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 const b={id:2,kind:'wall',category:'wall',storey:0,root:CleanGeometry.create('wall'),
  thickness:.22,axes:{x:1,y:1,z:1}};
 b.root.position.x=2;
 a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
 const input={...define('round'),x:1.0,w:1.0};
 const parts=W.splitAtJunction(a,[b],input);
 assert(parts.ok&&parts.parts.length===2,'Round arch spans two connected wall modules');
 const first=make('wall',[parts.parts[0].opening]);
 const second=make('wall',[parts.parts[1].opening]);
 second.position.x=2;second.updateMatrixWorld(true);
 assert.equal(hit(first,.95,2.05),0,
  'First half of the round arch is open at the high centre');
 // Near the left end of the arch the roof slopes and the masonry is solid.
 assert(hit(first,.55,2.05)>0,'First shoulder stays filled with stone');
 assert.equal(hit(second,-.95,2.05),0,
  'Neighbor arch continues at the seam instead of restarting at full width');
 assert(hit(second,-.55,2.05)>0,'Second shoulder stays filled');
 assert(Math.abs(parts.parts[0].opening.archU1-
  parts.parts[1].opening.archU0)<1e-6,'Arch fraction joins across seam');
}
{
 const source=define('round');
 const saved=W.normalize([source]),loaded=W.normalize(JSON.parse(JSON.stringify(saved)));
 assert.equal(loaded[0].shape,'round','Save and restore keeps real arched cut');
 assert.equal(hit(make('wall',loaded),.43,2.05)>0,'Restored wall stays round, not rectangular');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8'),
  html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 assert(html.includes('id="openingShape"'),'Shape selector must exist');
 assert(app.includes("shape:$('openingShape').value"),'Shape must be captured when cutting');
 assert(app.includes("'doorRound'?'round'"),'Prefab rounded door should choose a round opening');
 assert(app.includes("$('openingShape').value=chosen.shape||'auto'"),
  'When a saved opening is selected its shape must be shown');
}
console.log('True arch: round/gothic masonry cut, empty passage, door leaf, seam and persistence OK');
