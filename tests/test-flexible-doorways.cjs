const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const W=require(path.join(base,'js/wall-openings.js'));
const eps=(actual,expected,msg,tol=.02)=>
 assert(Math.abs(actual-expected)<=tol,msg+': '+actual+' vs '+expected);
function wall(kind,id,at=[0,0,0],scale=[1,1,1]){
 const root=CleanGeometry.create(kind);
 root.position.fromArray(at);root.scale.fromArray(scale);
 root.updateWorldMatrix(true,true);
 return {id,kind,category:'wall',storey:0,thickness:.22,
  axes:{x:scale[0],y:scale[1],z:scale[2]},root};
}
function requested(type='passage',x=0,w=.9){
 return {id:'door-test',group:'door-test',type,x,y:0,w,h:2.1,
  doorStyle:'round',frameStyle:'round',hinge:'left',angle:0};
}
function render(obj,parts){
 const root=CleanGeometry.create(obj.kind),result=W.render(root,obj.kind,parts,
  {thickness:obj.thickness,axes:obj.axes});
 assert(result.ok,result.reason||'Render failed');
 return root;
}
function hole(root,kind,s,y=1){
 const prof=W.profile(kind),p=prof.pos(s);
 const n=new THREE.Vector3(p.nx,0,p.nz).normalize();
 return new THREE.Raycaster(new THREE.Vector3(p.x,y,p.z).addScaledVector(n,.6),
  n.clone().negate(),0,1.2).intersectObject(root.getObjectByName('structure:wall'),false).length;
}
{
 const a=wall('wall',1,[0,0,0]),b=wall('wall',2,[2,0,0]);
 const cut=W.splitAtJunction(a,[b],requested('passage',1,.9));
 assert(cut.ok&&cut.joint&&cut.parts.length===2,
  'Centre placed exactly at two-wall joint produces one through opening');
 eps(cut.parts[0].opening.w,.45,'First half physical width',.001);
 eps(cut.parts[1].opening.w,.45,'Second half physical width',.001);
 const one=render(a,[cut.parts[0].opening]),two=render(b,[cut.parts[1].opening]);
 for(const [root,kind] of [[one,'wall'],[two,'wall']]){
  assert(!root.getObjectByName('door:leaf')&&!root.getObjectByName('window:glass'),
   'Pass-through opening must not be filled by fake door or window');
  assert(!root.children.some(x=>x.name.startsWith('phoenixOpening')),
   'A bare opening has no protruding frame or jamb');
 }
 assert.equal(hole(one,'wall',1.9),0,'Void spans centreline at first seam edge');
 assert.equal(hole(two,'wall',.1),0,'Void spans centreline on second wall');
}
{
 const corner=wall('corner',5);
 const metric=W.pathMetric(corner),at=W.pathAtPoint('corner',{x:0,z:0});
 eps(metric.length,3.8,'L corner 2 arms world length',.002);
 eps(at.s,1.9,'Screen tap at inside corner maps to bend',.002);
 const cut=W.splitAtJunction(corner,[],requested('passage',0,1));
 assert(cut.ok&&!cut.joint,'Door size can straddle actual internal 90 degree corner');
 const root=render(corner,[cut.parts[0].opening]);
 assert.equal(hole(root,'corner',1.7),0,'True void in horizontal arm before corner');
 assert.equal(hole(root,'corner',2.1),0,'True void in vertical arm after corner');
}
{
 for(const kind of ['arc90','arc180']){
  const obj=wall(kind,10);
  const metric=W.pathMetric(obj);
  const start=W.pathAtPoint(kind,{x:2,z:0});
  eps(start.s,0,'Beginning of '+kind+' curve',.002);
  const half=metric.p.pos(metric.p.length/2);
  const located=W.pathAtPoint(kind,half);
  eps(located.s,metric.p.length/2,'Any touch in centre of '+kind+' curve',.002);
  const cut=W.splitAtJunction(obj,[],requested('passage',0,1.1));
  assert(cut.ok,'1.1 m through opening works on '+kind);
  const root=render(obj,[cut.parts[0].opening]);
  assert.equal(hole(root,kind,metric.p.length/2),0,
   'Semicircular/quarter-circle wall has a genuine full-depth cut');
  assert(!root.getObjectByName('door:leaf'),'Empty curved passage has no blocking leaf');
 }
}
{
 const scaled=wall('wall',22,[0,0,0],[2,1,1]);
 const metric=W.pathMetric(scaled);
 eps(metric.length,4,'Scaled straight wall physical path length',.001);
 const cut=W.splitAtJunction(scaled,[],requested('door',0,.9));
 assert(cut.ok,'Width 90 cm physically fits stretched wall');
 eps(cut.parts[0].opening.w,.45,'Width .45 local units x2 = .9m physical',.001);
 const root=render(scaled,[cut.parts[0].opening]);
 assert(root.getObjectByName('door:leaf'),'A fitted door is actually inserted');
}
{
 const arc=wall('arc180',23,[0,0,0],[1.45,1,.82]);
 const metric=W.pathMetric(arc);
 const cut=W.splitAtJunction(arc,[],requested('passage',0,1.2));
 assert(cut.ok,'Opening in an elliptical curved wall is supported');
 const part=cut.parts[0].opening;
 const center=metric.p.length/2+part.x;
 const actual=metric.distanceAt(center+part.w/2)-
  metric.distanceAt(center-part.w/2);
 eps(actual,1.2,'Real doorway width 120 cm measured along ellipse',.005);
}
{
 const a=wall('wall',30,[0,0,0],[1.5,1,1]);
 const b=wall('wall',31,[2.5,0,0],[1,1,1]);
 const metric=W.pathMetric(a);
 eps(metric.length,3,'First wall physically expanded to 3m',.001);
 const cut=W.splitAtJunction(a,[b],requested('passage',1.5,1));
 assert(cut.ok&&cut.joint,'90 degree seam-size opening on scaled parent can span walls');
 const left=cut.parts[0].opening,right=cut.parts[1].opening;
 eps(left.w*1.5,.5,'First half physical width is .5m',.001);
 eps(right.w,.5,'Second half physical width is .5m',.001);
}
{
 const a=wall('wall',41),b=wall('arc180',42,[-1,0,0]);
 const cut=W.splitAtJunction(a,[b],requested('passage',1,.9));
 assert(cut.ok&&cut.joint,'Bare doorway crosses straight-to-semicircular seam');
 assert(cut.parts.some(x=>x.entry===b),'Arc is a cut target at joint');
}
{
 const m=W.pathMetric(wall('wall',50,[0,0,0],[1,2,1]));
 const c=W.splitAtJunction(wall('wall',51,[0,0,0],[1,2,1]),[],
  {...requested('passage',0,.9),h:2.2,y:.1});
 assert(c.ok,'Physical door height is normalized to scaled wall Y');
 eps(c.parts[0].opening.h,1.1,'2.2m opening becomes 1.1m local on 2x Y wall',.001);
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['btnOpeningTool','openingSizePreset','openingPositionPreset',
 'btnPickOpeningPoint','openingWidth','openingHeight','btnAddOpening',
 'openingNeighbor','btnCutForPrefabDoor','openingPositionInfo'])
 assert(html.includes('id="'+id+'"'),'Accessible editor control missing: '+id);
assert(html.includes('<option value="passage">'),'UI lacks true empty passage mode');
assert(html.indexOf('id="openingPanel"')<html.indexOf('id="gizmoPanel"'),
 'Cutter must be accessible before advanced editor details');
for(const code of ['this.startOpeningTool()','this.pickOpeningCentre(e)',
 'this.chooseOpeningPosition(e.target.value)','this.cutForPrefabDoor()',
 'WallOpenings.splitAtJunction','this.openingPickMode'])
 assert(app.includes(code),'3D cut UI not connected '+code);
console.log('Door-size cuts: empty 2-wall seam, 90° internal corner, arcs, ellipse, physical scale and tablet UI OK');
