/* Phoenix Builder: sealed planar cuts for static, watertight GLB meshes.
 * Cuts and caps operate in root-local space. Indexed and non-indexed geometry,
 * material groups, UVs and vertex colours are preserved on existing faces.
 * Open/non-manifold sources are clipped but intentionally NOT falsely capped.
 */
const MeshCaps=(()=>{
 'use strict';
 const EPS=1e-5,KEY=1e5,MAX_TRIS=240000,MAX_LOOP=16000;
 const key=p=>p.map(x=>Math.round(x*KEY)).join(',');
 const ek=(a,b)=>a<b?a+'|'+b:b+'|'+a;
 const dot=(n,p)=>n[0]*p[0]+n[1]*p[1]+n[2]*p[2];
 const crossLen=(a,b,c)=>{
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
 };
 const vert=(a,b,t)=>({
  p:a.p.map((v,i)=>v+(b.p[i]-v)*t),
  uv:a.uv&&b.uv?a.uv.map((v,i)=>v+(b.uv[i]-v)*t):null,
  color:a.color&&b.color?a.color.map((v,i)=>v+(b.color[i]-v)*t):null
 });
 function isWatertight(geometry){
  const pos=geometry.attributes.position,idx=geometry.index,count=idx?idx.count:pos.count;
  if(count<12||count%3)return false;
  const edgeCounts=new Map();
  const k=i=>key([pos.getX(i),pos.getY(i),pos.getZ(i)]);
  for(let t=0;t<count;t+=3){
   const keys=[k(idx?idx.getX(t):t),k(idx?idx.getX(t+1):t+1),k(idx?idx.getX(t+2):t+2)];
   if(new Set(keys).size!==3)return false;
   for(let j=0;j<3;j++){
    const pair=ek(keys[j],keys[(j+1)%3]);
    const n=(edgeCounts.get(pair)||0)+1;
    if(n>2)return false;
    edgeCounts.set(pair,n);
   }
  }
  return [...edgeCounts.values()].every(n=>n===2);
 }
 function trianglesFrom(mesh,transform){
  const g=mesh.geometry,pos=g.attributes.position,uv=g.attributes.uv,col=g.attributes.color,
   idx=g.index,count=idx?idx.count:pos.count,groups=g.groups||[];
  const materialAt=t=>{
   for(const grp of groups)if(t>=grp.start&&t<grp.start+grp.count)return grp.materialIndex||0;
   return 0;
  };
  const point=i=>{
   const p=new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(transform);
   return {p:[p.x,p.y,p.z],
    uv:uv?[uv.getX(i),uv.getY(i)]:null,
    color:col?[col.getX(i),col.getY(i),col.getZ(i)]:null};
  };
  const out=[];
  for(let t=0;t<count;t+=3){
   const v=[point(idx?idx.getX(t):t),point(idx?idx.getX(t+1):t+1),
    point(idx?idx.getX(t+2):t+2)];
   if(crossLen(v[0].p,v[1].p,v[2].p)>1e-11)out.push({v,mat:materialAt(t)});
  }
  return out;
 }
 function clipPolygon(poly,n,offset){
  const out=[];
  if(!poly.length)return out;
  let a=poly[poly.length-1],da=dot(n,a.p)-offset;
  for(const b of poly){
   const db=dot(n,b.p)-offset,insideA=da>=-EPS,insideB=db>=-EPS;
   if(insideA!==insideB){
    const t=Math.abs(da-db)<1e-12?.5:Math.max(0,Math.min(1,da/(da-db)));
    out.push(vert(a,b,t));
   }
   if(insideB)out.push(b);
   a=b;da=db;
  }
  return out;
 }
 function clipTriangles(tris,n,offset){
  let inside=false,outside=false;const result=[];
  for(const tri of tris){
   for(const p of tri.v){
    const d=dot(n,p.p)-offset;
    if(d>EPS)inside=true;
    else if(d<-EPS)outside=true;
   }
   const poly=clipPolygon(tri.v,n,offset);
   for(let i=1;i+1<poly.length;i++){
    const v=[poly[0],poly[i],poly[i+1]];
    if(crossLen(v[0].p,v[1].p,v[2].p)>1e-11)
     result.push({v,mat:tri.mat});
   }
   if(result.length>MAX_TRIS)return {ok:false,reason:'Слишком много полигонов после подрезки'};
  }
  return {ok:true,tris:result,changed:inside&&outside};
 }
 function basis(n){
  const normal=new THREE.Vector3(...n);
  const u=Math.abs(normal.y)>.9?new THREE.Vector3(1,0,0):
   new THREE.Vector3(-normal.z,0,normal.x).normalize();
  const v=normal.clone().negate().cross(u).normalize();
  return {u,v};
 }
 const signedArea=pts=>pts.reduce((a,p,i)=>{
  const next=pts[(i+1)%pts.length];return a+p.u*next.v-next.u*p.v;
 },0)/2;
 function contains(poly,p){
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if(((a.v>p.v)!==(b.v>p.v))&&
    p.u<(b.u-a.u)*(p.v-a.v)/(b.v-a.v)+a.u)yes=!yes;
  }
  return yes;
 }
 function seamLoops(tris,n,offset){
  const edges=new Map(),nodes=new Map();
  for(const tri of tris){
   for(let j=0;j<3;j++){
    const a=tri.v[j],b=tri.v[(j+1)%3];
    if(Math.abs(dot(n,a.p)-offset)>EPS*3||Math.abs(dot(n,b.p)-offset)>EPS*3)continue;
    const ka=key(a.p),kb=key(b.p);
    if(ka===kb)continue;
    nodes.set(ka,a);nodes.set(kb,b);
    const edge=ek(ka,kb),item=edges.get(edge);
    if(item)item.count++;
    else edges.set(edge,{a:ka,b:kb,count:1});
   }
  }
  const links=new Map(),seams=[...edges.values()].filter(e=>e.count===1);
  if(!seams.length)return [];
  for(const e of seams){
   for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){
    if(!links.has(a))links.set(a,[]);
    links.get(a).push(b);
   }
  }
  // Branching or dangling edges are not a trustworthy contour.
  if([...links.values()].some(list=>list.length!==2))return null;
  const visited=new Set(),loops=[];
  for(const edge of seams){
   const label=ek(edge.a,edge.b);
   if(visited.has(label))continue;
   const loop=[],first=edge.a;
   let at=first,prev=null,steps=0;
   do{
    if(++steps>MAX_LOOP)return null;
    loop.push(nodes.get(at));
    const pair=links.get(at),next=pair.find(k=>k!==prev);
    if(!next)return null;
    const edgeKey=ek(at,next);
    if(visited.has(edgeKey)&&next!==first)return null;
    visited.add(edgeKey);prev=at;at=next;
   }while(at!==first);
   if(loop.length<3)return null;
   loops.push(loop);
  }
  return loops;
 }
 function makeCaps(tris,n,offset){
  const loops=seamLoops(tris,n,offset);
  if(loops===null)return null;
  if(!loops.length)return [];
  const {u,v}=basis(n);
  const mapped=loops.map(loop=>loop.map(item=>{
   const p=new THREE.Vector3(...item.p);
   return {p:item.p,u:p.dot(u),v:p.dot(v),color:item.color};
  }));
  const areas=mapped.map(loop=>Math.abs(signedArea(loop)));
  const parents=mapped.map((loop,i)=>{
   let parent=-1,best=Infinity;
   for(let j=0;j<mapped.length;j++){
    if(j===i||areas[j]<=areas[i])continue;
    if(contains(mapped[j],loop[0])&&areas[j]<best){best=areas[j];parent=j}
   }
   return parent;
  });
  const depth=i=>{let d=0,parent=parents[i];while(parent!==-1&&d<20){d++;parent=parents[parent]}return d};
  const caps=[],material=tris.length?tris[0].mat:0;
  for(let i=0;i<mapped.length;i++){
   if(depth(i)%2)continue;
   const holes=mapped.map((loop,j)=>({loop,j})).filter(o=>parents[o.j]===i&&depth(o.j)%2===1)
    .map(o=>o.loop);
   const rings=[mapped[i],...holes],flatten=rings.flat();
   const faces=THREE.ShapeUtils.triangulateShape(
    rings[0].map(a=>new THREE.Vector2(a.u,a.v)),
    holes.map(r=>r.map(a=>new THREE.Vector2(a.u,a.v))));
   if(!faces.length)return null;
   for(const face of faces){
    let [a,b,c]=face.map(index=>flatten[index]);
    const p=a.p,q=b.p,r=c.p;
    const normal=[(q[1]-p[1])*(r[2]-p[2])-(q[2]-p[2])*(r[1]-p[1]),
     (q[2]-p[2])*(r[0]-p[0])-(q[0]-p[0])*(r[2]-p[2]),
     (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])];
    if(Math.hypot(...normal)<1e-10)continue;
    if(dot(n,normal)>0)[b,c]=[c,b]; // Outward cap normal points into discarded half-space.
    const capVert=p=>({p:p.p.slice(),uv:[p.u,p.v],color:p.color||[1,1,1]});
    caps.push({v:[capVert(a),capVert(b),capVert(c)],mat:material});
   }
  }
  return caps;
 }
 function planesFor(edit,box){
  const planes=[],axis={x:0,y:1,z:2}[edit.axis]??0;
  const min=[box.min.x,box.min.y,box.min.z][axis],
   max=[box.max.x,box.max.y,box.max.z][axis],span=max-min;
  if(edit.cutStart>0){const n=[0,0,0];n[axis]=1;
   planes.push({n,offset:min+span*edit.cutStart/100})}
  if(edit.cutEnd>0){const n=[0,0,0];n[axis]=-1;
   planes.push({n,offset:-(max-span*edit.cutEnd/100)})}
  for(const c of edit.planeCuts||[])planes.push({n:[c.nx,0,c.nz],offset:c.offset});
  return planes;
 }
 function makeGeometry(tris,rootToMesh,hasUV,hasColor){
  const pos=[],uv=[],col=[],groups=[];
  for(const tri of tris){
   const start=pos.length/3;
   for(const v of tri.v){
    const p=new THREE.Vector3(...v.p).applyMatrix4(rootToMesh);
    pos.push(p.x,p.y,p.z);
    if(hasUV)uv.push(...(v.uv||[0,0]));
    if(hasColor)col.push(...(v.color||[1,1,1]));
   }
   const last=groups[groups.length-1];
   if(last&&last.materialIndex===tri.mat&&last.start+last.count===start)last.count+=3;
   else groups.push({start,count:3,materialIndex:tri.mat});
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  if(hasUV)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(hasColor)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  for(const grp of groups)g.addGroup(grp.start,grp.count,grp.materialIndex);
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
 }
 function run(root,edit,box){
  const planes=planesFor(edit,box);
  if(!planes.length)return {ok:true,changed:false,triangles:0,openCut:false,capLoops:0};
  root.updateWorldMatrix(true,true);
  const inverseRoot=root.matrixWorld.clone().invert(),prepared=[];
  let total=0,capLoops=0,openMeshes=0,changed=false,skippedMeshes=0;
  let reason=null;
  root.traverse(mesh=>{
   if(reason||!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   const src=mesh.geometry,localToRoot=inverseRoot.clone().multiply(mesh.matrixWorld),
    rootToMesh=localToRoot.clone().invert();
   let tris=trianglesFrom(mesh,localToRoot),isClosed=isWatertight(src),meshWasCut=false,uncapped=false;
   for(const plane of planes){
    if(!tris.length)break;
    const result=clipTriangles(tris,plane.n,plane.offset);
    if(!result.ok){reason=result.reason;break}
    tris=result.tris;
    if(!result.changed)continue;
    meshWasCut=true;changed=true;
    if(isClosed&&tris.length){
     const caps=makeCaps(tris,plane.n,plane.offset);
     if(caps===null||!caps.length){uncapped=true;isClosed=false}
     else {tris.push(...caps);capLoops+=caps.length}
    }else if(!isClosed)uncapped=true;
    if(tris.length>MAX_TRIS){reason='Слишком много полигонов после закрытия среза';break}
   }
   if(reason)return;
   if(meshWasCut&&uncapped)openMeshes++;
   if(!meshWasCut)skippedMeshes++;
   if(!tris.length){prepared.push({mesh,empty:true});return}
   total+=tris.length;
   if(total>MAX_TRIS){reason='Слишком много полигонов для Android';return}
   prepared.push({mesh,geometry:makeGeometry(tris,rootToMesh,!!src.attributes.uv,!!src.attributes.color)});
  });
  if(reason||!total){
   for(const p of prepared)p.geometry?.dispose();
   return {ok:false,reason:reason||'Обрезка полностью удалила геометрию'};
  }
  for(const item of prepared){
   if(item.empty){item.mesh.visible=false;continue}
   item.mesh.geometry=item.geometry;
  }
  root.updateWorldMatrix(true,true);
  return {ok:true,changed,triangles:total,openCut:openMeshes>0,openMeshes,
   capTriangles:capLoops,skippedMeshes};
 }
 return {run,isWatertight,planesFor};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=MeshCaps;
