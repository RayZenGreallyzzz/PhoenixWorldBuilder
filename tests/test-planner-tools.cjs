const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const assets=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(assets,'js/three.min.js'));
const G=require(path.join(assets,'js/clean-geometry.js'));
const FloorClip=require(path.join(assets,'js/floor-clip.js'));
const near=(actual,expected,why,eps=.001)=>assert(Math.abs(actual-expected)<eps,
 why+': '+actual+' vs '+expected);
const original=G.create('floor');
const before=Array.from(original.children[0].geometry.attributes.position.array);
const first=G.create('floor');
let result=FloorClip.apply(first,{enabled:true,angle:0,offset:.5,side:'less'});
assert(result.ok&&result.changed,'X-axis cut should succeed');
const bounds=G.localBounds(first);
near(bounds.min.x,-1,'Negative side stays intact');
near(bounds.max.x,.5,'Positive side is physically cut');
near(bounds.max.y-bounds.min.y,.18,'Slab keeps its thickness');
near(result.area,3,'Clipped top area is 1.5 by 2 metres');
const geo=first.children[0].geometry;
assert.equal(geo.attributes.position.count,geo.attributes.uv.count,'UV mapping survives cut');
const norm=geo.attributes.normal;
let top=0,bottom=0,side=0;
for(let i=0;i<norm.count;i++){const y=norm.getY(i);if(y>.9)top++;else if(y<-.9)bottom++;else side++}
assert(top>0&&bottom>0&&side>0,'Physical cut retains top, bottom and closed side faces');
assert.deepEqual(Array.from(original.children[0].geometry.attributes.position.array),before,
 'Catalog source slab must stay intact');
const angled=G.create('floor');
result=FloorClip.apply(angled,{enabled:true,angle:45,offset:0,side:'greater'});
assert(result.ok,'Diagonal cut is supported');
near(result.area,2,'Diagonal through centre splits square in half');
const impossible=G.create('floor');
assert(!FloorClip.apply(impossible,{enabled:true,angle:0,offset:-2,side:'less'}).ok,
 'Reject a cut that deletes the complete slab');
assert.equal(impossible.children[0].geometry.attributes.position.count,
 original.children[0].geometry.attributes.position.count,'Rejected cuts retain original geometry');
assert.deepEqual(FloorClip.normalize({enabled:true,angle:900,offset:30,side:'bogus'}),
 {enabled:true,angle:180,offset:2.8,side:'less'},'Trim controls are clamped');
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
const app=fs.readFileSync(path.join(assets,'js/clean-app.js'),'utf8');
for(const id of ['physicalDimensions','btnSaveModule','myCatalogItems','moveStep','moveLeft',
 'moveRight','moveForward','moveBack','floorCutPanel','btnApplyFloorCut','btnResetFloorCut'])
 assert(html.includes('id="'+id+'"'),'Missing new UI control: '+id);
for(const method of ['beginObjectDrag(e)','continueObjectDrag(e)','nudgeSelected(dx,dz,dy=0)',
 'physicalSize(obj)','saveModulePreset()','rebuildFloor(obj,rawEdit)','floorTrim:FloorClip.normalize'])
 assert(app.includes(method),'New feature is not wired in editor: '+method);
assert(html.indexOf('js/floor-clip.js')<html.indexOf('js/clean-app.js'),
 'Floor cut engine must load before the editor');
console.log('Planner-style tools: centimetre dimensions, movement UI and closed floor cuts OK');
