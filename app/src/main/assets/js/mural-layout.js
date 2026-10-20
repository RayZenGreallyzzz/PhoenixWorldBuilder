/* Shared non-repeating picture across coplanar modular walls. Coordinates
 * are computed from real transformed wall sizes, not hardcoded 2m tiles.
 */
const MuralLayout=(()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const walls=new Set(['wall','corner']);
 function compatible(w,entry,selected){
  const cat=entry.data?.category||w.categoryForKind?.(entry.kind)||entry.kind;
  const storey=entry.data?.storey,selectedStorey=selected.data?.storey;
  return walls.has(cat)&&(!Number.isInteger(storey)||!Number.isInteger(selectedStorey)||storey===selectedStorey);
 }
 function connected(a,b){
  const gap=(low,high,lo,hi)=>Math.max(0,lo-high,low-hi);
  const overlap=(low,high,lo,hi)=>Math.max(0,Math.min(high,hi)-Math.max(low,lo));
  const xGap=gap(a.left,a.right,b.left,b.right);
  const yGap=gap(a.bottom,a.top,b.bottom,b.top);
  const xOverlap=overlap(a.left,a.right,b.left,b.right);
  const yOverlap=overlap(a.bottom,a.top,b.bottom,b.top);
  return (xGap<=.18&&yOverlap>=Math.min(a.height,b.height)*.65)||
   (yGap<=.18&&xOverlap>=Math.min(a.width,b.width)*.65);
 }
 function collect(world,selected,face='front',limit=24){
  if(!selected||!compatible(world,selected,selected))return [];
  const anchor=DecalLayer.faceGeometry(selected.mesh,face);
  if(!anchor)return [];
  const projected=[];
  for(const entry of world.objects||[]){
   if(!compatible(world,entry,selected))continue;
   const g=DecalLayer.faceGeometry(entry.mesh,face);
   if(!g||g.n.dot(anchor.n)<.985||g.u.dot(anchor.u)<.985||g.v.dot(anchor.v)<.985)continue;
   const diff=g.center.clone().sub(anchor.center);
   // Reject parallel walls in a different room or behind this wall.
   if(Math.abs(diff.dot(anchor.n))>.3)continue;
   const cx=diff.dot(anchor.u),cy=diff.dot(anchor.v);
   projected.push({entry,g,cx,cy,width:g.width,height:g.height,
    left:cx-g.width/2,right:cx+g.width/2,
    bottom:cy-g.height/2,top:cy+g.height/2});
  }
  const chosen=projected.find(e=>e.entry===selected);
  if(!chosen)return [];
  const group=[chosen],visited=new Set([selected]);
  // Breadth-first expansion prevents collecting detached walls on the same plane.
  for(let i=0;i<group.length&&group.length<limit;i++){
   for(const candidate of projected){
    if(visited.has(candidate.entry)||!connected(group[i],candidate))continue;
    group.push(candidate);visited.add(candidate.entry);
    if(group.length>=limit)break;
   }
  }
  const minX=Math.min(...group.map(x=>x.left)),maxX=Math.max(...group.map(x=>x.right));
  const minY=Math.min(...group.map(x=>x.bottom)),maxY=Math.max(...group.map(x=>x.top));
  const width=Math.max(.001,maxX-minX),height=Math.max(.001,maxY-minY);
  return group.map(x=>({entry:x.entry,face,width,height,
   crop:[clamp((x.left-minX)/width,0,1),clamp((x.bottom-minY)/height,0,1),
    clamp((x.right-minX)/width,0,1),clamp((x.top-minY)/height,0,1)]}));
 }
 return {collect};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=MuralLayout;
