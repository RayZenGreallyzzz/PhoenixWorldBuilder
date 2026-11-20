/* Solid geometry cuts for Phoenix Builder built-in floor: manually angled
 * or multiple arbitrary wall boundary half-planes. Always start from original.
 * Cut surfaces are closed, with UVs on every face.
 */
const FloorClip=(()=>{
 'use strict';
 const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
 function normalizeCuts(cuts){
  if(!Array.isArray(cuts))return [];
  const out=[];
  for(const cut of cuts.slice(0,16)){
   if(!cut||![cut.nx,cut.nz,cut.offset].every(v=>typeof v==='number'&&Number.isFinite(v)))continue;
   const norm=Math.hypot(cut.nx,cut.nz);
   if(norm<1e-7||norm>1e5||Math.abs(cut.offset)>1e5)continue;
   out.push({nx:cut.nx/norm,nz:cut.nz/norm,offset:cut.offset/norm});
  }
  return out;
 }
 function normalizeContour(points){
  if(!Array.isArray(points)||points.length<3||points.length>1200)return null;
  const p=[];
  for(const v of points){
   if(!v||typeof v.x!=='number'||typeof v.z!=='number'||
      !Number.isFinite(v.x)||!Number.isFinite(v.z)||
      Math.abs(v.x)>5000||Math.abs(v.z)>5000)return null;
   if(!p.length||Math.hypot(v.x-p[p.length-1].x,v.z-p[p.length-1].z)>1e-5)
    p.push({x:v.x,z:v.z});
  }
  return p.length>=3?p:null;
 }
 const normalize=raw=>{
  const e=raw||{},cuts=normalizeCuts(e.cuts);
  const value={enabled:e.enabled===true,angle:Math.max(-180,Math.min(180,finite(e.angle,0))),
   offset:Math.max(-2.8,Math.min(2.8,finite(e.offset,0))),
   ...(normalizeContour(e.contour)?{contour:normalizeContour(e.contour)}:{}),
   side:e.side==='greater'?'greater':'less'};
  if(cuts.length)value.cuts=cuts;
  return value;
 };
 const polygonArea=poly=>Math.abs(poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];return sum+p.x*q.z-q.x*p.z;
 },0))*.5;
 function clipHalfPlane(poly,nx,nz,offset){
  if(!poly.length)return [];
  const signed=p=>nx*p.x+nz*p.z-offset;
  const out=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=signed(a),db=signed(b);
   const insideA=da>=-1e-8,insideB=db>=-1e-8;
   if(insideA!==insideB){
    const t=da/(da-db);
    out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
   }
   if(insideB)out.push({...b});
  }
  const result=out.filter((p,i)=>!i||Math.hypot(p.x-out[i-1].x,p.z-out[i-1].z)>1e-6);
  if(result.length>1&&Math.hypot(result[0].x-result[result.length-1].x,result[0].z-result[result.length-1].z)<1e-6)result.pop();
  return result;
 }
 function clipPolygon(poly,raw){
  const e=normalize(raw),rad=e.angle*Math.PI/180,side=e.side==='less'?-1:1;
  let out=poly.map(p=>({...p}));
  if(e.enabled)out=clipHalfPlane(out,Math.cos(rad)*side,Math.sin(rad)*side,e.offset*side);
  for(const cut of e.cuts||[])out=clipHalfPlane(out,cut.nx,cut.nz,cut.offset);
  return out;
 }
 function createSlab(rect,poly){
  const points=[],uv=[];
  const w=rect.maxX-rect.minX,d=rect.maxZ-rect.minZ;
  function vertex(p,y,sideU=null){
   points.push(p.x,y,p.z);
   uv.push(sideU===null?(p.x-rect.minX)/w:sideU,
    sideU===null?(p.z-rect.minZ)/d:(y-rect.minY)/(rect.maxY-rect.minY));
  }
  function tri(a,b,c,y){vertex(a,y);vertex(b,y);vertex(c,y)}
  for(let i=1;i<poly.length-1;i++){
   tri(poly[0],poly[i+1],poly[i],rect.maxY);
   tri(poly[0],poly[i],poly[i+1],rect.minY);
  }
  let perimeter=0;
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],len=Math.hypot(b.x-a.x,b.z-a.z);
   const corner=(p,y,u)=>{points.push(p.x,y,p.z);uv.push(u,(y-rect.minY)/(rect.maxY-rect.minY))};
   corner(a,rect.minY,perimeter);corner(b,rect.maxY,perimeter+len);corner(b,rect.minY,perimeter+len);
   corner(a,rect.minY,perimeter);corner(a,rect.maxY,perimeter);corner(b,rect.maxY,perimeter+len);
   perimeter+=len;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
 }
 // Clip a convex triangle against the slab rectangle. Concave rooms are
 // triangulated BEFORE clipping, so a semicircular inset cannot erase the
 // opposite side of the room like independent infinite half-plane cuts.
 function contourFragments(rect,contour){
  if(!Array.isArray(contour)||contour.length<3)return [];
  const vertices=contour.map(p=>new THREE.Vector2(p.x,p.z));
  const indices=THREE.ShapeUtils.triangulateShape(vertices,[]),pieces=[];
  const limits=[{nx:1,nz:0,o:rect.minX},{nx:-1,nz:0,o:-rect.maxX},
   {nx:0,nz:1,o:rect.minZ},{nx:0,nz:-1,o:-rect.maxZ}];
  for(const face of indices){
   let poly=face.map(i=>({x:contour[i].x,z:contour[i].z}));
   for(const l of limits){
    poly=clipHalfPlane(poly,l.nx,l.nz,l.o);
    if(poly.length<3)break;
   }
   if(poly.length>=3&&polygonArea(poly)>1e-8)pieces.push(poly);
  }
  return pieces;
 }
 function contourSlab(rect,contour){
  const pieces=contourFragments(rect,contour);
  if(!pieces.length||pieces.reduce((s,p)=>s+polygonArea(p),0)<.001)return null;
  const positions=[],uv=[],w=rect.maxX-rect.minX,d=rect.maxZ-rect.minZ;
  const add=(p,y,u,v)=>{positions.push(p.x,y,p.z);uv.push(u,v)};
  const capTri=(a,b,c,y,up)=>{
   const cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
   // Viewed from above (Y+), X/Z has reversed winding.
   if((cross>0)===up){const tmp=b;b=c;c=tmp;}
   for(const p of [a,b,c])add(p,y,(p.x-rect.minX)/w,(p.z-rect.minZ)/d);
  };
  for(const part of pieces)for(let i=1;i<part.length-1;i++){
   capTri(part[0],part[i],part[i+1],rect.maxY,true);
   capTri(part[0],part[i],part[i+1],rect.minY,false);
  }
  const side=(a,b)=>{
   const len=Math.hypot(a.x-b.x,a.z-b.z);
   if(len<1e-5)return;
   // DoubleSide material covers inward/outward normals on perimeter.
   const corners=[{p:a,y:rect.minY,u:0,v:0},{p:b,y:rect.maxY,u:len,v:1},
    {p:b,y:rect.minY,u:len,v:0},{p:a,y:rect.minY,u:0,v:0},
    {p:a,y:rect.maxY,u:0,v:1},{p:b,y:rect.maxY,u:len,v:1}];
   for(const c of corners)add(c.p,c.y,c.u,c.v);
  };
  // Room boundary clipped to the tile AABB: only its exposed pieces
  // become side faces, not every triangle interior (which causes z-fighting).
  const edges=[[{x:rect.minX,z:rect.minZ},{x:rect.maxX,z:rect.minZ}],
   [{x:rect.maxX,z:rect.minZ},{x:rect.maxX,z:rect.maxZ}],
   [{x:rect.maxX,z:rect.maxZ},{x:rect.minX,z:rect.maxZ}],
   [{x:rect.minX,z:rect.maxZ},{x:rect.minX,z:rect.minZ}]];
  function segmentIntersections(a,b,c,d){
   const ab={x:b.x-a.x,z:b.z-a.z},cd={x:d.x-c.x,z:d.z-c.z};
   const denominator=ab.x*cd.z-ab.z*cd.x;
   if(Math.abs(denominator)<1e-9)return null;
   const diff={x:c.x-a.x,z:c.z-a.z};
   const t=(diff.x*cd.z-diff.z*cd.x)/denominator;
   const u=(diff.x*ab.z-diff.z*ab.x)/denominator;
   return t>-1e-8&&t<1+1e-8&&u>-1e-8&&u<1+1e-8?t:null;
  }
  const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
  function inside(p){let ins=false;
   for(let i=0,j=contour.length-1;i<contour.length;j=i++){
    const a=contour[i],b=contour[j];
    if((a.z>p.z)!==(b.z>p.z)&&
       p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)ins=!ins;
   }return ins;
  }
  function within(p){return p.x>=rect.minX-1e-7&&p.x<=rect.maxX+1e-7&&
     p.z>=rect.minZ-1e-7&&p.z<=rect.maxZ+1e-7;}
  for(let i=0;i<contour.length;i++){
   const a=contour[i],b=contour[(i+1)%contour.length];
   const ts=[0,1];
   for(const [c,d] of edges){const t=segmentIntersections(a,b,c,d);
    if(t!==null)ts.push(Math.max(0,Math.min(1,t)));}
   ts.sort((x,y)=>x-y);
   for(let j=0;j<ts.length-1;j++){
    if(ts[j+1]-ts[j]<1e-7)continue;
    const p=lerp(a,b,ts[j]),q=lerp(a,b,ts[j+1]);
    const mid=lerp(p,q,.5);
    if(!within(mid))continue;
    // The matching rectangle edge will provide this side once.
    if(edges.some(([c,d])=>{
     const sideLen=Math.hypot(d.x-c.x,d.z-c.z);
     return Math.abs((d.x-c.x)*(p.z-c.z)-(d.z-c.z)*(p.x-c.x))/sideLen<1e-5&&
       Math.abs((d.x-c.x)*(q.z-c.z)-(d.z-c.z)*(q.x-c.x))/sideLen<1e-5;
    }))continue;
    side(p,q);
   }
  }
  for(const [a,b] of edges){
   const ts=[0,1];
   for(let i=0;i<contour.length;i++){
    const t=segmentIntersections(a,b,contour[i],contour[(i+1)%contour.length]);
    if(t!==null)ts.push(Math.max(0,Math.min(1,t)));
   }
   ts.sort((x,y)=>x-y);
   for(let i=0;i<ts.length-1;i++){
    if(ts[i+1]-ts[i]<1e-7)continue;
    const p=lerp(a,b,ts[i]),q=lerp(a,b,ts[i+1]);
    if(inside(lerp(p,q,.5)))side(p,q);
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
 }
 function apply(root,raw){
  const edit=normalize(raw);
  if(!edit.enabled&&!edit.cuts?.length&&!edit.contour)return {ok:true,changed:false};
  const mesh=root.children.find(child=>child.isMesh&&child.geometry?.attributes?.position);
  if(!mesh)return {ok:false,reason:'Не найдена геометрия плиты'};
  mesh.geometry.computeBoundingBox();
  const b=mesh.geometry.boundingBox;
  const rect={minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};
  if(rect.maxX-rect.minX<.01||rect.maxZ-rect.minZ<.01||rect.maxY-rect.minY<.001)
   return {ok:false,reason:'Деталь не является объёмной плитой'};
  const poly=clipPolygon([{x:rect.minX,z:rect.minZ},{x:rect.maxX,z:rect.minZ},
   {x:rect.maxX,z:rect.maxZ},{x:rect.minX,z:rect.maxZ}],edit);
  if(poly.length<3||polygonArea(poly)<.001)
   return {ok:false,reason:'Все края плиты обрезаны. Проверь выбранные стены и направление срезов'};
  const geometry=edit.contour?contourSlab(rect,edit.contour):createSlab(rect,poly);
  if(!geometry)return {ok:false,reason:'Контур не пересекает плиту'};
  mesh.geometry.dispose();mesh.geometry=geometry;
  return {ok:true,changed:true,area:edit.contour?
   contourFragments(rect,edit.contour).reduce((v,p)=>v+polygonArea(p),0):polygonArea(poly),
   vertices:edit.contour?.length||poly.length};
 }
 return {normalize,normalizeCuts,normalizeContour,polygonArea,clipHalfPlane,clipPolygon,contourFragments,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FloorClip;
