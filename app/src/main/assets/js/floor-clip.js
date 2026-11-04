/* Phoenix Builder: closed, angled cuts for the built-in floor/slab.
 * Coordinates are in the unscaled module's local X/Z plane (metres).
 * Each apply acts on a newly cloned floor so no catalog geometry is changed.
 */
const FloorClip=(()=>{
 'use strict';
 const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
 const normalize=raw=>{
  const e=raw||{};
  return {enabled:e.enabled===true,angle:Math.max(-180,Math.min(180,finite(e.angle,0))),
   offset:Math.max(-2.8,Math.min(2.8,finite(e.offset,0))),
   side:e.side==='greater'?'greater':'less'};
 };
 const polygonArea=poly=>Math.abs(poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];return sum+p.x*q.z-q.x*p.z;
 },0))*.5;
 function clipPolygon(poly,raw){
  const e=normalize(raw),rad=e.angle*Math.PI/180,nx=Math.cos(rad),nz=Math.sin(rad);
  if(!e.enabled)return poly.map(p=>({...p}));
  const signed=p=>(nx*p.x+nz*p.z-e.offset)*(e.side==='less'?-1:1);
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
  const deduped=out.filter((p,i)=>!i||Math.hypot(p.x-out[i-1].x,p.z-out[i-1].z)>1e-6);
  if(deduped.length>1&&Math.hypot(deduped[0].x-deduped[deduped.length-1].x,deduped[0].z-deduped[deduped.length-1].z)<1e-6)deduped.pop();
  return deduped;
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
   tri(poly[0],poly[i+1],poly[i],rect.maxY); // top +Y
   tri(poly[0],poly[i],poly[i+1],rect.minY); // bottom -Y
  }
  let perimeter=0;
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],len=Math.hypot(b.x-a.x,b.z-a.z);
   const corner=(p,y,u)=>{points.push(p.x,y,p.z);uv.push(u,(y-rect.minY)/(rect.maxY-rect.minY))};
   // The polygon winds CCW in XZ; side triangles wind outward.
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
 function apply(root,raw){
  const edit=normalize(raw);
  if(!edit.enabled)return {ok:true,changed:false};
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
   return {ok:false,reason:'Линия полностью отрезает плиту; измени угол или смещение'};
  const geometry=createSlab(rect,poly);
  mesh.geometry.dispose();mesh.geometry=geometry;
  return {ok:true,changed:true,area:polygonArea(poly),vertices:poly.length};
 }
 return {normalize,clipPolygon,polygonArea,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FloorClip;
