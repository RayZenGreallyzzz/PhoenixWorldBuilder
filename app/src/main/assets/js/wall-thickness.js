/* Physical wall thickness (metres) independent from module X/Y/Z dimensions.
 * Safe on modular rectangular walls, two-arm 90° corners and recognizable
 * annular arc strips. Unknown/imported arbitrary shapes are left untouched.
 * Original asset meshes are never modified; per-instance geometry is cloned.
 */
const WallThickness=(()=>{
 const baseGeometries=new WeakMap();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const geometryBase=geo=>baseGeometries.get(geo)||geo;
 const center=(a,b)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
 function circle(a,b,c){
  const d=2*(a.x*(b.z-c.z)+b.x*(c.z-a.z)+c.x*(a.z-b.z));
  if(Math.abs(d)<1e-5)return null;
  const a2=a.x*a.x+a.z*a.z,b2=b.x*b.x+b.z*b.z,c2=c.x*c.x+c.z*c.z;
  const x=(a2*(b.z-c.z)+b2*(c.z-a.z)+c2*(a.z-b.z))/d;
  const z=(a2*(c.x-b.x)+b2*(a.x-c.x)+c2*(b.x-a.x))/d;
  const radius=Math.hypot(a.x-x,a.z-z);
  return radius>.3&&radius<150?{x,z,radius}:null;
 }
 function arcProfile(mesh){
  const geo=geometryBase(mesh.geometry),attr=geo?.attributes?.position;
  if(!attr||attr.count<12||attr.count>180000)return null;
  if(!geo.boundingBox)geo.computeBoundingBox();
  const low=geo.boundingBox.min.y,bottom=[];
  for(let i=0;i<attr.count;i++){
   const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i);
   if(Math.abs(y-low)>.018)continue;
   const p={x,z};
   if(!bottom.length||dist(bottom[bottom.length-1],p)>1e-5)bottom.push(p);
  }
  if(bottom.length<6||bottom.length%2!==0)return null;
  const sections=[];
  for(let i=0;i<bottom.length;i+=2){
   const thick=dist(bottom[i],bottom[i+1]);
   if(thick<.012||thick>1.6)return null;
   sections.push({center:center(bottom[i],bottom[i+1]),thick});
  }
  const first=sections[0].center,last=sections[sections.length-1].center;
  const mid=sections[Math.floor(sections.length/2)].center;
  const fit=circle(first,mid,last);
  if(!fit)return null;
  const thickness=sections.reduce((a,v)=>a+v.thick,0)/sections.length;
  if(sections.some(s=>Math.abs(s.thick-thickness)>.05||Math.abs(
   Math.hypot(s.center.x-fit.x,s.center.z-fit.z)-fit.radius)>.055))return null;
  // Only near-radial mesh strips are safe to reshape. Keep decorations untouched.
  let coherent=0;
  for(let i=0;i<attr.count;i++){
   const r=Math.hypot(attr.getX(i)-fit.x,attr.getZ(i)-fit.z);
   if(Math.abs(Math.abs(r-fit.radius)-thickness/2)<.045)coherent++;
  }
  if(coherent/attr.count<.88)return null;
  return {mesh,axis:'radial',center:fit,radius:fit.radius,thickness};
 }
 function slabProfile(mesh){
  const geo=geometryBase(mesh.geometry),attr=geo?.attributes?.position;
  if(!attr)return null;
  if(!geo.boundingBox)geo.computeBoundingBox();
  const box=geo.boundingBox,sx=box.max.x-box.min.x,sz=box.max.z-box.min.z;
  const tall=box.max.y-box.min.y;
  const thin=Math.min(sx,sz),long=Math.max(sx,sz);
  if(tall<.45||thin<.015||thin>.8||long<.7||long/thin<3.2)return null;
  const axis=sx>sz?'z':'x';
  return {mesh,axis,thickness:thin,center:axis==='z'?(box.min.z+box.max.z)/2:(box.min.x+box.max.x)/2};
 }
 function profiles(root,kind,category){
  if(!root||!['wall','corner'].includes(category))return null;
  const meshes=[];
  root.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh)});
  if(!meshes.length)return null;
  if(typeof BuildCurves!=='undefined'&&BuildCurves.isArc(kind)){
   const arcs=meshes.map(arcProfile).filter(Boolean);
   if(arcs.length!==1)return null;
   return {type:'arc',parts:arcs};
  }
  const slabs=meshes.map(slabProfile).filter(Boolean);
  if(category==='corner'){
   const horizontal=slabs.filter(s=>s.axis==='z');
   const vertical=slabs.filter(s=>s.axis==='x');
   // Do not guess thickness on arbitrary merged or decorative L meshes.
   if(horizontal.length!==1||vertical.length!==1)return null;
   return {type:'corner',parts:[horizontal[0],vertical[0]]};
  }
  if(category==='wall'&&slabs.length===1&&meshes.length===1)
   return {type:'straight',parts:slabs};
  return null;
 }
 function unitScale(root,axis){
  const s=root.scale||{x:1,y:1,z:1};
  if(axis==='radial'){
   if(Math.abs(Math.abs(s.x)-Math.abs(s.z))>Math.max(.02,Math.abs(s.x)*.04))return null;
   return Math.abs(s.x);
  }
  return Math.abs(s[axis]||1);
 }
 function info(root,kind,category){
  const p=profiles(root,kind,category);
  if(!p)return null;
  const sizes=p.parts.map(part=>{
   const u=unitScale(root,part.axis);
   return u?part.thickness*u:null;
  });
  if(sizes.some(v=>v===null))return null;
  return {type:p.type,meters:sizes.reduce((a,b)=>a+b,0)/sizes.length,parts:p.parts};
 }
 function apply(root,kind,category,meters){
  const requested=Number(meters);
  if(!Number.isFinite(requested)||requested<.025||requested>.8)return false;
  const profile=profiles(root,kind,category);
  if(!profile)return false;
  const prepared=[];
  for(const part of profile.parts){
   const unit=unitScale(root,part.axis);
   if(!unit)return false;
   const factor=clamp(requested/(part.thickness*unit),.1,8);
   if(requested/(part.thickness*unit)>.001+
      8||requested/(part.thickness*unit)<.099)return false;
   const original=geometryBase(part.mesh.geometry);
   const geom=original.clone(),position=geom.attributes.position;
   if(part.axis==='radial'){
    const c=part.center,{radius}=c,half=part.thickness/2;
    for(let i=0;i<position.count;i++){
     const x=position.getX(i),z=position.getZ(i);
     const r=Math.hypot(x-c.x,z-c.z);
     if(r<.001)continue;
     const sign=Math.sign(r-radius);
     const nr=radius+sign*half*factor;
     position.setX(i,c.x+(x-c.x)*nr/r);position.setZ(i,c.z+(z-c.z)*nr/r);
    }
   }else{
    for(let i=0;i<position.count;i++){
     const v=part.axis==='x'?position.getX(i):position.getZ(i);
     const next=part.center+(v-part.center)*factor;
     if(part.axis==='x')position.setX(i,next);else position.setZ(i,next);
    }
   }
   position.needsUpdate=true;
   geom.computeBoundingBox();geom.computeBoundingSphere();geom.computeVertexNormals();
   baseGeometries.set(geom,original);
   prepared.push([part.mesh,geom]);
  }
  for(const [mesh,geometry] of prepared)mesh.geometry=geometry;
  root.updateMatrixWorld(true);
  return true;
 }
 return {info,apply,profiles};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WallThickness;
