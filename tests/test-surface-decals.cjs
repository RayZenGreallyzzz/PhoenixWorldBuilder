/* Regression: user-requested PNG graffiti MUST be an independent overlay:
 * exact geometry against roof slopes/door openings, zero material/UV changes,
 * optional v2 schema, no new collision geometry in editable modules.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const T=global.THREE, W=require(path.join(base,'js/wall-openings.js'));
const D=require(path.join(base,'js/surface-decals.js'));
const V=(x,y,z)=>new T.Vector3(x,y,z);
const baseSpec={id:'test',targetId:1,imageId:'texture:decal:test',
 position:[0,1.25,.11],normal:[0,0,1],width:1.9,height:2.5,opacity:1};
const wall=CleanGeometry.create('wall'),source=wall.children[0];
const unchanged=source.geometry;
const originalUV=Array.from(unchanged.getAttribute('uv').array);
const originalMaterial=source.material;
const ordinary=D.geometryFor(baseSpec,[{root:wall}]);
assert(ordinary&&ordinary.getAttribute('position').count>0,
 'Decal must project directly onto the real front triangles of a wall');
assert.strictEqual(source.geometry,unchanged,'Do not reassign base geometry');
assert.strictEqual(source.material,originalMaterial,'Do not change wall material');
assert.deepEqual(Array.from(source.geometry.getAttribute('uv').array),originalUV,
 'Do not rewrite base texture UV coordinates');
const fakeTex=new T.Texture();
const decalMesh=D.createMesh(baseSpec,ordinary,fakeTex);
assert(decalMesh.material.transparent&&decalMesh.material.depthWrite===false);
assert.equal(decalMesh.material.opacity,1,
 'PNG alpha must work at full layer opacity: transparent=true');
assert.equal(decalMesh.userData.phoenixDecal,true);
D.dispose(decalMesh);
{
 const arch=CleanGeometry.create('wall');
 const result=W.render(arch,'wall',[{id:'open',type:'passage',x:0,y:0,w:1.05,
  h:2.2,shape:'round',doorStyle:'round',frameStyle:'round'}],
  {thickness:.22,axes:{x:1,y:1,z:1}});
 assert(result.ok,'Real opening should be generated');
 const spec={...baseSpec,width:1.8,height:2.4};
 const geometry=D.geometryFor(spec,[{root:arch}]);
 assert(geometry,'Graphics can decorate actual arch walls');
 const p=geometry.getAttribute('position');
 let lintel=0,side=0;
 for(let i=0;i<p.count;i+=3){
  const mid=V((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,
   (p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,
   (p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3);
  if(Math.abs(mid.x)<.31&&mid.y<1.7)
   throw Error('Overlay filled REAL open arch passage at '+mid.toArray());
  if(mid.y>2.25)lintel++;
  if(Math.abs(mid.x)>.6)side++;
 }
 assert(lintel>0&&side>0,'Paint both sides and masonry above door');
 geometry.dispose();
}
{
 const a=CleanGeometry.create('floor'),b=CleanGeometry.create('floor');
 b.position.x=2;
 a.updateWorldMatrix(true,true);b.updateWorldMatrix(true,true);
 const uvA=Array.from(a.children[0].geometry.getAttribute('uv').array);
 const uvB=Array.from(b.children[0].geometry.getAttribute('uv').array);
 const spec={...baseSpec,position:[1,.18,0],normal:[0,1,0],
  width:4,height:2,room:true};
 const mesh=D.geometryFor(spec,[{root:a},{root:b}]);
 assert(mesh,'One room-wide decal should span two separate floor tiles');
 const p=mesh.getAttribute('position'),bounds=new T.Box3().setFromBufferAttribute(p);
 assert(bounds.min.x<-.9&&bounds.max.x>2.9,
  'The artwork must physically cover both tiles in the same layer');
 assert.deepEqual(Array.from(a.children[0].geometry.getAttribute('uv').array),uvA);
 assert.deepEqual(Array.from(b.children[0].geometry.getAttribute('uv').array),uvB);
 mesh.dispose();
}
{
 // Real pitched roof: artwork must be ON its sloped triangles (not a flat quad).
 const root=CleanGeometry.create('roof'),mesh=root.children[0];
 root.updateWorldMatrix(true,true);
 const pos=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index;
 let spec=null;
 for(let i=0;i<(idx?idx.count:pos.count);i+=3){
  const a=V(0,0,0).fromBufferAttribute(pos,idx?idx.getX(i):i)
   .applyMatrix4(mesh.matrixWorld);
  const b=V(0,0,0).fromBufferAttribute(pos,idx?idx.getX(i+1):i+1)
   .applyMatrix4(mesh.matrixWorld);
  const c=V(0,0,0).fromBufferAttribute(pos,idx?idx.getX(i+2):i+2)
   .applyMatrix4(mesh.matrixWorld);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  if(normal.y>.4&&Math.abs(normal.y)<.95){
   spec={...baseSpec,position:a.clone().add(b).add(c).multiplyScalar(1/3).toArray(),
    normal:normal.toArray(),width:.65,height:.65};
   break;
  }
 }
 assert(spec,'Pitched roof has a genuinely inclined upper face');
 const decal=D.geometryFor(spec,[{root}]);
 assert(decal&&decal.getAttribute('position').count>0,
  'Transparent artwork must conform to pitched roof surface');
 const points=decal.getAttribute('position');
 const normal=V(...spec.normal),origin=V(...spec.position);
 for(let i=0;i<points.count;i++){
  const point=V(0,0,0).fromBufferAttribute(points,i);
  assert(Math.abs(point.sub(origin).dot(normal)-.003)<.002,
   'Artwork must sit only 3 mm above the actual roof plane');
 }
 decal.dispose();
}
assert.deepEqual(D.normalize(null),[],'Legacy project v2 has no decals');
assert.deepEqual(D.normalize([{id:'not valid'}]),[]);
assert.equal(D.normalize([baseSpec]).length,1);
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const exportGLB=fs.readFileSync(path.join(base,'js/export-glb.js'),'utf8');
assert(app.includes('decals:SurfaceDecals.normalize(this.decals)'));
assert(app.includes('this.decals=SurfaceDecals.normalize(doc.decals)'));
assert(app.includes('...this.decalMeshes.map('),
 'Alpha overlay must also be present in exported GLB as a separate mesh');
assert(app.includes('await this.refreshDecals();this.syncDecalList();'),
 'Legacy and new saves must restore overlay layers');
assert(exportGLB.includes("m.transparent||a<1?'BLEND':'OPAQUE'"),
 'Imported GLB must preserve PNG alpha even at opacity 1');
assert(html.includes('id="decalPanel"')&&
 html.includes('js/surface-decals.js')&&
 html.includes('id="btnPlaceDecal"'));
console.log('Non-destructive transparent PNG overlays: real roof pitch, open arch, full room, old projects, unchanged UV/material, separate GLB alpha OK');
