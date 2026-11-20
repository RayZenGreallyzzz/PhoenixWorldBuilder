/* Phoenix Builder UV28: instance-only, persistent shape cuts in X/Z.
 * Clip the real mesh triangles with MeshCaps; no transparent masks.
 * Source assets and per-part materials are never modified.
 */
const ShapeCrop=(()=>{
 'use strict';
 const limit=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
 const normalize=(value)=>{
  if(!value||value.enabled!==true)return {enabled:false};
  const shape=['circle','rectangle','hex','star'].includes(value.shape)?value.shape:'circle';
  const mode=value.mode==='remove'?'remove':'keep';
  return {enabled:true,shape,mode,
   width:limit(value.width,.15,100,2),depth:limit(value.depth,.15,100,2),
   centerX:limit(value.centerX,-100,100,0),centerZ:limit(value.centerZ,-100,100,0),
   angle:limit(value.angle,-360,360,0)};
 };
 const polygon=(e)=>{
  const count=e.shape==='rectangle'?4:e.shape==='hex'?6:e.shape==='star'?10:20;
  const out=[],rot=e.angle*Math.PI/180;
  if(e.shape==='rectangle'){
   const ca=Math.cos(rot),sa=Math.sin(rot),hx=e.width*.5,hz=e.depth*.5;
   return [[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>({
    x:e.centerX+x*ca-z*sa,z:e.centerZ+x*sa+z*ca
   }));
  }
  for(let i=0;i<count;i++){
   const a=2*Math.PI*i/count+rot;
   const star=e.shape==='star'&&(i%2)===1?.46:1;
   out.push({x:e.centerX+e.width*.5*star*Math.cos(a),
    z:e.centerZ+e.depth*.5*star*Math.sin(a)});
  }
  return out;
 };
 const area=(points)=>points.reduce((sum,p,i)=>{
  const next=points[(i+1)%points.length];return sum+p.x*next.z-next.x*p.z;
 },0);
 const planes=(points)=>{
  const sign=area(points)>=0?1:-1;
  return points.map((p,i)=>{
   const q=points[(i+1)%points.length],dx=q.x-p.x,dz=q.z-p.z;
   const len=Math.hypot(dx,dz)||1,nx=-dz/len*sign,nz=dx/len*sign;
   return {nx,nz,offset:nx*p.x+nz*p.z};
  });
 };
 const regions=(e)=>{
  const points=polygon(e);
  if(e.shape==='star'){
   // Convex triangles tessellate the concave star without overlapping volumes.
   const tri=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]);
   return tri.map(face=>planes(face.map(i=>points[i])));
  }
  const ps=planes(points);
  if(e.mode==='keep')return [ps];
  // A disjoint decomposition of the area OUTSIDE a convex polygon:
  // fail first plane OR (pass first AND fail second) OR ...
  // The circle can be centred on the edge of a roof to make a semicircular notch.
  return ps.map((p,i)=>[...ps.slice(0,i),{nx:-p.nx,nz:-p.nz,offset:-p.offset}]);
 };
 const triangleCount=root=>{
  let tris=0,error=null;
  root.traverse(m=>{
   if(error||!m.isMesh)return;
   if(m.isSkinnedMesh||m.geometry?.morphAttributes&&
     Object.values(m.geometry.morphAttributes).some(a=>a?.length)){
    error='Скелетные модели и морфы фигурно не обрезаются';return;
   }
   const p=m.geometry?.attributes?.position;
   if(!p||p.itemSize!==3){error='Неподдерживаемая геометрия модуля';return}
   if(m.geometry?.attributes?.normal?.itemSize!==3){error='Необычные нормали';return}
   tris+=(m.geometry.index?.count||p.count)/3;
  });
  return {tris,error};
 };
 function apply(root,raw){
  const e=normalize(raw);
  if(!e.enabled)return {ok:true,changed:false};
  if(e.shape==='star'&&e.mode==='remove')return {ok:false,reason:'Вырезание звезды пока недоступно — можно оставить форму звезды'};
  if(typeof MeshCaps==='undefined')return {ok:false,reason:'Не загружен модуль обрезки сеток'};
  const {tris,error}=triangleCount(root);
  if(error)return {ok:false,reason:error};
  if(!tris)return {ok:false,reason:'Нет треугольников'};
  const parts=regions(e);
  // Multiple fragments are expensive on tablets. Reject early; do not risk a freeze.
  if(tris> (parts.length>1?12000:60000))return {ok:false,reason:
   'Слишком сложный модуль для этой фигурной подрезки ('+Math.ceil(tris)+' треугольников). Попробуй отдельную деталь.'};
  // Work entirely on cloned meshes and commit only if a valid result exists.
  root.updateWorldMatrix(true,true);
  const kept=[];let faces=0,open=false;
  for(const ps of parts){
   const part=root.clone(true);
   part.position.set(0,0,0);part.quaternion.identity();part.scale.set(1,1,1);
   part.updateMatrixWorld(true);
   const result=MeshCaps.run(part,{axis:'x',cutStart:0,cutEnd:0,planeCuts:ps},new THREE.Box3());
   if(!result.ok)continue; // This fragment is outside the original module.
   part.name='shape-cut-fragment-'+(kept.length+1);
   kept.push(part);faces+=result.triangles;open=open||result.openCut;
   if(faces>240000||kept.length>24)return {ok:false,reason:'Фигурная подрезка слишком сложна для планшета'};
  }
  if(!kept.length)return {ok:false,reason:'Форма не пересекает выбранную деталь — измени размер или положение'};
  root.clear();
  for(const part of kept)root.add(part);
  return {ok:true,changed:true,triangles:faces,openCut:open,parts:kept.length};
 }
 return {normalize,polygon,planes,regions,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShapeCrop;
