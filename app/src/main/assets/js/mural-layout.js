/* One world-space image across adjoining coplanar surfaces (walls, floors or ceilings).
 * No geometries are resized or duplicated. A connected surface can consist of
 * any number of existing modules; expensive shaders are limited per-module.
 */
const MuralLayout=(()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const family=(w,e)=>{
  const cat=e?.data?.category||w?.categoryForKind?.(e?.kind)||e?.kind;
  if(['wall','corner','door','railing'].includes(cat))return 'wall';
  if(['foundation','floor'].includes(cat))return 'floor';
  if(['ceiling','ceiling_finish'].includes(cat))return 'ceiling';
  return null;
 };
 function compatible(w,entry,selected){
  if(!entry?.mesh||!selected?.mesh)return false;
  const a=family(w,entry),b=family(w,selected);
  if(!a||a!==b)return false;
  const story=entry.data?.storey,other=selected.data?.storey;
  return !Number.isInteger(story)||!Number.isInteger(other)||story===other;
 }
 function connected(a,b){
  const gap=(low,high,lo,hi)=>Math.max(0,lo-high,low-hi);
  const overlap=(low,high,lo,hi)=>Math.max(0,Math.min(high,hi)-Math.max(low,lo));
  const xGap=gap(a.left,a.right,b.left,b.right),yGap=gap(a.bottom,a.top,b.bottom,b.top);
  const xOverlap=overlap(a.left,a.right,b.left,b.right);
  const yOverlap=overlap(a.bottom,a.top,b.bottom,b.top);
  return (xGap<=.18&&yOverlap>=Math.min(a.height,b.height)*.65)||
   (yGap<=.18&&xOverlap>=Math.min(a.width,b.width)*.65);
 }
 function collect(world,selected,face='front'){
  if(!compatible(world,selected,selected))return [];
  const anchor=DecalLayer.faceGeometry(selected.mesh,face);if(!anchor)return [];
  const projected=[];
  for(const entry of world.objects||[]){
   if(!compatible(world,entry,selected))continue;
   const g=DecalLayer.faceGeometry(entry.mesh,face);
   // Do not join unrelated orthogonal/rotated faces or the opposite side.
   if(!g||g.n.dot(anchor.n)<.985||g.u.dot(anchor.u)<.985||g.v.dot(anchor.v)<.985)continue;
   const diff=g.center.clone().sub(anchor.center);
   if(Math.abs(diff.dot(anchor.n))>.3)continue;
   const cx=diff.dot(anchor.u),cy=diff.dot(anchor.v);
   projected.push({entry,g,cx,cy,width:g.width,height:g.height,
    left:cx-g.width/2,right:cx+g.width/2,
    bottom:cy-g.height/2,top:cy+g.height/2});
  }
  const chosen=projected.find(e=>e.entry===selected);if(!chosen)return [];
  const group=[chosen],visited=new Set([selected]);
  // Explore the actual connected component; never truncate a painting at 24 tiles.
  for(let i=0;i<group.length;i++)for(const candidate of projected){
   if(visited.has(candidate.entry)||!connected(group[i],candidate))continue;
   group.push(candidate);visited.add(candidate.entry);
  }
  const minX=Math.min(...group.map(x=>x.left)),maxX=Math.max(...group.map(x=>x.right));
  const minY=Math.min(...group.map(x=>x.bottom)),maxY=Math.max(...group.map(x=>x.top));
  const width=Math.max(.001,maxX-minX),height=Math.max(.001,maxY-minY);
  const center=anchor.center.clone().addScaledVector(anchor.u,(minX+maxX)/2)
   .addScaledVector(anchor.v,(minY+maxY)/2);
  return group.map(x=>({entry:x.entry,face,width,height,center,u:anchor.u,v:anchor.v,
   crop:[clamp((x.left-minX)/width,0,1),clamp((x.bottom-minY)/height,0,1),
    clamp((x.right-minX)/width,0,1),clamp((x.top-minY)/height,0,1)]}));
 }
 // Image width/height and offsets are in METRES, not module scale.
 // Values outside [0,1] are transparent, not repeated or edge-stretched.
 function imageCrop(piece,widthMeters,heightMeters,offsetX=0,offsetY=0){
  const width=Math.max(.05,Number(widthMeters)||piece.width);
  const height=Math.max(.05,Number(heightMeters)||piece.height);
  const ox=Number(offsetX)||0,oy=Number(offsetY)||0;
  const [u0,v0,u1,v1]=piece.crop;
  return [.5+(u0-.5)*piece.width/width-ox/width,
   .5+(v0-.5)*piece.height/height-oy/height,
   .5+(u1-.5)*piece.width/width-ox/width,
   .5+(v1-.5)*piece.height/height-oy/height];
 }
 return {collect,imageCrop};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=MuralLayout;
