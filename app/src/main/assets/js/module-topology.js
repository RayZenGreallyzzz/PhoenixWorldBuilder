/* Phoenix structural module metadata.
 * Independent implementation of explicit construction roles, dimensions and
 * local connection points. NOT Planner 5D code, assets or copied snap values.
 *
 * A role is authored by the user/catalog; geometry is used once to measure
 * its bounds. Heavy meshes never need to be traversed just to retrieve a
 * saved straight wall's end sockets or a slab's support plane.
 */
const ModuleTopology=(()=>{
 const VERSION=1;
 const roles=new Set(['foundation','ceiling','wall','corner','door','window','roof',
  'stairs','railing','prop','decor','ceiling_finish']);
 const count=5;
 const round=n=>Math.round(n*1e5)/1e5;
 const asPoint=p=>p.map(round);
 function measure(root){
  if(!root)return null;
  root.updateWorldMatrix(true,true);
  if(typeof BuildSnap!=='undefined'&&typeof BuildSnap.attrBounds==='function')
   return BuildSnap.attrBounds(root);
  // Standalone fallback for model descriptors in external scripts/tests.
  const inv=root.matrixWorld.clone().invert(),mat=new THREE.Matrix4();
  const out=new THREE.Box3().makeEmpty();
  root.traverse(obj=>{
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   if(!obj.geometry.boundingBox)obj.geometry.computeBoundingBox();
   if(!obj.geometry.boundingBox)return;
   mat.multiplyMatrices(inv,obj.matrixWorld);
   const box=obj.geometry.boundingBox,point=new THREE.Vector3();
   for(const x of [box.min.x,box.max.x])
    for(const y of [box.min.y,box.max.y])
     for(const z of [box.min.z,box.max.z])
      out.expandByPoint(point.set(x,y,z).applyMatrix4(mat));
  });
  return out;
 }
 function make(root,role='prop'){
  const box=measure(root);
  if(!box||box.isEmpty())return null;
  const b=box.min,t=box.max;
  if(![b.x,b.y,b.z,t.x,t.y,t.z].every(Number.isFinite))return null;
  const normalized=roles.has(role)?role:'prop';
  const cx=(b.x+t.x)*.5,cy=(b.y+t.y)*.5,cz=(b.z+t.z)*.5;
  const alongX=t.x-b.x>=t.z-b.z;
  const axis=alongX?'x':'z',cross=alongX?'z':'x';
  const centrePoint=(primary,y)=>axis==='x'?[primary,y,cz]:[cx,y,primary];
  const start=b[axis],end=t[axis];
  const socket=(point,normal)=>({point:asPoint(point),normal:asPoint(normal)});
  const longitudinalNormal=(sign)=>axis==='x'?[sign,0,0]:[0,0,sign];
  const points={
   L:socket(centrePoint(start,b.y),longitudinalNormal(-1)),
   R:socket(centrePoint(end,b.y),longitudinalNormal(1)),
   T:socket([cx,t.y,cz],[0,1,0]),
   B:socket([cx,b.y,cz],[0,-1,0]),
   TL:socket(centrePoint(start,t.y),[0,1,0]),
   TR:socket(centrePoint(end,t.y),[0,1,0]),
   BL:socket(centrePoint(start,b.y),[0,-1,0]),
   BR:socket(centrePoint(end,b.y),[0,-1,0])
  };
  const horizontal=normalized==='foundation'||normalized==='ceiling'||normalized==='ceiling_finish';
  const wallLike=['wall','door','window','railing'].includes(normalized);
  const perimeter=horizontal?{
   west: {a:asPoint([b.x,t.y,b.z]),b:asPoint([b.x,t.y,t.z]),out:[-1,0,0]},
   east: {a:asPoint([t.x,t.y,b.z]),b:asPoint([t.x,t.y,t.z]),out:[1,0,0]},
   north:{a:asPoint([b.x,t.y,b.z]),b:asPoint([t.x,t.y,b.z]),out:[0,0,-1]},
   south:{a:asPoint([b.x,t.y,t.z]),b:asPoint([t.x,t.y,t.z]),out:[0,0,1]}
  }:null;
  return {
   version:VERSION,role:normalized,
   bounds:{min:asPoint(b.toArray()),max:asPoint(t.toArray())},
   sizeMeters:asPoint([t.x-b.x,t.y-b.y,t.z-b.z]),
   lengthAxis:axis,thicknessAxis:horizontal?'y':cross,
   sockets:points,
   // These are structural permissions; the current solver performs the
   // actual contact/overlap validation. No guessing from filename/texture.
   connections:horizontal?{top:['wall','door','stairs','railing','foundation','ceiling'],
       bottom:['wall','corner','door','ceiling','foundation'],edges:['foundation','ceiling']}:
    wallLike?{ends:['wall','door','corner','railing'],top:['ceiling','roof','wall'],
       bottom:['foundation','ceiling']}:
    normalized==='roof'?{bottom:['wall','corner','ceiling','foundation']}:
    normalized==='stairs'?{bottom:['foundation','ceiling'],top:['foundation','ceiling']}:{},
   perimeter
  };
 }
 function valid(desc,role){
  if(!desc||desc.version!==VERSION||desc.role!==(roles.has(role)?role:'prop'))return false;
  const b=desc.bounds;
  return !!(Array.isArray(b?.min)&&Array.isArray(b.max)&&
   b.min.length===3&&b.max.length===3&&
   [...b.min,...b.max].every(v=>Number.isFinite(v)&&Math.abs(v)<1e6)&&
   b.min.every((v,i)=>b.max[i]>v)&&
   Array.isArray(desc.sizeMeters)&&desc.sizeMeters.length===3&&
   desc.sizeMeters.every((v,i)=>Number.isFinite(v)&&v>0&&
     Math.abs(v-(b.max[i]-b.min[i]))<.002));
 }
 function boxOf(entry){
  const desc=entry?.data?.moduleTopology;
  if(!valid(desc,entry.data?.category))return null;
  return new THREE.Box3(
   new THREE.Vector3(...desc.bounds.min),new THREE.Vector3(...desc.bounds.max));
 }
 function pointOf(root,desc,key){
  const p=desc?.sockets?.[key]?.point;
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))return null;
  root.updateWorldMatrix(true,true);
  return new THREE.Vector3(...p).applyMatrix4(root.matrixWorld);
 }
 return {VERSION,make,valid,boxOf,pointOf,roles};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ModuleTopology;
