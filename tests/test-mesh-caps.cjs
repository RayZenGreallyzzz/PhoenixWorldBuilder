const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.MeshCaps=require(path.join(base,'js/mesh-caps.js'));
const Edit=require(path.join(base,'js/clean-mesh-edit.js'));
const Box=require(path.join(base,'js/clean-geometry.js'));
const near=(a,b,label,eps=.015)=>assert(Math.abs(a-b)<eps,label+': '+a+' != '+b);
const basic=()=>new THREE.MeshStandardMaterial({roughness:.8});
const model=(geo,material=basic())=>{
 const root=new THREE.Group();root.add(new THREE.Mesh(geo,material));return root;
};
const bounds=root=>Box.localBounds(root);
const capsOnPlane=(mesh,axis,value)=>{
 const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
 let count=0;
 for(let t=0;t+2<p.count;t+=3){
  const all=[t,t+1,t+2].every(i=>Math.abs([p.getX(i),p.getY(i),p.getZ(i)][axis]-value)<1e-4);
  if(all&&Math.abs([n.getX(t),n.getY(t),n.getZ(t)][axis])>.8)count++;
 }
 return count;
};
{
 const source=new THREE.BoxGeometry(2,1,2),backup=Array.from(source.attributes.position.array);
 assert(MeshCaps.isWatertight(source),'Unindexed GLB-style cube source is sealed');
 const root=model(source);
 const result=Edit.apply(root,{planeCuts:[{nx:-1,nz:0,offset:-.5}]});
 assert(result.ok&&result.capTriangles>0&&!result.openCut,'One cut gets actual GLB cap');
 const b=bounds(root);near(b.max.x,.5,'New physical X endpoint');
 assert(capsOnPlane(root.children[0],0,.5)>=1,'Added endcap faces lie on the cut plane');
 const g=root.children[0].geometry;
 assert.equal(g.attributes.position.count,g.attributes.uv.count,'Cap has valid UVs');
 assert.deepEqual(Array.from(source.attributes.position.array),backup,'Imported source mesh is unchanged');
 assert(MeshCaps.isWatertight(g),'Single capped cut stays a watertight solid');
}
{
 const mats=Array.from({length:6},basic),root=model(new THREE.BoxGeometry(2,1,2),mats);
 const result=Edit.apply(root,{planeCuts:[{nx:-1,nz:0,offset:-.5},
  {nx:0,nz:-1,offset:-.25}]});
 assert(result.ok&&result.capTriangles>=4&&!result.openCut,'Perpendicular multi-cut seals every side');
 const b=bounds(root);near(b.max.x,.5,'X cap');near(b.max.z,.25,'Z cap');
 const g=root.children[0].geometry;
 assert(MeshCaps.isWatertight(g),'Sequentially capped multiple cuts remain watertight');
 let total=0;for(const group of g.groups){total+=group.count;assert(group.materialIndex>=0&&group.materialIndex<6)}
 assert.equal(total,g.attributes.position.count,'Material groups cover original and cap triangles');
}
{
 const root=model(new THREE.BoxGeometry(2,1,2));
 const result=Edit.apply(root,{axis:'x',cutStart:20,cutEnd:10});
 assert(result.ok&&!result.openCut&&result.capTriangles>=2,'Legacy percentage crop also caps GLB');
 const b=bounds(root);near(b.min.x,-.6,'Legacy cut from start');near(b.max.x,.8,'Legacy cut from end');
}
{
 const root=model(new THREE.PlaneGeometry(2,2));
 assert.equal(MeshCaps.isWatertight(root.children[0].geometry),false,'Open surfaces are not sealed solids');
 const result=Edit.apply(root,{planeCuts:[{nx:-1,nz:0,offset:-.3}]});
 assert(result.ok&&result.openCut&&result.capTriangles===0,
  'Do not invent caps on open sheets or meshes that are not watertight');
}
{
 const root=new THREE.Group(),left=new THREE.Mesh(new THREE.BoxGeometry(2,1,2),basic()),
  right=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),basic());
 right.position.set(3,0,0);root.add(left,right);
 const result=Edit.apply(root,{planeCuts:[{nx:-1,nz:0,offset:-.5}]});
 assert(result.ok&&!result.openCut,'A multi-part GLB with a fully removed part still seals cut survivors');
 assert.equal(right.visible,false,'Removed submesh is hidden without mutating its template');
 assert.equal(left.visible,true);
}
{
 const root=model(new THREE.BoxGeometry(2,1,2));
 const result=Edit.apply(root,{bendAxis:'x',bend:35,planeCuts:[{nx:-1,nz:0,offset:-.5}]});
 assert(result.ok&&!result.openCut,'Bend after capping does not reopen a cut');
}
{
 const root=model(new THREE.BoxGeometry(2,1,2));
 const before=root.children[0].geometry;
 const result=Edit.apply(root,{planeCuts:[{nx:1,nz:0,offset:20}]});
 assert.equal(result.ok,false,'Reject cuts that delete every GLB triangle');
 assert.strictEqual(root.children[0].geometry,before,'A failed crop leaves the model unchanged');
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
assert(html.indexOf('js/mesh-caps.js')<html.indexOf('js/clean-mesh-edit.js'),
 'GLB capping engine must be ready before clean editor starts');
console.log('GLB sealed cuts, UV, material groups, legacy crops, open-source safety and bend OK');
