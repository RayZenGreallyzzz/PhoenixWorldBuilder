/* Preview placement validation. Offline; conservative broad-phase for imported GLB. */
const BuildPlacementValidator=(()=>{
 const EPS=.025;
 const rectCache=new WeakMap();
 const structural=new Set(['foundation','wall','corner','door','ceiling','roof','stairs']);
 const wallLike=new Set(['wall','corner','door']);
 const decorative=new Set(['prop','decor','decoration','ceiling_finish','overlay','foliage']);
 const category=(w,e)=>e.data?.category||w.categoryForKind?.(e.kind)||e.kind;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const finite=v=>Number.isFinite(v);
 function localBounds(root){
  if(typeof BuildSnap!=='undefined')return BuildSnap.attrBounds(root);
  const out=new THREE.Box3().makeEmpty();
  root.updateMatrixWorld(true,true);
  const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   if(!obj.geometry.boundingBox)obj.geometry.computeBoundingBox();
   if(!obj.geometry.boundingBox)return;
   matrix.multiplyMatrices(inverse,obj.matrixWorld);
   const b=obj.geometry.boundingBox;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])
    out.expandByPoint(p.set(x,y,z).applyMatrix4(matrix));
  });
  return out;
 }
 function rect(root) {
  root.updateMatrixWorld(true,true);
  const mat=root.matrixWorld.elements,prior=rectCache.get(root);
  if(prior&&prior.matrix.every((v,i)=>v===mat[i]))return prior.rect;
  const box=localBounds(root);
  if(box.isEmpty())return null;
  const mx=root.matrixWorld,mid=(box.min.y+box.max.y)/2;
  const points=[];
  for(const [x,z] of [[box.min.x,box.min.z],[box.max.x,box.min.z],[box.max.x,box.max.z],[box.min.x,box.max.z]]){
   const p=new THREE.Vector3(x,mid,z).applyMatrix4(mx);
   points.push([p.x,p.z]);
  }
  const top=new THREE.Vector3(0,box.max.y,0).applyMatrix4(mx).y;
  const bottom=new THREE.Vector3(0,box.min.y,0).applyMatrix4(mx).y;
  let cx=0,cz=0;for(const [x,z] of points){cx+=x/4;cz+=z/4;}
  const width=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);
  const length=Math.hypot(points[3][0]-points[0][0],points[3][1]-points[0][1]);
  const area=Math.max(.00001,width*length);
  const value={points,cx,cz,top:Math.max(top,bottom),bottom:Math.min(top,bottom),width,length,area};
  rectCache.set(root,{matrix:mat.slice(),rect:value});
  return value;
 }
 function projected(points,axis){
  let low=Infinity,high=-Infinity;
  for(const [x,z] of points){const v=x*axis[0]+z*axis[1];low=Math.min(low,v);high=Math.max(high,v)}
  return [low,high];
 }
 function penetration(a,b){
  const axes=[];
  for(const shape of [a,b])for(const [i,j] of [[0,1],[0,3]]){
   const edge=[shape.points[j][0]-shape.points[i][0],shape.points[j][1]-shape.points[i][1]];
   const n=Math.hypot(edge[0],edge[1]);
   if(n>1e-6)axes.push([-edge[1]/n,edge[0]/n]);
  }
  let minimum=Infinity;
  for(const axis of axes){
   const x=projected(a.points,axis),y=projected(b.points,axis);
   const overlap=Math.min(x[1],y[1])-Math.max(x[0],y[0]);
   if(overlap<=EPS)return {touch:true,depth:0};
   minimum=Math.min(minimum,overlap);
  }
  return {touch:false,depth:minimum};
 }
 function collisionCandidate(a,b,catA,catB,solved,other){
  const vertical=Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom);
  if(vertical<=EPS)return false;
  const sat=penetration(a,b);
  if(sat.touch)return false;
  // Different modules are allowed to join or deliberately overlay:
  // walls meet floors; stairways meet landings; roofs rest on walls/ceilings.
  const isWall=wallLike.has(catA)&&wallLike.has(catB);
  const same=catA===catB || isWall;
  if(!same)return false;
  if((solved.corner||solved.stacked||solved.wallEnd)&&
     other.data?.id===solved.reference&&isWall){
   // End joints and L-shaped corners legitimately touch/overlap a wall by
   // their thickness. They must not be made red by broad-phase GLB bounds.
   return false;
  }
  const yFraction=vertical/Math.max(.01,Math.min(a.top-a.bottom,b.top-b.bottom));
  if(yFraction<.3)return false;
  const centerDistance=Math.hypot(a.cx-b.cx,a.cz-b.cz);
  const footprint=Math.max(.01,Math.min(a.width,a.length,b.width,b.length));
  // High-confidence clashes only. Arbitrary nonrectangular GLBs (such as
  // diagonally trimmed slabs and sloped roofs) get a large safety margin.
  if(catA==='foundation'&&catB==='foundation'){
   return sat.depth>=Math.max(.17,footprint*.50) &&
    centerDistance<Math.max(a.width,a.length,b.width,b.length)*.62;
  }
  if(isWall){
   // Perpendicular wall crossings at a corner are legal; duplicate overlapping
   // panels are not. Use the long wall direction to determine parallelism.
   function tangent(r){
    const e=r.width>=r.length?
     [r.points[1][0]-r.points[0][0],r.points[1][1]-r.points[0][1]]:
     [r.points[3][0]-r.points[0][0],r.points[3][1]-r.points[0][1]];
    const d=Math.hypot(e[0],e[1])||1;return [e[0]/d,e[1]/d];
   }
   const u=tangent(a),v=tangent(b);
   if(Math.abs(u[0]*v[0]+u[1]*v[1])<.82)return false;
   const longA=Math.max(a.width,a.length),longB=Math.max(b.width,b.length);
   return centerDistance<Math.min(longA,longB)*.55 &&
    sat.depth>Math.max(.07,footprint*.35);
  }
  if(['ceiling','roof','stairs'].includes(catA)){
   return sat.depth>Math.max(.22,footprint*.52) &&
    centerDistance<Math.min(Math.max(a.width,a.length),Math.max(b.width,b.length))*.60;
  }
  return false;
 }
 function validate(w,solved,root=w.ghost){
  if(!root)return {...solved,valid:false,reason:'Деталь ещё не загружена'};
  if(solved.valid===false)return {...solved,reason:solved.missingTarget||'Не найдено место для стыковки'};
  const cat=solved.category||w.placementCategory||w.categoryForKind?.(w.placement)||'prop';
  // Paint/decor should not be blocked by deliberate layering on existing
  // surfaces. Also respect the already exposed "Free" placement mode.
  if(w.joinMode==='free'||decorative.has(cat)||!structural.has(cat))
   return {...solved,valid:true,reason:w.joinMode==='free'?'Свободная установка':'Декор можно накладывать поверх основы'};
  if((cat==='roof'||cat==='ceiling')&&w.smartSnap!==false&&!solved.snapped&&w.objects?.length){
   return {...solved,valid:false,reason:cat==='roof'?'Не найдена опора для крыши':'Не найдены стены или опора для перекрытия'};
  }
  const a=rect(root);
  if(!a)return {...solved,valid:false,reason:'У детали нет геометрии для проверки'};
  if(![a.cx,a.cz,a.top,a.bottom].every(finite))
   return {...solved,valid:false,reason:'Некорректные координаты GLB'};
  // Curved walls have large empty AABBs. A box/box overlap along their curve
  // is NOT a real intersection. Only reject an identical curve placed twice.
  const curvy=typeof BuildCurves!=='undefined'&&BuildCurves.isArc(w.placement);
  if(curvy){
   for(const entry of w.objects||[]){
    if(entry.kind!==w.placement)continue;
    const samePosition=entry.mesh.position.distanceTo(root.position)<.035;
    let turn=Math.abs((entry.mesh.rotation.y-root.rotation.y)%(Math.PI*2));
    turn=Math.min(turn,Math.PI*2-turn);
    if(samePosition&&turn<.03)
     return {...solved,valid:false,reason:'Этот полукруглый модуль уже установлен'};
   }
   return {...solved,valid:true,reason:solved.curveJoin?'Торцы дуги и стены состыкованы':
    solved.snapped?'Дуга привязана к опоре':'Свободное расположение дуги'};
  }
  // Only reject obviously duplicated structural volume, never edges touching.
  for(const entry of w.objects||[]){
   if(entry===w.moveTarget)continue;
   const otherType=category(w,entry);
   if(decorative.has(otherType)||!structural.has(otherType))continue;
   if(!(cat===otherType||(wallLike.has(cat)&&wallLike.has(otherType))))continue;
   // Fast broad phase using pivot and localized bounds. Covers GLB offset pivots
   // without scanning every polygon in the scene.
   const b=rect(entry.mesh);
   if(!b)continue;
   const dy=Math.max(0,Math.max(a.bottom-b.top,b.bottom-a.top));
   if(dy>EPS)continue;
   const reach=Math.max(a.width,a.length)+Math.max(b.width,b.length);
   if(Math.hypot(a.cx-b.cx,a.cz-b.cz)>reach)continue;
   if(typeof BuildCurves!=='undefined'&&BuildCurves.isArc(entry.kind))continue;
   if(collisionCandidate(a,b,cat,otherType,solved,entry))
    return {...solved,valid:false,reason:'Место занято другой деталью',obstacle:entry.data?.id};
  }
  return {...solved,valid:true,reason:solved.curveJoin?'Прямая стена состыкована с дугой':
   solved.corner?'Угол состыкован':
   solved.stacked?'Стена установится сверху':
   solved.slab?'Пол пристыкуется по толщине':
   solved.overhead?'Перекрытие выровнено':
   solved.snapped?'Магнитная привязка':
   'Установка по сетке'};
 }
 return {validate,rect,penetration};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildPlacementValidator;
