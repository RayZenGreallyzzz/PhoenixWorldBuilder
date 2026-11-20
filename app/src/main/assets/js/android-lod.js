/* Non-destructive distance LOD for imported, static GLB meshes.
 * Preserve source nodes, UVs, PBR, skinning, morphs and project editability.
 * Only eligible indexed static mesh instances are wrapped in THREE.LOD.
 * Geometry indices alone are simplified (meshoptimizer); original arrays
 * are shared, so expensive texture/vertex buffers are NOT duplicated.
 * MIT: meshoptimizer (https://github.com/zeux/meshoptimizer).
 */
const AndroidLOD=(()=>{
 'use strict';
 const MAX_MESH_TRIS=75000,MAX_MODEL_TRIS=200000,MIN_TRIS=350;
 const staticGuard=/\b(door|hinge|pivot|handle|window|swing|rotor|wheel|bone|joint|armature|rig)\b/i;
 const baseData=new WeakMap();
 const nTri=geo=>(geo.index?geo.index.count:geo.attributes.position?.count||0)/3;
 const optsDefault={enabled:true,near:12,far:27,targetNear:.60,targetFar:.30};
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
 function options(raw){
  const r=raw||{};
  return {enabled:r.enabled!==false,
   near:clamp(r.near??12,5,180),far:clamp(r.far??27,9,350),
   targetNear:clamp(r.targetNear??.60,.3,.9),
   targetFar:clamp(r.targetFar??.30,.12,.7)};
 }
 function eligible(mesh,animating){
  if(animating||!mesh||!mesh.isMesh||mesh.isSkinnedMesh||
     mesh.morphTargetInfluences?.length||mesh.geometry.morphAttributes&&
     Object.values(mesh.geometry.morphAttributes).some(a=>a.length))return false;
  if(mesh.userData.phoenixLODProxy||mesh.geometry.userData?.phoenixLODSkip)return false;
  const geo=mesh.geometry,pos=geo?.attributes?.position;
  if(!pos||pos.count<3||geo.groups?.length>1||Array.isArray(mesh.material))return false;
  if(!geo.index||geo.index.count%3)return false;
  const tri=nTri(geo);
  if(tri<MIN_TRIS||tri>MAX_MESH_TRIS)return false;
  let o=mesh;
  while(o){
   if(staticGuard.test(o.name||''))return false;
   o=o.parent;
  }
  return true;
 }
 function indexedPositions(pos){
  // Interleaved positions are extracted only for computing simplified indices.
  const p=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
   p[i*3]=pos.getX(i);p[i*3+1]=pos.getY(i);p[i*3+2]=pos.getZ(i);
  }
  return p;
 }
 function simplify(geo,ratio,error){
  const simp=typeof MeshoptSimplifier!=='undefined'?MeshoptSimplifier:null;
  if(!simp?.supported)return null;
  const src=geo.index?.array;if(!src)return null;
  const indices=src instanceof Uint32Array?src:new Uint32Array(src);
  const target=Math.max(9,Math.floor(indices.length*ratio/3)*3);
  if(target>=indices.length*.92)return null;
  const [low,errorFound]=simp.simplify(indices,indexedPositions(geo.attributes.position),
   3,target,error);
  if(!low||low.length<9||low.length>indices.length*.92)return null;
  const alternate=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(geo.attributes)){
   // Preserve original vertex data and UV, including secondary UV and colors.
   alternate.setAttribute(name,attribute);
  }
  const max=geo.attributes.position.count;
  const index= max>65535?new Uint32Array(low):new Uint16Array(low);
  alternate.setIndex(new THREE.BufferAttribute(index,1));
  if(geo.boundingBox)alternate.boundingBox=geo.boundingBox.clone();
  else {geo.computeBoundingBox();alternate.boundingBox=geo.boundingBox.clone()}
  if(geo.boundingSphere)alternate.boundingSphere=geo.boundingSphere.clone();
  else {geo.computeBoundingSphere();alternate.boundingSphere=geo.boundingSphere.clone()}
  alternate.userData.phoenixLODProxy=true;
  return {geometry:alternate,triangles:index.length/3,error:errorFound};
 }
 async function prepare(root,animations,settings){
  const config=options(settings);
  if(!config.enabled||!root)return {attached:0,trianglesSaved:0,skipped:'disabled'};
  const animated=Array.isArray(animations)&&animations.length>0;
  if(animated)return {attached:0,trianglesSaved:0,skipped:'animated'};
  if(typeof MeshoptSimplifier==='undefined'||!MeshoptSimplifier.supported)
   return {attached:0,trianglesSaved:0,skipped:'decoder'};
  await MeshoptSimplifier.ready;
  if(typeof settings?.shouldAbort==='function'&&settings.shouldAbort())
   return {attached:0,trianglesSaved:0,skipped:'stale'};
  if(!root.parent&&root.userData.phoenixLODDropped)return {attached:0,trianglesSaved:0};
  const candidates=[];
  root.traverse(mesh=>{
   if(eligible(mesh,animated)&&!mesh.userData.phoenixLODInstalled)
    candidates.push(mesh);
  });
  if(candidates.reduce((sum,mesh)=>sum+nTri(mesh.geometry),0)>MAX_MODEL_TRIS)
   return {attached:0,trianglesSaved:0,skipped:'too-heavy'};
  let count=0,reduced=0;
  for(let i=0;i<candidates.length;i++){
   // Yield to Android WebView after every third simplification batch.
   if(i&&i%3===0)await new Promise(resolve=>{
    if(typeof requestIdleCallback==='function')
     requestIdleCallback(resolve,{timeout:120});
    else setTimeout(resolve,0);
   });
   if(typeof settings?.shouldAbort==='function'&&settings.shouldAbort())
    return {attached:count,trianglesSaved:Math.round(reduced),skipped:'stale'};
   const mesh=candidates[i];
   if(mesh.userData.phoenixLODInstalled||!mesh.parent)continue;
   const geo=mesh.geometry;
   let levels=baseData.get(geo);
   if(!levels){
    try{
     const level1=simplify(geo,config.targetNear,.035);
     const level2=simplify(geo,config.targetFar,.095);
     levels=level1&&level2&&level2.triangles<level1.triangles?
      [level1,level2]:null;
    }catch(err){
     console.warn('LOD simplification skipped:',err);
     levels=null;
    }
    baseData.set(geo,levels);
   }
   if(!levels)continue;
   const host=mesh.parent,group=new THREE.LOD();
   group.name='phoenixLOD:'+mesh.name;group.userData.phoenixLODGroup=true;
   group.position.copy(mesh.position);group.quaternion.copy(mesh.quaternion);
   group.scale.copy(mesh.scale);
   // Source mesh retains its identity and geometry. The adapter owns transforms.
   mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
   host.add(group);
   host.remove(mesh);
   group.addLevel(mesh,0);
   const createProxy=(geo,label)=>{
    const proxy=new THREE.Mesh(geo,mesh.material);
    proxy.name=label;proxy.userData.phoenixLODProxy=true;
    proxy.castShadow=mesh.castShadow;proxy.receiveShadow=mesh.receiveShadow;
    return proxy;
   };
   // Larger objects switch further away, keeping silhouette stable nearby.
   if(!geo.boundingSphere)geo.computeBoundingSphere();
   const radius=geo.boundingSphere?.radius||1;
   const near=Math.max(config.near,radius*9);
   const far=Math.max(config.far,near*1.8,radius*18);
   group.addLevel(createProxy(levels[0].geometry,'phoenixLOD:medium'),near);
   group.addLevel(createProxy(levels[1].geometry,'phoenixLOD:far'),far);
   mesh.userData.phoenixLODInstalled=true;
   reduced+=nTri(geo)-levels[1].triangles;count++;
  }
  return {attached:count,trianglesSaved:Math.round(reduced),skipped:null};
 }
 function originalMesh(mesh){
  return !!mesh&&!mesh.userData.phoenixLODProxy;
 }
 function setEnabled(root,enabled){
  if(!root)return;
  root.traverse(o=>{
   if(!o.isLOD||!o.userData.phoenixLODGroup)return;
   o.autoUpdate=!!enabled;
   if(!enabled)o.levels.forEach((item,i)=>item.object.visible=i===0);
  });
 }
 return {options,eligible,prepare,setEnabled,originalMesh,MIN_TRIS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AndroidLOD;
