/* Phoenix Builder v2: genuine openings following straight, corner and curved
 * wall centrelines, including join-spanning cuts across adjacent modules.
 * All opening measurements are unscaled path metres, heights local metres.
 * Shared group IDs support atomic create/remove across a physical seam.
 */
const WallOpenings=(()=>{
 'use strict';
 const HEIGHT=2.6,MAX=12,EPS=1e-5,R=2;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const archStyles=['round','gothic','rune'];
 const kit=typeof ArchitectureKit!=='undefined'?ArchitectureKit:
  (typeof require==='function'?require('./architecture-kit.js'):null);
 const finite=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 const supported=kind=>['wall','corner','arc90','arc180'].includes(kind);
 function profile(kind,thickness=.22,axes={x:1,y:1,z:1}){
  if(!supported(kind))return null;
  const sx=Math.max(.1,Math.abs(finite(axes.x,1))),sz=Math.max(.1,Math.abs(finite(axes.z,1)));
  const thick=clamp(finite(thickness,.22),.025,.8);
  const length=kind==='wall'?2:kind==='corner'?3.8:
   kind==='arc90'?Math.PI:2*Math.PI;
  const pos=s=>{
   const t=clamp(s,0,length);
   if(kind==='wall')return {x:t-1,z:0,nx:0,nz:1};
   if(kind==='corner'){
    // Smooth centreline follows the actual two straight arms of the L-module.
    if(t<=1.9)return {x:-1.9+t,z:0,nx:0,nz:1};
    return {x:0,z:-(t-1.9),nx:1,nz:0};
   }
   const theta=t/R;
   return {x:R*Math.cos(theta),z:R*Math.sin(theta),nx:Math.cos(theta),nz:Math.sin(theta)};
  };
  const sides=(s,side)=>{
   const p=pos(s),nx=p.nx/sx,nz=p.nz/sz,n=Math.hypot(nx,nz)||1;
   return {x:p.x+side*thick/2*nx/n/sx,z:p.z+side*thick/2*nz/n/sz};
  };
  return {kind,length,thickness:thick,pos,sides,sx,sz};
 }
 function normalize(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(0,MAX).filter(o=>o&&['door','window'].includes(o.type))
   .map((o,i)=>({id:String(o.id||'cut-'+i).replace(/[^a-z\d:_-]/gi,'').slice(0,64),
    group:String(o.group||o.id||'cut-'+i).replace(/[^a-z\d:_-]/gi,'').slice(0,64),
    type:o.type,x:clamp(finite(o.x,0),-10,10),y:clamp(finite(o.y,o.type==='door'?0:.85),0,2.45),
    w:clamp(finite(o.w,o.type==='door'?.9:1),.05,8),
    h:clamp(finite(o.h,o.type==='door'?2.05:1.05),.1,2.45),
    hinge:o.hinge==='right'?'right':'left',
    doorStyle:kit?kit.openingStyle(o.doorStyle):'classic',
    frameStyle:kit?kit.frameStyle(o.frameStyle):'classic',
    angle:clamp(finite(o.angle,0),-160,160),
    omitStartFrame:o.omitStartFrame===true,omitEndFrame:o.omitEndFrame===true}));
 }
 function validate(list,kind='wall'){
  if(!supported(kind))return {ok:false,reason:'Нужна стандартная стена, угол или дуга'};
  const a=normalize(list);
  if(a.length!==list.length)return {ok:false,reason:'Не больше '+MAX+' проёмов на одном модуле'};
  const prof=profile(kind);
  for(const o of a){
   const s=prof.length/2+o.x;
   if(s-o.w/2<-.002||s+o.w/2>prof.length+.002)
    return {ok:false,reason:'Проём выходит за конец этого участка стены'};
   if(o.y<-.001||o.y+o.h>HEIGHT-.07)
    return {ok:false,reason:'Проём слишком высокий или выходит за стену'};
  }
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
   const p=a[i],q=a[j];
   if(Math.abs(p.x-q.x)<(p.w+q.w)/2+.024&&
      p.y<q.y+q.h+.024&&q.y<p.y+p.h+.024)
    return {ok:false,reason:'Проёмы перекрываются'};
  }
  return {ok:true,openings:a};
 }
 function pathEdges(prof,list){
  const keys=[0,prof.length];
  for(const o of list){keys.push(prof.length/2+o.x-o.w/2,prof.length/2+o.x+o.w/2)}
  if(prof.kind==='corner')keys.push(1.9);
  const maxStep=prof.kind.startsWith('arc')?.06:.22;
  for(let s=0;s<prof.length;s+=maxStep)keys.push(Math.min(prof.length,s));
  return [...new Set(keys.map(v=>Math.round(v*100000)/100000))]
   .sort((a,b)=>a-b);
 }
 function geometry(prof,list){
  const coords=[],uv=[];
  const pts=(s,y,side)=>{const p=prof.sides(s,side);return [p.x,y,p.z]};
  const vertex=(p,u,v)=>{coords.push(...p);uv.push(u,v)};
  const tri=(a,b,c,ua,va,ub,vb,uc,vc)=>{
   vertex(a,ua,va);vertex(b,ub,vb);vertex(c,uc,vc);
  };
  const quad=(a,b,c,d,u0,u1,v0,v1)=>{
   tri(a,b,c,u0,v0,u1,v0,u1,v1);tri(a,c,d,u0,v0,u1,v1,u0,v1);
  };
  const xs=pathEdges(prof,list),ys=[0,HEIGHT];
  for(const o of list)ys.push(o.y,o.y+o.h);
  const heights=[...new Set(ys.map(y=>Math.round(y*100000)/100000))].sort((a,b)=>a-b);
  const inside=(s,y)=>list.some(o=>
   s>prof.length/2+o.x-o.w/2-EPS&&s<prof.length/2+o.x+o.w/2+EPS&&
   y>o.y-EPS&&y<o.y+o.h+EPS);
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<heights.length-1;j++){
   const s0=xs[i],s1=xs[i+1],y0=heights[j],y1=heights[j+1];
   if(s1-s0<EPS||y1-y0<EPS||inside((s0+s1)/2,(y0+y1)/2))continue;
   const a=pts(s0,y0,-1),b=pts(s1,y0,-1),c=pts(s1,y1,-1),d=pts(s0,y1,-1);
   const e=pts(s0,y0,1),f=pts(s1,y0,1),g=pts(s1,y1,1),h=pts(s0,y1,1);
   quad(a,b,c,d,s0,s1,y0,y1);quad(f,e,h,g,s0,s1,y0,y1);
   const hasBelow=j>0&&!inside((s0+s1)/2,(heights[j-1]+heights[j])/2);
   const hasAbove=j<heights.length-2&&!inside((s0+s1)/2,(heights[j+1]+heights[j+2])/2);
   const hasBefore=i>0&&!inside((xs[i-1]+xs[i])/2,(y0+y1)/2);
   const hasAfter=i<xs.length-2&&!inside((xs[i+1]+xs[i+2])/2,(y0+y1)/2);
   if(!hasBelow)quad(e,f,b,a,s0,s1,0,prof.thickness);
   if(!hasAbove)quad(d,c,g,h,s0,s1,0,prof.thickness);
   if(!hasBefore)quad(e,a,d,h,0,prof.thickness,y0,y1);
   if(!hasAfter)quad(b,f,g,c,0,prof.thickness,y0,y1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
 }
 function meshBand(prof,s0,s1,y0,y1,depth,mat,parent,name,offset=null){
  if(s1-s0<EPS||y1-y0<EPS)return null;
  const sections=[],step=prof.kind.startsWith('arc')?.06:.18;
  for(let x=s0;x<s1;x+=step)sections.push(x);
  sections.push(s1);
  const ps=[],uv=[];
  const add=(p,u,v)=>{ps.push(p.x-(offset?.x||0),p.y-(offset?.y||0),p.z-(offset?.z||0));uv.push(u,v)};
  const tri=(a,b,c,u0,v0,u1,v1,u2,v2)=>{add(a,u0,v0);add(b,u1,v1);add(c,u2,v2)};
  const quad=(a,b,c,d,u0,u1,v0,v1)=>{
   tri(a,b,c,u0,v0,u1,v0,u1,v1);tri(a,c,d,u0,v0,u1,v1,u0,v1);
  };
  const pt=(s,y,sign)=>{
   const p=prof.pos(s),nx=p.nx/prof.sx,nz=p.nz/prof.sz,n=Math.hypot(nx,nz)||1;
   return {x:p.x+sign*depth/2*nx/n/prof.sx,z:p.z+sign*depth/2*nz/n/prof.sz,y};
  };
  for(let i=0;i<sections.length-1;i++){
   const a=sections[i],b=sections[i+1];
   for(const side of [-1,1]){
    const q0=pt(a,y0,side),q1=pt(b,y0,side),q2=pt(b,y1,side),q3=pt(a,y1,side);
    quad(q0,q1,q2,q3,a,b,y0,y1);
   }
   quad(pt(a,y1,-1),pt(b,y1,-1),pt(b,y1,1),pt(a,y1,1),a,b,0,depth);
   quad(pt(a,y0,1),pt(b,y0,1),pt(b,y0,-1),pt(a,y0,-1),a,b,0,depth);
  }
  for(const s of [s0,s1]){
   quad(pt(s,y0,-1),pt(s,y0,1),pt(s,y1,1),pt(s,y1,-1),0,depth,y0,y1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,mat);mesh.name=name;
  mesh.userData.phoenixInsert=true;parent.add(mesh);return mesh;
 }
 // Select a curved or pointed head; the interior masonry is built to match.
 function archMode(o){
  if(o.omitStartFrame||o.omitEndFrame)return null;
  if(o.type==='door'&&archStyles.includes(o.doorStyle))
   return o.doorStyle==='round'?'round':'gothic';
  if(o.frameStyle==='round'||o.frameStyle==='gothic'||o.frameStyle==='portal')
   return o.frameStyle==='round'?'round':'gothic';
  return null;
 }
 function archTop(o,s,prof,mode){
  const centre=prof.length/2+o.x,half=Math.max(.05,o.w/2),
   ratio=clamp(Math.abs(s-centre)/half,0,1);
  if(mode==='round'){
   const height=Math.min(half,.55);
   return o.y+o.h-height+height*Math.sqrt(Math.max(0,1-ratio*ratio));
  }
  return o.y+o.h-Math.min(.56,o.h*.35)*ratio;
 }
 // A curved band with real thickness, per-point upper and lower elevations.
 // It is used for curved door leaves, ornamental arch trim and the wall arch-cap.
 function variableBand(prof,s0,s1,lower,upper,depth,material,parent,name,offset=null){
  const n=Math.max(3,Math.ceil((s1-s0)/.045)),pos=[],uv=[];
  const point=(s,y,side)=>{
   const p=prof.pos(s),nx=p.nx/prof.sx,nz=p.nz/prof.sz,len=Math.hypot(nx,nz)||1;
   return [p.x+side*depth/2*nx/len/prof.sx-(offset?.x||0),
    y-(offset?.y||0),
    p.z+side*depth/2*nz/len/prof.sz-(offset?.z||0)];
  };
  function add(p,u,v){pos.push(...p);uv.push(u,v)}
  function tri(a,b,c,ua,va,ub,vb,uc,vc){
   add(a,ua,va);add(b,ub,vb);add(c,uc,vc);
  }
  function face(a,b,c,d,s0,s1,y0,y1){
   tri(a,b,c,s0,y0,s1,y0,s1,y1);
   tri(a,c,d,s0,y0,s1,y1,s0,y1);
  }
  for(let i=0;i<n;i++){
   const a=s0+(s1-s0)*i/n,b=s0+(s1-s0)*(i+1)/n;
   const lowA=lower(a),lowB=lower(b),highA=upper(a),highB=upper(b);
   if(Math.max(highA-lowA,highB-lowB)<.0001)continue;
   for(const side of [-1,1]){
    face(point(a,lowA,side),point(b,lowB,side),point(b,highB,side),
     point(a,highA,side),a,b,lowA,highB);
   }
   face(point(a,highA,-1),point(b,highB,-1),point(b,highB,1),
    point(a,highA,1),a,b,0,depth);
   face(point(a,lowA,1),point(b,lowB,1),point(b,lowB,-1),
    point(a,lowA,-1),a,b,0,depth);
  }
  for(const end of [s0,s1]){
   const lo=lower(end),hi=upper(end);
   if(hi-lo<.0001)continue;
   face(point(end,lo,-1),point(end,lo,1),point(end,hi,1),point(end,hi,-1),
    0,depth,lo,hi);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,material);mesh.name=name;
  mesh.userData.phoenixInsert=true;parent.add(mesh);
  return mesh;
 }
 function infill(root,prof,o){
  const s0=prof.length/2+o.x-o.w/2,s1=s0+o.w,
   fw=Math.min(.045,o.w/6),depth=prof.thickness+.035;
  const frame=new THREE.Group();frame.name='phoenixOpening:'+o.id;root.add(frame);
  const frameMat=new THREE.MeshStandardMaterial({color:0xb1a99a,metalness:.2,roughness:.55,side:THREE.DoubleSide}),
   leafMat=new THREE.MeshStandardMaterial({color:0x795439,roughness:.63,metalness:.08,side:THREE.DoubleSide}),
   hingeMat=new THREE.MeshStandardMaterial({color:0xe2b960,metalness:.85,roughness:.22}),
   glassMat=new THREE.MeshStandardMaterial({color:0x8ed9ed,metalness:.1,roughness:.15,
    transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide});
  if(!o.omitStartFrame)meshBand(prof,s0,s0+fw,o.y,o.y+o.h,depth,frameMat,frame,'frame:left');
  if(!o.omitEndFrame)meshBand(prof,s1-fw,s1,o.y,o.y+o.h,depth,frameMat,frame,'frame:right');
  meshBand(prof,s0,s1,o.y+o.h-fw,o.y+o.h,depth,frameMat,frame,'frame:top');
  if(o.type==='window'){
   meshBand(prof,s0,s1,o.y,o.y+fw,depth,frameMat,frame,'frame:bottom');
   meshBand(prof,s0+(o.omitStartFrame?.008:fw),s1-(o.omitEndFrame?.008:fw),
    o.y+fw,o.y+o.h-fw,.024,glassMat,frame,'window:glass');
  }else{
   const leafStart=s0+(o.omitStartFrame?.008:fw);
   const leafEnd=s1-(o.omitEndFrame?.008:fw);
   const hingeS=o.hinge==='left'?leafStart:leafEnd,loc=prof.pos(hingeS);
   const pivot=new THREE.Group();
   pivot.name='phoenixDoorPivot:'+o.id;pivot.userData.hingeSide=o.hinge;
   pivot.position.set(loc.x,0,loc.z);frame.add(pivot);
   meshBand(prof,leafStart,leafEnd,o.y+.045,o.y+o.h-.035,.066,
    leafMat,pivot,'door:leaf',{x:loc.x,y:0,z:loc.z});
   for(const y of [o.y+.3,o.y+o.h-.3]){
    const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.11,10),hingeMat);
    cyl.name='door:hinge';cyl.position.set(0,y,.04);pivot.add(cyl);
   }
   pivot.rotation.y=o.angle*Math.PI/180*(o.hinge==='right'?-1:1);
  }
 }
 function render(root,kind,raw,settings={}){
  if(!supported(kind))return {ok:false,reason:'Вырезание поддерживает прямые, угловые и кривые стены'};
  const check=validate(raw||[],kind);
  if(!check.ok)return check;
  if(!check.openings.length)return {ok:true,changed:false};
  const prof=profile(kind,settings.thickness,settings.axes),wallMat=root.children.find(o=>o.isMesh)?.material;
  if(!wallMat)return {ok:false,reason:'Не найдена основная поверхность стены'};
  const shape=geometry(prof,check.openings);
  if(shape.attributes.position.count<3)return {ok:false,reason:'Проём полностью разрушает стену'};
  // The new shape contains actual full-depth openings, not an overlay mask.
  for(const o of [...root.children])o.removeFromParent();
  const wall=new THREE.Mesh(shape,wallMat);wall.name='structure:wall';
  wall.userData.phoenixWallSurface=true;root.add(wall);
  for(const o of check.openings)infill(root,prof,o);
  return {ok:true,changed:true,triangles:shape.attributes.position.count/3,
   openings:check.openings.length};
 }
 function setDoorAngle(root,id,angle){
  let pivot=null;
  root.traverse(o=>{if(o.name==='phoenixDoorPivot:'+id)pivot=o});
  if(!pivot)return false;
  pivot.rotation.y=clamp(Number(angle)||0,-160,160)*Math.PI/180*
   (pivot.userData.hingeSide==='right'?-1:1);
  return true;
 }
 function splitAtJunction(owner,neighbors,raw,preferredNeighborId=null){
  const prof=profile(owner.kind,owner.thickness,owner.axes);
  if(!prof)return {ok:false,reason:'Выбери стандартную стену, угол или дугу'};
  const o=normalize([raw])[0];
  if(!o)return {ok:false,reason:'Нужен проём двери или окна'};
  const s=prof.length/2+o.x,left=s-o.w/2,right=s+o.w/2;
  if(left>=0&&right<=prof.length)return {ok:true,parts:[{entry:owner,opening:o}]};
  if(left<0&&right>prof.length)return {ok:false,reason:'Ширина проёма превышает два соединённых участка'};
  const atStart=left<0,overflow=atStart?-left:right-prof.length;
  const mainStart=Math.max(0,left),mainEnd=Math.min(prof.length,right);
  if(mainEnd-mainStart<.06||overflow<.06)return {ok:false,
   reason:'Положение у стыка слишком близко к краю; сдвинь центр проёма на несколько сантиметров'};
  const ownSocket=CleanGeometry.worldSockets(owner)[atStart?0:1];
  const matches=[];
  for(const entry of neighbors||[]){
   if(entry===owner||entry.id===owner.id||entry.category!=='wall'||entry.storey!==owner.storey||
       !supported(entry.kind))continue;
   const sockets=CleanGeometry.worldSockets(entry);
   for(let i=0;i<sockets.length;i++){
    const dst=sockets[i].point.distanceTo(ownSocket.point);
    if(dst<=.12)matches.push({entry,index:i,distance:dst});
   }
  }
  matches.sort((a,b)=>a.distance-b.distance);
  if(preferredNeighborId!==null&&preferredNeighborId!==undefined&&preferredNeighborId!==''){
   const found=matches.find(m=>String(m.entry.id)===String(preferredNeighborId));
   if(!found)return {ok:false,reason:'Выбранная вторая стена не подключена к этому краю'};
   matches.length=0;matches.push(found);
  }
  if(!matches.length)return {ok:false,
   reason:'Проём пересекает край стены, но рядом нет соединённой стены'};
  if(matches.length>1&&matches[1].distance-matches[0].distance<.02)
   return {ok:false,reason:'На стыке несколько стен — укажи конкретную соседнюю стену'};
  const next=matches[0],nextProf=profile(next.entry.kind,next.entry.thickness,next.entry.axes);
  if(overflow>nextProf.length-.05)return {ok:false,
   reason:'Проём слишком широк для двух соединённых стен'};
  const group=o.group||o.id,mainWidth=mainEnd-mainStart,
   main={...o,id:group+'-a',group,x:(mainStart+mainEnd)/2-prof.length/2,w:mainWidth},
   adjacentStart=next.index===0?0:nextProf.length-overflow,
   adjacent={...o,id:group+'-b',group,
    x:adjacentStart+overflow/2-nextProf.length/2,w:overflow};
  // Two connected parts form a continuous void, without a false doorjamb
  // standing in the middle of the physical seam. Doors form a double leaf.
  if(atStart)main.omitStartFrame=true;
  else main.omitEndFrame=true;
  if(next.index===0)adjacent.omitStartFrame=true;
  else adjacent.omitEndFrame=true;
  if(o.type==='door'){
   main.hinge=atStart?'right':'left';
   adjacent.hinge=next.index===0?'right':'left';
  }
  return {ok:true,parts:[{entry:owner,opening:main},{entry:next.entry,opening:adjacent}],
   joint:true};
 }
 return {supported,profile,normalize,validate,geometry,render,setDoorAngle,
  splitAtJunction,HEIGHT,MAX};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WallOpenings;
