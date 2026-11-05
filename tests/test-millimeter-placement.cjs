const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const assets=path.join(__dirname,'../app/src/main/assets');
const P=require(path.join(assets,'js/precision-placement.js'));
const eq=(a,b,msg)=>assert(Math.abs(a-b)<1e-9,msg+': '+a+' vs '+b);
assert.deepEqual(P.STEPS,[.001,.005,.01,.05,.25,1]);
eq(P.roundMM(1.23449),1.234,'Round metre to 1 mm');
eq(P.roundMM(1.23451),1.235,'Keep closest mm');
eq(P.roundMM(-1.23451),-1.235,'Negative coordinate round');
eq(P.step('.001'),.001,'Millimetre option parsed from select');
eq(P.step('invalid'),.001,'Invalid edit step falls back safely');
eq(P.coordinate(1.23456,false,.25),1.235,
 'Free placement does NOT snap to 25 cm even if grid step is 25 cm');
eq(P.coordinate(-.1734,false,1),-.173,
 'Magnet-disabled free placement is not tied to world grid');
eq(P.coordinate(1.23456,true,.25),1.25,'Explicit 25 cm grid mode works');
eq(P.coordinate(1.23456,true,.005),1.235,'Explicit 5 mm grid mode works');
eq(P.coordinate(1.23456,true,.001),1.235,'Explicit 1 mm grid mode works');
eq(P.drag(2.1,10.33,10.4574,false,.25),2.227,
 'Dragging preserves original object offset without grid snapping');
eq(P.drag(2.1,10.33,10.4574,true,.25),2.25,
 'Dragging only snaps if grid enabled');
eq(P.nudge(3.031,1,.001),3.032,'Nudge exactly 1 mm');
eq(P.nudge(3.031,-1,.001),3.03,'Nudge exactly -1 mm');
eq(P.nudge(-.1,1,.001),-.099,'Negative world coordinates nudge');
{
 let x=.005;
 for(let i=0;i<1000;i++)x=P.nudge(x,1,.001);
 eq(x,1.005,'1000 successive mm nudges have no drift');
}
eq(P.nudge(7.05,1,.25),7.3,'Fine nudges do not force a world-grid alignment');
assert.equal(P.formatMM(.017),'17 мм');
// Reproduce the original column-fitting bug: legacy preview rounded 1.234 m
// to 1.25 m, forcing a wall/column overlap of ~16 mm.
const columnX=1.234,desiredX=1.236;
assert(Math.abs(P.coordinate(desiredX,false,.25)-columnX)<.005,
 'Decorated column can approach a wall within 2 mm instead of jumping 25 cm');
{
 global.THREE=require(path.join(assets,'js/three.min.js'));
 global.PrecisionPlacement=P;
 const Gizmo=require(path.join(assets,'js/builder-gizmo.js'));
 const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera();
 cam.position.set(6,6,8);
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
 const widget=new Gizmo(scene,cam,canvas,new THREE.Raycaster());
 const root=new THREE.Group();root.position.set(1.234,0,0);
 const obj={root,rot:0,scale:1,axes:{x:1,y:1,z:1}};
 widget.attach(obj);
 widget.onPlane=()=>new THREE.Vector3(.0036,0,0);
 const makeDrag=()=>{widget.drag={pointerId:7,mode:'move',axis:'x',sx:0,sy:0,
  basePosition:root.position.clone(),p:new THREE.Vector3(0,0,0),changed:false}};
 makeDrag();
 assert(widget.move({pointerId:7,clientX:10,clientY:10},obj,
  {gridEnabled:false,gridStep:.25}),'Free gizmo drag runs');
 eq(root.position.x,1.238,'Gizmo moves to a millimetre value, not 25cm grid');
 root.position.set(1.234,0,0);makeDrag();
 widget.move({pointerId:7,clientX:10,clientY:10},obj,
  {gridEnabled:true,gridStep:.25});
 eq(root.position.x,1.25,'Gizmo snaps only when grid explicitly enabled');
 widget.drag=null;widget.attach(null);
}
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8'),
 app=fs.readFileSync(path.join(assets,'js/clean-app.js'),'utf8'),
 gizmo=fs.readFileSync(path.join(assets,'js/builder-gizmo.js'),'utf8');
for(const id of ['gridSnap','gridStep','moveStep','moveLeft','moveRight','moveForward',
 'moveBack','moveUp','moveDown','posX','posY','posZ'])
 assert(html.includes('id="'+id+'"'),'Missing precision UI '+id);
assert(html.includes('value="0.001" selected>1 мм'),'Default nudge is 1 mm');
assert(html.includes('step=".001" inputmode="decimal"'),'Numeric XYZ editor accepts 0.001 m');
assert(html.indexOf('js/precision-placement.js')<html.indexOf('js/clean-app.js'),
 'Precision engine loads before editor');
assert(html.indexOf('js/precision-placement.js')<html.indexOf('js/builder-gizmo.js'),
 'Precision engine loads before gizmo');
for(const token of ['this.gridSnap','PrecisionPlacement.coordinate(pos.x',
 'PrecisionPlacement.drag(','PrecisionPlacement.nudge','obj.manualPlacementY',
 "['moveDown',0,0,-1]",'this.gridStep'])
 assert(app.includes(token),'Precision must be integrated in placement/drag: '+token);
assert(gizmo.includes('PrecisionPlacement.coordinate('),
 'Gizmo drag must use optional grid / mm engine rather than its own 5cm rounding');
console.log('True free placement, exact 1mm XYZ nudges, optional grid, negative coordinates and precision UI OK');
