/* UV23: conservative, non-destructive room contour clipping for STANDARD floors.
 * A closed chain of real wall center-lines is required. Neither an open wall
 * nor a decorative/unknown curved GLB is guessed to be an enclosing room.
 * Original shapes and library assets are never modified.
 */
const RoomFloorTrim=(()=>{
 'use strict';
 const JOIN=.19, EPS=1e-6;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const signedArea=poly=>poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];return sum+p.x*q.z-q.x*p.z;
 },0)*.5;
 const cross=(a,b)=>a.x*b.z-a.z*b.x;
 const sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
 const scale=(a,s)=>({x:a.x*s,z:a.z*s});
 const plus=(a,b)=>({x:a.x+b.x,z:a.z+b.z});
 function segmentize(entries,storey){
  const lines=[];
  const add=(entry,localA,localB,thickness)=>{
   const root=entry.root;
   const a=new THREE.Vector3(localA[0],0,localA[1]).applyMatrix4(root.matrixWorld);
   const b=new THREE.Vector3(localB[0],0,localB[1]).applyMatrix4(root.matrixWorld);
   const start={x:a.x,z:a.z},end={x:b.x,z:b.z};
   if(distance(start,end)>.015)lines.push({a:start,b:end,thickness:Math.max(.025,Math.min(.8,thickness))});
  };
  for(const e of entries||[]){
   if(!e?.root||e.category!=='wall'||e.storey!==storey||e.hidden||
      Math.abs(e.root.rotation.x)+Math.abs(e.root.rotation.z)>.01)continue;
   e.root.updateWorldMatrix(true,true);
   const sx=Math.abs(e.root.scale.x),sz=Math.abs(e.root.scale.z),
     th=(Number(e.thickness)||.22)*Math.min(sx,sz);
   if(e.kind==='wall')add(e,[-1,0],[1,0],th);
   else if(e.kind==='corner'){
    add(e,[-1.9,0],[0,0],th);add(e,[0,0],[0,-1.9],th);
   }else if(e.kind==='arc90'||e.kind==='arc180'){
    const sweep=e.kind==='arc90'?Math.PI/2:Math.PI;
    // 24 segments / 180 degrees: under 4.3 mm arc chord error at r=2m.
    const n=e.kind==='arc90'?12:24;
    for(let i=0;i<n;i++){
     const p=i*sweep/n,q=(i+1)*sweep/n;
     add(e,[2*Math.cos(p),2*Math.sin(p)],
      [2*Math.cos(q),2*Math.sin(q)],th);
    }
   }else{
    // Treat imported walls only when the existing analyser proves a single
    // straight centre-line. Multi-part/ambiguous curved meshes are skipped.
    const pieces=EdgeAutoTrim.wallSegments([e],storey).segments;
    if(pieces.length===1){const p=pieces[0];
     if(p.length>.25)addWorld(p.a,p.b,p.thickness);
    }
   }
  }
  function addWorld(a,b,t){if(distance(a,b)>.015)
   lines.push({a:{...a},b:{...b},thickness:Math.max(.025,Math.min(.8,t))});}
  return lines;
 }
 // Build closed chains; do not connect nearby parallel walls with guesses.
 function traceLoops(lines){
  const unused=new Set(lines.map((_,i)=>i)),loops=[];
  while(unused.size){
   let index=unused.values().next().value;unused.delete(index);
   const start=lines[index].a;
   const chain=[{point:start,segment:lines[index]}];
   let end=lines[index].b,closed=false,ambiguous=false;
   for(let steps=0;steps<Math.min(1300,lines.length+1);steps++){
    if(distance(end,start)<JOIN && chain.length>=3){closed=true;break;}
    let matches=[];
    for(const k of unused){
     const line=lines[k];let reverse=false,dist=distance(end,line.a);
     const back=distance(end,line.b);
     if(back<dist){dist=back;reverse=true;}
     if(dist<JOIN)matches.push({k,dist,reverse});
    }
    matches.sort((a,b)=>a.dist-b.dist);
    if(!matches.length)break;
    // Two equally plausible next walls: likely a T junction or an open
    // crossing. A destructive guess is worse than leaving the tile untouched.
    if(matches.length>1 && matches[1].dist-matches[0].dist<.02){ambiguous=true;break;}
    const m=matches[0];unused.delete(m.k);
    const raw=lines[m.k];const line=m.reverse?{
     a:raw.b,b:raw.a,thickness:raw.thickness}:raw;
    chain.push({point:line.a,segment:line});end=line.b;
   }
   if(!closed||ambiguous||chain.length<3||chain.length>1200)continue;
   const points=chain.map(item=>item.point);
   if(Math.abs(signedArea(points))<.5)continue;
   loops.push(chain);
  }
  return loops;
 }
 function offsetRoom(chain){
  const original=chain.map(x=>x.point),dir=Math.sign(signedArea(original));
  if(!dir)return null;
  const lines=chain.map(({segment:s})=>{
   const v=sub(s.b,s.a),len=Math.hypot(v.x,v.z);
   const n={x:dir*(-v.z/len),z:dir*(v.x/len)};
   const shift=scale(n,s.thickness*.5);
   return {a:plus(s.a,shift),b:plus(s.b,shift),dir:v,th:s.thickness};
  });
  const points=[];
  for(let i=0;i<lines.length;i++){
   const prev=lines[(i+lines.length-1)%lines.length],next=lines[i],
    vertex=original[i],den=cross(prev.dir,next.dir);
   let p;
   if(Math.abs(den)>1e-7){
    const t=cross(sub(next.a,prev.a),next.dir)/den;
    p=plus(prev.a,scale(prev.dir,t));
   }else p={x:(prev.b.x+next.a.x)/2,z:(prev.b.z+next.a.z)/2};
   const limit=Math.max(.25,3*Math.max(prev.th,next.th));
   // Acute corners or nearly parallel lines can have huge mitres.
   if(distance(p,vertex)>limit)p={x:(prev.b.x+next.a.x)/2,z:(prev.b.z+next.a.z)/2};
   if(points.length&&distance(p,points[points.length-1])<.0001)continue;
   points.push(p);
  }
  if(points.length<3||points.length>1200||Math.abs(signedArea(points))<.2)return null;
  // Offsetting a concave curved room can form very small loops at acute
  // wall junctions (e.g. arc180 meeting a straight side tangentially).
  // Trim ONLY those small local artefacts; ambiguous large overlaps are unsafe.
  const intersection=(a,b,c,d)=>{
   const ab=sub(b,a),cd=sub(d,c),den=cross(ab,cd);
   if(Math.abs(den)<1e-8)return null;
   const diff=sub(c,a),t=cross(diff,cd)/den,u=cross(diff,ab)/den;
   return t>1e-5&&t<1-1e-5&&u>1e-5&&u<1-1e-5?
    plus(a,scale(ab,t)):null;
  };
  for(let guard=0;guard<6;guard++){
   let found=false;
   outer:for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    const meet=intersection(points[i],points[(i+1)%points.length],
     points[j],points[(j+1)%points.length]);
    if(!meet)continue;
    const a=[meet,...points.slice(i+1,j+1)],
     b=[meet,...points.slice(j+1),...points.slice(0,i+1)];
    const aa=Math.abs(signedArea(a)),bb=Math.abs(signedArea(b)),small=Math.min(aa,bb),
     big=Math.max(aa,bb);
    // A giant crossing is probably a malformed/unclosed room, not an offset.
    if(big<.25||small>Math.max(.5,big*.12))return null;
    points.splice(0,points.length,...(aa>=bb?a:b));
    found=true;break outer;
   }
   if(!found)break;
   if(guard===5)return null;
  }
  if(points.length<3||Math.abs(signedArea(points))<.2)return null;
  return points;
 }
 // Recover an actual bounded room when hand-fitted or scaled wall axes cross
 // away from their original endpoints. The legacy exact-endpoint tracer above
 // is intentionally preserved for ordinary snap-built rooms.
 function traceIntersectingLoops(lines){
  const near=.34,eps=1e-7;
  if(!lines.length||lines.length>2600)return [];
  const cuts=lines.map(()=>[0,1]);
  const clamp01=t=>Math.max(0,Math.min(1,t));
  const pos=(s,t)=>plus(s.a,scale(sub(s.b,s.a),t));
  const projection=(p,s)=>{
   const d=sub(s.b,s.a),length=d.x*d.x+d.z*d.z;
   if(length<eps)return null;
   const v=sub(p,s.a),t=(v.x*d.x+v.z*d.z)/length;
   return {t,d:distance(p,pos(s,t))};
  };
  for(let i=0;i<lines.length;i++){
   const a=lines[i],da=sub(a.b,a.a);
   for(let j=i+1;j<lines.length;j++){
    const b=lines[j];
    if(Math.max(a.a.x,a.b.x)+near<Math.min(b.a.x,b.b.x)||
       Math.max(b.a.x,b.b.x)+near<Math.min(a.a.x,a.b.x)||
       Math.max(a.a.z,a.b.z)+near<Math.min(b.a.z,b.b.z)||
       Math.max(b.a.z,b.b.z)+near<Math.min(a.a.z,a.b.z))continue;
    const db=sub(b.b,b.a),den=cross(da,db);
    if(Math.abs(den)>1e-8){
     const diff=sub(b.a,a.a),t=cross(diff,db)/den,
      u=cross(diff,da)/den;
     if(t>=-eps&&t<=1+eps&&u>=-eps&&u<=1+eps){
      cuts[i].push(clamp01(t));cuts[j].push(clamp01(u));
     }
    }else{
     // Collinear overlap: split at the actual endpoints, never extend lines.
     for(const point of [a.a,a.b]){
      const p=projection(point,b);
      if(p&&p.d<.012&&p.t>eps&&p.t<1-eps)cuts[j].push(p.t);
     }
     for(const point of [b.a,b.b]){
      const p=projection(point,a);
      if(p&&p.d<.012&&p.t>eps&&p.t<1-eps)cuts[i].push(p.t);
     }
    }
    // A wall may end exactly on the MIDDLE of a longer wall, i.e. a T.
    // Snap its endpoint to that wall without insisting on matching endcaps.
    for(const [endpoint,index,s] of [[a.a,j,b],[a.b,j,b],[b.a,i,a],[b.b,i,a]]){
     const p=projection(endpoint,s);
     if(p&&p.t>eps&&p.t<1-eps&&p.d<.012)cuts[index].push(p.t);
    }
   }
  }
  const nodes=[],edges=[],indexed=new Map();
  const getNode=point=>{
   const qx=Math.round(point.x/.012),qz=Math.round(point.z/.012);
   for(let x=qx-1;x<=qx+1;x++)for(let z=qz-1;z<=qz+1;z++){
    for(const id of indexed.get(x+','+z)||[])
     if(distance(nodes[id],point)<.008)return id;
   }
   const id=nodes.length;nodes.push({...point});
   const key=qx+','+qz;
   if(!indexed.has(key))indexed.set(key,[]);
   indexed.get(key).push(id);return id;
  };
  for(let i=0;i<lines.length;i++){
   const s=lines[i],c=cuts[i].sort((a,b)=>a-b);
   const unique=[];for(const t of c)if(!unique.length||t-unique[unique.length-1]>1e-5)unique.push(t);
   for(let j=1;j<unique.length;j++){
    const a=pos(s,unique[j-1]),b=pos(s,unique[j]);
    if(distance(a,b)<.012)continue;
    const u=getNode(a),v=getNode(b);if(u!==v)edges.push({u,v,th:s.thickness});
   }
  }
  if(edges.length>7000)return [];
  const count=()=>{
   const deg=Array(nodes.length).fill(0);
   for(const e of edges)if(!e.dead){deg[e.u]++;deg[e.v]++;}
   return deg;
  };
  // Join only mutually nearest *loose endpoints*, with a wall-thickness-sized
  // tolerance. This allows harmless hand positioning errors, but cannot close
  // a missing wall or fabricate a long bridge across an open room.
  const deg=count(),loose=[];
  for(let i=0;i<deg.length;i++)if(deg[i]===1)loose.push(i);
  const nearest=new Map();
  for(const u of loose){let first=null,second=null;
   for(const v of loose){if(v===u)continue;
    const d=distance(nodes[u],nodes[v]);if(d>=near)continue;
    if(!first||d<first.d){second=first;first={v,d}}
    else if(!second||d<second.d)second={v,d};
   }
   if(first&&(!second||second.d-first.d>.025))nearest.set(u,first.v);
  }
  for(const [u,v] of nearest){
   if(u>=v||nearest.get(v)!==u)continue;
   const shared={x:(nodes[u].x+nodes[v].x)/2,z:(nodes[u].z+nodes[v].z)/2};
   nodes[u]={...shared};nodes[v]={...shared};
   // Glue endpoints into one topological node; keep the wall ends free to
   // move only by their measured small join distance.
   for(const e of edges){if(e.u===v)e.u=u;if(e.v===v)e.v=u;}
  }
  // Remove dead-end wall fragments (overhangs after resizing a wall).
  const adjacency=()=>{
   const adj=Array.from({length:nodes.length},()=>[]);
   for(let k=0;k<edges.length;k++){
    const e=edges[k];if(e.dead||e.u===e.v)continue;
    adj[e.u].push(k);adj[e.v].push(k);
   }
   return adj;
  };
  const seenEdge=new Map();
  for(let k=0;k<edges.length;k++){
   const e=edges[k],key=Math.min(e.u,e.v)+':'+Math.max(e.u,e.v);
   if(e.u===e.v){e.dead=true;continue}
   if(seenEdge.has(key)){
    const other=edges[seenEdge.get(key)];other.th=Math.max(other.th,e.th);
    e.dead=true;
   }else seenEdge.set(key,k);
  }
  // UV36: join a LOOSE wall tip to the body of another wall/arc when
  // the actual physical outlines touch, even if their centre-lines miss by
  // 10-20 cm. The UV35 path only split at virtually perfect (<12 mm) T joins.
  // This operation never extends a free wall endpoint over a large gap,
  // never moves source geometry, and never joins a middle arc tessellation
  // vertex (only degree-1 tips).
  const nearTipToMidline=.21;
  const getDegree=()=>{
   const d=Array(nodes.length).fill(0);
   for(const edge of edges)if(!edge.dead&&edge.u!==edge.v){d[edge.u]++;d[edge.v]++;}
   return d;
  };
  // Each accepted join replaces one existing edge by two edges and adds a
  // short connector; re-evaluate degree so the same tip is never processed
  // twice. The cap avoids expensive work for degenerate imported contours.
  for(let attempt=0;attempt<Math.min(300,lines.length);attempt++){
   const d=getDegree(),loose=[];
   for(let i=0;i<d.length;i++)if(d[i]===1)loose.push(i);
   if(loose.length>500)break;
   let chosen=null;
   for(const u of loose){
    const tip=nodes[u];
    const attached=edges.find(e=>!e.dead&&(e.u===u||e.v===u));
    if(!attached)continue;
    const other=nodes[attached.u===u?attached.v:attached.u],
     heading=sub(tip,other),hlen=Math.hypot(heading.x,heading.z);
    if(hlen<1e-6)continue;
    const options=[];
    for(let k=0;k<edges.length;k++){
     const e=edges[k];
     if(e.dead||e.u===u||e.v===u)continue;
     const a=nodes[e.u],b=nodes[e.v];
     if(tip.x<Math.min(a.x,b.x)-nearTipToMidline||
        tip.x>Math.max(a.x,b.x)+nearTipToMidline||
        tip.z<Math.min(a.z,b.z)-nearTipToMidline||
        tip.z>Math.max(a.z,b.z)+nearTipToMidline)continue;
     const delta=sub(b,a),len2=delta.x*delta.x+delta.z*delta.z;
     if(len2<1e-5)continue;
     const from=sub(tip,a),t=(from.x*delta.x+from.z*delta.z)/len2;
     // Exact-endpoint matches are handled by the existing join path.
     if(t<=.05||t>=.95)continue;
     const foot=plus(a,scale(delta,t)),dist=distance(tip,foot);
     if(dist>=nearTipToMidline||dist<=.008)continue;
     // Don't glue unrelated almost-parallel wall runs together.
     const angle=Math.abs(cross(heading,delta))/(hlen*Math.sqrt(len2));
     if(angle<.35)continue;
     options.push({u,k,dist,t,foot});
    }
    options.sort((a,b)=>a.dist-b.dist);
    // Equally plausible walls at this tip => unsafe/ambiguous, don't guess.
    if(!options.length||(options.length>1&&options[1].dist-options[0].dist<.03))continue;
    if(!chosen||options[0].dist<chosen.dist)chosen=options[0];
   }
   if(!chosen)break;
   const {u,k,foot}=chosen,e=edges[k];
   const bridgeNode=getNode(foot);
   if(bridgeNode===u||bridgeNode===e.u||bridgeNode===e.v)break;
   const oldV=e.v;
   e.v=bridgeNode;
   edges.push({u:bridgeNode,v:oldV,th:e.th});
   edges.push({u,v:bridgeNode,th:Math.max(e.th,.12)});
  }
  const adj=adjacency(),degree=adj.map(a=>a.length),queue=[];
  for(let i=0;i<degree.length;i++)if(degree[i]===1)queue.push(i);
  for(let i=0;i<queue.length;i++){
   const n=queue[i];if(degree[n]!==1)continue;
   for(const eidx of adj[n]){
    const e=edges[eidx];if(e.dead)continue;
    e.dead=true;degree[n]--;
    const other=e.u===n?e.v:e.u;
    degree[other]--;if(degree[other]===1)queue.push(other);
   }
  }
  const outgoing=Array.from({length:nodes.length},()=>[]);
  for(let i=0;i<edges.length;i++){
   const e=edges[i];if(e.dead)continue;
   outgoing[e.u].push({id:i,from:e.u,to:e.v,dir:0});
   outgoing[e.v].push({id:i,from:e.v,to:e.u,dir:1});
  }
  for(const list of outgoing)list.sort((a,b)=>
   Math.atan2(nodes[a.to].z-nodes[a.from].z,nodes[a.to].x-nodes[a.from].x)-
   Math.atan2(nodes[b.to].z-nodes[b.from].z,nodes[b.to].x-nodes[b.from].x));
  const visited=new Set(),loops=[];
  const key=e=>e.id+':'+e.dir;
  for(const list of outgoing)for(const start of list){
   if(visited.has(key(start)))continue;
   const chain=[],walked=[],seen=new Set();let step=start,valid=false;
   for(let guard=0;guard<1201;guard++){
    const id=key(step);if(seen.has(id)){valid=id===key(start);break}
    seen.add(id);walked.push(id);
    const a=nodes[step.from],b=nodes[step.to];
    chain.push({point:{...a},segment:{a:{...a},b:{...b},thickness:edges[step.id].th}});
    const neighbors=outgoing[step.to],back=neighbors.findIndex(
     e=>e.id===step.id&&e.to===step.from);
    if(back<0||!neighbors.length)break;
    step=neighbors[(back+neighbors.length-1)%neighbors.length];
   }
   for(const id of walked)visited.add(id);
   if(!valid||chain.length<3||chain.length>1200)continue;
   const area=signedArea(chain.map(x=>x.point));
   if(area>.5)loops.push(chain); // bounded counter-clockwise face only
  }
  return loops;
 }

 function pointIn(poly,p){let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if((a.z>p.z)!==(b.z>p.z)&&
     p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }return inside;
 }
 function collectRooms(entries,storey){
  const lines=segmentize(entries,storey);
  const exact=traceLoops(lines).map(offsetRoom).filter(Boolean);
  if(exact.length)return exact;
  // Edited geometry may intersect before its original end caps. Only when
  // the proven legacy path fails do we attempt the more flexible graph path.
  return traceIntersectingLoops(lines).map(offsetRoom).filter(Boolean);
 }
 function resolve(tile,entries,bounds,options={}){
  if(tile?.kind!=='floor'||!tile.root||!bounds||bounds.isEmpty())
   return {ok:false,reason:'Для точной подрезки выбери стандартную плиту пола'};
  const rooms=options.rooms||collectRooms(entries,tile.storey);
  if(!rooms.length)return {ok:false,
   reason:'Не найден замкнутый контур стен на этом этаже. Открытые/неоднозначные стены автоматически не режем',
   openRoom:true};
  tile.root.updateWorldMatrix(true,true);
  const inv=tile.root.matrixWorld.clone().invert();
  const rect={minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z};
  let best=null;
  for(const world of rooms){
   const local=world.map(p=>{
    const v=new THREE.Vector3(p.x,tile.root.position.y,p.z).applyMatrix4(inv);
    return {x:v.x,z:v.z};
   });
   const intersection=FloorClip.contourFragments(rect,local);
   if(!intersection.length)continue;
   const area=intersection.reduce((sum,part)=>sum+FloorClip.polygonArea(part),0);
   if(area<.01)continue;
   const total=(rect.maxX-rect.minX)*(rect.maxZ-rect.minZ);
   // A self-crossing/duplicated loop can produce more area than the tile.
   if(area>total*1.005)continue;
   const middle={x:(rect.minX+rect.maxX)/2,z:(rect.minZ+rect.maxZ)/2};
   const includesCenter=pointIn(local,middle);
   const score=area+(includesCenter?total:0);
   if(!best||score>best.score)best={score,area,total,local,segments:world.length};
  }
  if(!best)return {ok:false,
   reason:'Плита находится вне замкнутого помещения либо граница неоднозначна. Плита не изменена'};
  if(best.total-best.area<.002)return {ok:false,unchanged:true,
   reason:'Плита уже целиком внутри стен — подрезка не требуется'};
  return {ok:true,contour:best.local,area:best.area,segments:best.segments,rooms:rooms.length};
 }
 return {segmentize,traceLoops,offsetRoom,collectRooms,resolve,signedArea};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoomFloorTrim;
