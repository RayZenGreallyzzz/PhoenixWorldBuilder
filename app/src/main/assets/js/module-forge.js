/* Legacy Builder: a SINGLE imported GLB bent/fitted to the standard
 * construction centreline. No tiled copies, no extra geometry strips.
 * All source objects and GLB buffers remain untouched. UV is parameterized
 * exactly once over the new physical profile.
 * Supports static triangles with optional UV / vertex colors; safely rejects
 * rigged or morph-target meshes and complex animated meshes.
 */
const ModuleForge=(()=>{
 const profiles=['straight','corner','arc90','arc180'];
 const uses=['wall','foundation','roof'];
 const base={wall:{long:2,height:2.6,width:.22},
  foundation:{long:2,height:.17,width:2},
  roof:{long:1.65,height:1.3,width:2.5}};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const safe=(shape,use)=>profiles.includes(shape)&&uses.includes(use);
 function param(shape,use){
  const def=base[use],angle=shape==='arc90'?Math.PI/2:shape==='arc180'?Math.PI:0;
  return {angle,def};
 }
 function boxInRoot(root){
  root.updateMatrixWorld(true);
  const inv=root.matrixWorld.clone().invert(),m=new THREE.Matrix4(),box=new THREE.Box3();
  root.traverse(child=>{
   if(!child.isMesh||!child.geometry?.attributes?.position)return;
   if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
   m.multiplyMatrices(inv,child.matrixWorld);
   box.union(child.geometry.boundingBox.clone().applyMatrix4(m));
  });
  return box;
 }
 function validate(root){
  if(!root||!root.traverse)return {ok:false,reason:'Нет модели'};
  let count=0,triangles=0,reason=null;
  root.traverse(obj=>{
   if(!obj.isMesh||reason)return;
   count++;const g=obj.geometry,p=g?.attributes?.position;
   if(obj.isSkinnedMesh||g?.morphAttributes&&Object.values(g.morphAttributes).some(v=>v?.length))
    reason='Скелетные и морфированные GLB не преобразуются этим инструментом';
   else if(!p||p.itemSize!==3)reason='Нет треугольной геометрии';
   else if(g.attributes.color&&g.attributes.color.itemSize!==3)
    reason='Нестандартные цвета вершин GLB';
   else if(g.attributes.uv&&g.attributes.uv.itemSize!==2)
    reason='Нестандартная UV-развёртка GLB';
   else triangles+=(g.index?.count||p.count)/3;
  });
  if(!reason&&!count)reason='В файле нет меша';
  if(!reason&&triangles>45000)reason='Слишком тяжёлая модель для изгиба на Android';
  return {ok:!reason,reason,triangles,meshes:count};
 }
 function modelPoint(use,shape,u,v,across){
  const cfg=base[use];
  if(shape==='straight'){
   if(use==='wall')return [cfg.long*(u-.5),cfg.height*v,cfg.width*across];
   if(use==='roof')return [cfg.width*across,cfg.height*v,cfg.long*(u-.5)];
   return [cfg.long*(u-.5),cfg.height*v,cfg.width*across];
  }
  const arc=shape==='arc90'?Math.PI/2:shape==='arc180'?Math.PI:0;
  const total=arc?(2*arc):4;  // standard radius 2m
  let x,z,nx,nz;
  if(arc){
   const t=u*arc;
   x=2*Math.cos(t);z=2*Math.sin(t);nx=Math.cos(t);nz=Math.sin(t);
  }else{
   const along=u*total;
   if(along<=2){x=-2+along;z=0;nx=0;nz=1;}
   else{x=0;z=-(along-2);nx=1;nz=0;}
  }
  const width=use==='wall'?.22:use==='roof'?2.5:2;
  const offset=across*width;
  if(use==='foundation'){
   // Floor tiles form a solid quarter/semicircular sector rather than a
   // wall-shaped narrow band. across in [-.5,+.5] is a radial [0,2m] span.
   if(arc){
    const radius=1+across*2;
    return [radius*Math.cos(u*arc),cfg.height*v,radius*Math.sin(u*arc)];
   }
   // L-corner floor tile: two joined 2m-wide arms.
   return [x+nx*(across*2),cfg.height*v,z+nz*(across*2)];
  }
  return [x+nx*offset,cfg.height*v,z+nz*offset];
 }
 function build(root,shape,use){
  if(!safe(shape,use))return {ok:false,reason:'Неизвестный тип строительного модуля'};
  const tested=validate(root);if(!tested.ok)return tested;
  const bounds=boxInRoot(root),dimensions=bounds.getSize(new THREE.Vector3());
  if(bounds.isEmpty()||dimensions.x<.003||dimensions.y<.003||dimensions.z<.003)
   return {ok:false,reason:'У исходного GLB не определены X/Y/Z'};
  const alongAxis=use==='roof'?'z':'x';
  const acrossAxis=use==='roof'?'x':'z';
  const length=dimensions[alongAxis],centre=(bounds.min[acrossAxis]+bounds.max[acrossAxis])/2;
  const uOf=p=>(p[alongAxis]-bounds.min[alongAxis])/length;
  const vOf=p=>(p.y-bounds.min.y)/dimensions.y;
  const acOf=p=>(p[acrossAxis]-centre)/dimensions[acrossAxis];
  // A curved wall must be smoothly tessellated even if source is just a
  // six-sided cuboid. Splitting triangles avoids straight polygon bridges.
  const splits=shape==='straight'?1:shape==='corner'?8:32;
  const threshold=1/splits;
  const sourceMeshes=[];root.updateMatrixWorld(true);
  const invRoot=root.matrixWorld.clone().invert();
  root.traverse(mesh=>{if(mesh.isMesh)sourceMeshes.push(mesh)});
  const output=[],cache=new THREE.Matrix4(),localToMesh=new THREE.Matrix4(),temp=new THREE.Vector3();
  let total=0;
  for(const mesh of sourceMeshes){
   const source=mesh.geometry,position=source.attributes.position,
    uv=source.attributes.uv,color=source.attributes.color,index=source.index;
   cache.multiplyMatrices(invRoot,mesh.matrixWorld);
   localToMesh.copy(cache).invert();
   const vertices=[],uvs=[],colors=[],fitted=[],groups=[];
   const count=index?index.count:position.count;
   const groupMaterial=t=>{
    for(const g of source.groups||[])
     if(t>=g.start&&t<g.start+g.count)return g.materialIndex||0;
    return 0;
   };
   const read=i=>{
    temp.set(position.getX(i),position.getY(i),position.getZ(i)).applyMatrix4(cache);
    const p=temp.clone();
    return {p,u:clamp(uOf(p),0,1),v:clamp(vOf(p),0,1),a:clamp(acOf(p),-.5,.5),
     uv:uv?[uv.getX(i),uv.getY(i)]:null,
     color:color?[color.getX(i),color.getY(i),color.getZ(i)]:null};
   };
   const midpoint=(a,b)=>{
    const blend=(x,y)=>x&&y?x.map((v,i)=>(v+y[i])/2):null;
    return {p:a.p.clone().add(b.p).multiplyScalar(.5),u:(a.u+b.u)/2,
     v:(a.v+b.v)/2,a:(a.a+b.a)/2,uv:blend(a.uv,b.uv),color:blend(a.color,b.color)};
   };
   const split=(tri,depth)=>{
    if(depth<=0)return [tri];
    const ab=Math.abs(tri[0].u-tri[1].u),bc=Math.abs(tri[1].u-tri[2].u),
     ca=Math.abs(tri[2].u-tri[0].u);
    const span=Math.max(ab,bc,ca);
    if(span<=threshold+.00001)return [tri];
    let a,b,c;
    if(span===ab){[a,b,c]=tri;}
    else if(span===bc){[a,b,c]=[tri[1],tri[2],tri[0]];}
    else {[a,b,c]=[tri[2],tri[0],tri[1]];}
    const mid=midpoint(a,b);
    return [...split([a,mid,c],depth-1),...split([mid,b,c],depth-1)];
   };
   function addTriangle(tri,matIndex){
    if(total++>190000)throw Error('Получилось слишком много полигонов для планшета');
    const start=vertices.length/3;
    for(const vertex of tri){
     const [x,y,z]=modelPoint(use,shape,vertex.u,vertex.v,vertex.a);
     temp.set(x,y,z).applyMatrix4(localToMesh);
     vertices.push(temp.x,temp.y,temp.z);
     // One original image spans the entire fitted module, not copies.
     // Retain original texture sampling as first choice where UVs exist,
     // but map source U/V to normalized physical coordinates for the
     // user-selected "one source fitted" mode and for saved exported GLBs.
     uvs.push(vertex.u,vertex.v);
     fitted.push(vertex.u,vertex.v);
     if(color)colors.push(...vertex.color);
    }
    const last=groups[groups.length-1];
    if(last&&last.materialIndex===matIndex&&last.start+last.count===start)last.count+=3;
    else groups.push({start,count:3,materialIndex:matIndex});
   }
   try{
    for(let t=0;t+2<count;t+=3){
     const tri=[read(index?index.getX(t):t),read(index?index.getX(t+1):t+1),
      read(index?index.getX(t+2):t+2)];
     const pieces=split(tri,shape==='straight'?0:7),mi=groupMaterial(t);
     for(const piece of pieces)addTriangle(piece,mi);
    }
   }catch(error){return {ok:false,reason:error.message}}
   if(!vertices.length)continue;
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
   geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
   geo.setAttribute('pwbFittedUV',new THREE.Float32BufferAttribute(fitted,2));
   if(color)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   for(const gr of groups)geo.addGroup(gr.start,gr.count,gr.materialIndex);
   geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
   output.push({mesh,geometry:geo});
  }
  if(!output.length)return {ok:false,reason:'Нет подходящих треугольников'};
  for(const x of output)x.mesh.geometry=x.geometry;
  root.userData.pwbModuleShape=shape;root.userData.pwbModuleUse=use;
  const width=base[use].width;
  root.userData.pwbModuleSockets=use==='wall'?
    shape==='straight'?[{point:[-1,0,0],out:[-1,0,0]},{point:[1,0,0],out:[1,0,0]}]:
    shape==='corner'?[{point:[-2,0,0],out:[-1,0,0]},{point:[0,0,-2],out:[0,0,-1]}]:
    [{point:[2,0,0],out:[0,0,-1]},{point:[shape==='arc90'?0:-2,0,shape==='arc90'?2:0],
       out:[shape==='arc90'?-1:0,0,shape==='arc90'?0:-1]}]:null;
  if(root.userData.pwbModuleSockets)
   root.userData.pwbModuleSockets=root.userData.pwbModuleSockets.map(s=>({point:s.point,out:s.out}));
  root.updateWorldMatrix(true,true);
  return {ok:true,triangles:total,shape,use,dimensions:base[use]};
 }
 return {profiles,uses,base,validate,build,modelPoint};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ModuleForge;
