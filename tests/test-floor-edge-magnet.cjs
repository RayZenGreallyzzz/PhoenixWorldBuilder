/* Regression: exact edge-to-edge floor joins without changing texture UVs.
 * Before this fix CleanGeometry.sockets('floor') returned [], which made
 * the magnet useless for every slab, including user-imported rectangular GLB.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE,G=require(path.join(base,'js/clean-geometry.js'));
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const close=(a,b,msg,tol=.0001)=>assert(Math.abs(a-b)<tol,msg+': '+a+' != '+b);
const entry=(id,root,kind='floor',category='floor')=>({
 id,kind,category,root,storey:0,sockets:null,
 scale:1,axes:{x:1,y:1,z:1}});
const initial=G.create('floor');
const first=entry(1,initial);
const feet=G.sockets('floor',initial,null,'floor');
assert.equal(feet.length,4,'Built-in square floor must expose 4 edge sockets');
const source=entry(-1,G.create('floor'));
assert.deepEqual(feet.map(s=>s.point.toArray().map(x=>{
 const value=Math.round(x*1000)/1000;return value===0?0:value;
})),[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]);
const sourceUV=Array.from(source.root.children[0].geometry.getAttribute('uv').array);
for(const [cursor,want] of [
 [V(2.17,0,.06),V(2,0,0)],
 [V(-2.08,0,.01),V(-2,0,0)],
 [V(.07,0,2.11),V(0,0,2)],
 [V(-.05,0,-2.19),V(0,0,-2)]
]){
 const match=G.solveSnap(source,[first],cursor,0,0);
 assert(match,'Magnet must find nearby floor edge for '+cursor.toArray());
 close(match.position.x,want.x,'X edge must have no gap or overlap');
 close(match.position.z,want.z,'Z edge must have no gap or overlap');
 close(match.position.y,0,'Floor must stay at the same height');
 close(Math.sin(match.rotation),0,'Floor must not rotate unexpectedly');
}
assert.equal(G.solveSnap(source,[first],V(4,0,4),0,0),null,
 'No false magnet when cursor is distant from another slab');
// User-uploaded "03_Полы_и_перекрытия" must not be misclassified as
// ceiling: this pack includes sector 90-degree and curved floor slabs.
const SmartCatalog=require(path.join(base,'js/smart-catalog.js'));
for(const name of ['1002_Дуговой_пол.glb',
 '1002_Секторный_пол.glb','1014_Колоритный_скруглённый_угол_пол.glb']){
 const guess=SmartCatalog.classify('03_Полы_и_перекрытия/LifeAfter_666/'+name);
 assert.equal(guess.folder,'floors','Real user curved floor must be under Floors');
 assert.equal(guess.category,'floor','Curved floor placement needs the floor category');
}
assert.equal(SmartCatalog.classify('04_Потолки/test.glb').folder,'ceilings',
 'Real ceiling archives must remain under Ceilings');
// The user chooses its texture layout: magnet must NEVER edit UVs or surface.
assert.deepEqual(Array.from(source.root.children[0].geometry.getAttribute('uv').array),
 sourceUV,'Existing texture UVs must not move or stretch');
// Honor real rotated and independently scaled edge sizes.
{
 const existing=entry(11,G.create('floor'));
 existing.root.scale.set(1.7,1,.9);
 existing.root.rotation.y=Math.PI/2;
 existing.root.position.set(5,0,-4);
 existing.root.updateMatrixWorld(true,true);
 const candidate=entry(12,G.create('floor'));
 const expected=G.worldSockets(existing)[0];
 const center=expected.point.clone().addScaledVector(expected.out,1);
 const match=G.solveSnap(candidate,[existing],center,0,0);
 assert(match,'Snap next to scaled, rotated existing floor');
 const chosen=G.sockets('floor',candidate.root,null,'floor')[match.from];
 const transform=G.rotate(chosen.point,match.rotation).add(match.position);
 const targetEdge=G.worldSockets(existing)[match.to];
 close(transform.x,targetEdge.point.x,'World edge midpoint X exact');
 close(transform.z,targetEdge.point.z,'World edge midpoint Z exact');
}
// Imported GLB floor with a true rectangular physical footprint receives
// edge sockets; a quarter-circle tile should NOT falsely use its AABB.
{
 const rectangle=new T.Group();
 const mesh=new T.Mesh(new T.BoxGeometry(3,.2,1.5),new T.MeshStandardMaterial());
 mesh.position.y=.1;rectangle.add(mesh);
 const imported=entry(20,rectangle,'glb:rect-floor');
 assert.equal(G.sockets(imported.kind,rectangle,null,'floor').length,4,
  'Imported rectangular GLB floor can magnetically join other floor slabs');
 const big=entry(21,G.create('floor'));
 const solved=G.solveSnap(big,[imported],V(2.54,0,0),0,0);
 assert(solved,'Rectangle GLB can attract built-in slab');
 const points=[V(0,0,0),V(2,0,0),V(0,0,2),V(1.4,0,1.4)];
 const triangle=new T.Group(),geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(
 [0,0,0,2,0,0,0,0,2, 0,.2,0,2,.2,0,0,.2,2],3));
 triangle.add(new T.Mesh(geo,new T.MeshStandardMaterial()));
 assert.equal(G.sockets('glb:sector',triangle,null,'floor').length,0,
  'Quarter-round/triangular tile cannot claim fake full rectangle boundary');
}
// Same storey index is NOT enough: 3D heights must match, or floors overlap.
{
 const upper=entry(31,G.create('floor'));upper.root.position.y=.24;
 upper.root.updateMatrixWorld(true,true);
 assert.equal(G.solveSnap(source,[upper],V(2,0,0),0,0),null,
  'Do not snap a floor to another physical height');
}
// Never change wall/end socket behavior or join floor to roof / wall.
assert.equal(G.solveSnap(source,[entry(40,G.create('wall'),'wall','wall')],
 V(2,0,0),0,0),null,'Floor cannot snap to wall sockets');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
assert(app.includes('if(this.magnet&&snapAllowed)'),
 'Magnet toggle must remain independent of grid and textures');
assert(app.includes('CleanGeometry.solveSnap(obj,this.entries,pos,this.floor,obj.rot)'));
console.log('4-edge floor magnet, rotated/scaled and imported rectangles, XY precision, real height, curved tile safety and unchanged UVs OK');
