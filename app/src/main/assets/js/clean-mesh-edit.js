/* Small, safe mesh workshop for imported static GLB models.
 * Plane trimming physically removes triangles, and centerline bend creates
 * actual curved geometry. Source GLB/template is NEVER modified.
 * First revision: trimmed boundaries are open, no boolean caps. Reject skin
 * meshes, morphs, oversized models and unsafe exotic attributes.
 */
const CleanMeshEdit=(()=>{
 const permitted=['x','y','z'];
 const axes={x:0,y:1,z:2};
 const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
 const normalize=source=>{
  const e=source||{};
  return {axis:permitted.includes(e.axis)?e.axis:'x',
   cutStart:cap(Number(e.cutStart)||0,0,90),
   cutEnd:cap(Number(e.cutEnd)||0,0,90),
   bendAxis:e.bendAxis==='z'?'z':'x',
   bend:cap(Number(e.bend)||0,-180,180)};
 };
 const active=e=>!!e&&(Number(e.bend)||0)!==0||
  (Number(e?.cutStart)||0)>0||(Number(e?.cutEnd)||0)>0;
 function check(root){
  let triangles=0,error=null;
  root.traverse(m=>{
   if(error||!m.isMesh)return;
   const g=m.geometry;
   if(m.isSkinnedMesh||g?.morphAttributes&&Object.values(g.morphAttributes).some(a=>a?.length)){
    error='Редактирование скелетных моделей и морфов пока недоступно';return;
   }
   if(!g?.attributes?.position){error='У одной из деталей нет вершин';return}
   const pos=g.attributes.position;
   if(pos.itemSize!==3||!Number.isFinite(pos.count)){error='Некорректная геометрия GLB';return}
   if(g.attributes.uv?.itemSize!==2||g.attributes.color&&g.attributes.color.itemSize!==3){
    if(g.attributes.uv||g.attributes.color){error='Необычные UV или цвета вершин не поддерживаются';return}
   }
   triangles+=(g.index?.count||pos.count)/3;
  });
  if(triangles>90000)error='Слишком много треугольников для правки на планшете';
  return {ok:!error,reason:error,triangles};
 }
 // Shared root-space bounds for cutting and global bending over multi-mesh GLB.
 const bounds=root=>{
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();
  const box=new THREE.Box3();
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry)return;
   const g=mesh.geometry;
   if(!g.boundingBox)g.computeBoundingBox();
   matrix.multiplyMatrices(inverse,mesh.matrixWorld);
   box.union(g.boundingBox.clone().applyMatrix4(matrix));
  });
  return box;
 };
 function interpolate(a,b,t){
  const lerp=(arr,other)=>arr.map((n,i)=>n*(1-t)+other[i]*t);
  return {p:lerp(a.p,b.p),uv:a.uv&&b.uv?lerp(a.uv,b.uv):null,
   color:a.color&&b.color?lerp(a.color,b.color):null};
 }
 function halfPlane(poly,axis,direction,threshold){
  if(!poly.length)return [];
  const out=[];let a=poly[poly.length-1],va=direction*(a.p[axis]-threshold);
  for(const b of poly){
   const vb=direction*(b.p[axis]-threshold);
   if((va>=-1e-7)!==(vb>=-1e-7)){
    const difference=b.p[axis]-a.p[axis];
    const t=Math.abs(difference)<1e-12?.5:(threshold-a.p[axis])/difference;
    out.push(interpolate(a,b,cap(t,0,1)));
   }
   if(vb>=-1e-7)out.push(b);
   a=b;va=vb;
  }
  return out;
 }
 function subdivide(tri,axis,length,depth,limit){
  if(depth<=0)return [tri];
  const [a,b,c]=tri;
  const pairs=[[a,b,c],[b,c,a],[c,a,b]].map(([u,v,other])=>({
   u,v,other,delta:Math.abs(u.p[axis]-v.p[axis])
  })).sort((l,r)=>r.delta-l.delta);
  const best=pairs[0];if(best.delta<=limit)return [tri];
  const mid=interpolate(best.u,best.v,.5);
  return [...subdivide([best.u,mid,best.other],axis,length,depth-1,limit),
   ...subdivide([mid,best.v,best.other],axis,length,depth-1,limit)];
 }
 function bendVertex(v,axis,box,angle){
  if(Math.abs(angle)<1e-7)return v.p;
  const p=v.p.slice(),idx=axes[axis],across=axes[axis==='x'?'z':'x'];
  const origin=box.min[axis],len=box.max[axis]-origin;
  if(len<1e-7)return p;
  const crossMin=box.min[axis==='x'?'z':'x'];
  const crossMax=box.max[axis==='x'?'z':'x'];
  const center=(crossMin+crossMax)/2;
  const theta=angle*(p[idx]-origin)/len, radius=len/angle;
  const lateral=p[across]-center;
  p[idx]=origin+(radius-lateral)*Math.sin(theta);
  p[across]=center+radius*(1-Math.cos(theta))+lateral*Math.cos(theta);
  return p;
 }
 function apply(root,rawEdit){
  const edit=normalize(rawEdit);
  if(edit.cutStart+edit.cutEnd>94)
   return {ok:false,reason:'Сумма обрезки с двух сторон не может превышать 94%'};
  if(!active(edit))return {ok:true,triangles:0,changed:false};
  const validation=check(root);
  if(!validation.ok)return validation;
  const box=bounds(root);
  if(box.isEmpty())return {ok:false,reason:'Пустая модель'};
  const cutAxis=axes[edit.axis],min=box.min[edit.axis],span=box.max[edit.axis]-min;
  if(span<1e-5)return {ok:false,reason:'Модель слишком тонкая по выбранной оси'};
  const lower=min+span*edit.cutStart/100,upper=box.max[edit.axis]-span*edit.cutEnd/100;
  const bendAxis=axes[edit.bendAxis];
  const bendLength=box.max[edit.bendAxis]-box.min[edit.bendAxis];
  if(edit.bend&&bendLength<.05)return {ok:false,reason:'Недостаточная длина для сгибания'};
  const wantBend=Math.abs(edit.bend)>1e-5,bendRadian=edit.bend*Math.PI/180;
  const invWorld=root.matrixWorld.clone().invert(),toRoot=new THREE.Matrix4();
  const inverse=new THREE.Matrix4(),p=new THREE.Vector3();
  let total=0;
  const prepared=[];
  let error=null;
  root.traverse(mesh=>{
   if(error||!mesh.isMesh)return;
   const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
   toRoot.multiplyMatrices(invWorld,mesh.matrixWorld);
   inverse.copy(toRoot).invert();
   const nativeUV=geometry.attributes.uv,nativeColor=geometry.attributes.color;
   const outP=[],outUV=[],outC=[],groups=[];
   const count=index?index.count:position.count;
   const depth=validation.triangles<400?7:validation.triangles<3000?5:validation.triangles<15000?3:1;
   const limit=bendLength/18;
   function vertex(vertexIndex){
    p.set(position.getX(vertexIndex),position.getY(vertexIndex),position.getZ(vertexIndex))
     .applyMatrix4(toRoot);
    return {p:[p.x,p.y,p.z],
     uv:nativeUV?[nativeUV.getX(vertexIndex),nativeUV.getY(vertexIndex)]:null,
     color:nativeColor?[nativeColor.getX(vertexIndex),nativeColor.getY(vertexIndex),
      nativeColor.getZ(vertexIndex)]:null};
   }
   const sourceGroups=geometry.groups||[];
   function materialAt(n){
    for(const g of sourceGroups)if(n>=g.start&&n<g.start+g.count)return g.materialIndex||0;
    return 0;
   }
   for(let t=0;t+2<count;t+=3){
    const tri=[vertex(index?index.getX(t):t),vertex(index?index.getX(t+1):t+1),
     vertex(index?index.getX(t+2):t+2)];
    const trimmed=halfPlane(halfPlane(tri,cutAxis,1,lower),cutAxis,-1,upper);
    if(trimmed.length<3)continue;
    for(let k=1;k+1<trimmed.length;k++){
     const subs=wantBend?subdivide([trimmed[0],trimmed[k],trimmed[k+1]],
      bendAxis,bendLength,depth,limit):[[trimmed[0],trimmed[k],trimmed[k+1]]];
     for(const triangle of subs){
      if(total++>240000){error='Результат слишком сложный для планшета';break}
      const start=outP.length/3;
      for(const v of triangle){
       const moved=bendVertex(v,edit.bendAxis,box,bendRadian);
       p.set(...moved).applyMatrix4(inverse);
       outP.push(p.x,p.y,p.z);
       if(nativeUV)outUV.push(...(v.uv||[0,0]));
       if(nativeColor)outC.push(...(v.color||[1,1,1]));
      }
      const material=materialAt(t),last=groups[groups.length-1];
      if(last&&last.materialIndex===material&&last.start+last.count===start)
       last.count+=3;
      else groups.push({start,count:3,materialIndex:material});
     }
     if(error)break;
    }
    if(error)break;
   }
   if(error)return;
   const g=new THREE.BufferGeometry();
   if(!outP.length){error='Обрезка полностью удалила геометрию';return}
   g.setAttribute('position',new THREE.Float32BufferAttribute(outP,3));
   if(nativeUV)g.setAttribute('uv',new THREE.Float32BufferAttribute(outUV,2));
   if(nativeColor)g.setAttribute('color',new THREE.Float32BufferAttribute(outC,3));
   for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);
   g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
   prepared.push({mesh,geometry:g});
  });
  if(error){for(const item of prepared)item.geometry.dispose();return {ok:false,reason:error}}
  for(const item of prepared)item.mesh.geometry=item.geometry;
  root.updateWorldMatrix(true,true);
  return {ok:true,changed:true,triangles:total,openCut:edit.cutStart>0||edit.cutEnd>0};
 }
 return {normalize,active,check,bounds,apply};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CleanMeshEdit;
