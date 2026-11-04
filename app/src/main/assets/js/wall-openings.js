/* Phoenix Builder: real through-openings and inserted hinged doors/windows.
 * Only for the built-in straight, static wall; no fake flat window stickers.
 * Saved in unscaled wall-local metres so holes survive project restore.
 */
const WallOpenings=(()=>{
 'use strict';
 const WIDTH=2,HEIGHT=2.6,MAX=6;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const num=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
 function normalize(list){
  if(!Array.isArray(list))return [];
  return list.slice(0,MAX).filter(o=>o&&['door','window'].includes(o.type))
   .map((o,i)=>({id:String(o.id||('cut-'+i)).replace(/[^\w-]/g,'').slice(0,28),
    type:o.type,x:clamp(num(o.x,0),-.95,.95),
    y:clamp(num(o.y,o.type==='door'?0:.85),0,2.45),
    w:clamp(num(o.w,o.type==='door'?.9:1),.35,1.85),
    h:clamp(num(o.h,o.type==='door'?2.05:1.05),.35,2.35),
    hinge:o.hinge==='right'?'right':'left',
    angle:clamp(num(o.angle,0),-160,160)}));
 }
 function validate(list){
  const a=normalize(list);
  if(a.length!==list.length)return {ok:false,reason:'Не более шести проёмов на одной стене'};
  for(const o of a){
   if(o.x-o.w/2<-.965||o.x+o.w/2>.965)
    return {ok:false,reason:'Проём выходит за левый или правый край стены'};
   if(o.y<0||o.y+o.h>HEIGHT-.08)
    return {ok:false,reason:'Проём не помещается по высоте стены'};
  }
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
   const p=a[i],q=a[j];
   if(Math.abs(p.x-q.x)<(p.w+q.w)/2+.025&&
      p.y<q.y+q.h+.025&&q.y<p.y+p.h+.025)
    return {ok:false,reason:'Проёмы пересекаются, сдвинь один из них'};
  }
  return {ok:true,openings:a};
 }
 function render(root,raw){
  if(!root||root.name!=='wall')return {ok:false,reason:'Выбери прямую стену из каталога'};
  const check=validate(raw||[]);
  if(!check.ok)return check;
  if(!check.openings.length)return {ok:true,changed:false};
  const base=root.children.find(c=>c.isMesh&&c.geometry?.isBufferGeometry);
  if(!base)return {ok:false,reason:'У стены нет исходной геометрии'};
  const g=base.geometry;
  g.computeBoundingBox();const box=g.boundingBox;
  // Base wall BoxGeometry is 2 x 2.6 x (physical thickness / horizontal scale).
  const depth=box.max.z-box.min.z,wallMat=base.material;
  root.remove(base);g.dispose();
  const parts=[];
  const wall=(w,h,d,x,y,z=0)=>{
   if(w<.001||h<.001)return;
   const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat);
   m.position.set(x,y,z);m.name='structure:wall';
   m.userData.phoenixWallSurface=true;root.add(m);parts.push(m);
  };
  const xs=[-WIDTH/2,WIDTH/2],ys=[0,HEIGHT];
  for(const o of check.openings){xs.push(o.x-o.w/2,o.x+o.w/2);ys.push(o.y,o.y+o.h)}
  const unique=arr=>[...new Set(arr.map(v=>Math.round(v*100000)/100000))].sort((a,b)=>a-b);
  const xLines=unique(xs),yLines=unique(ys);
  for(let xi=0;xi<xLines.length-1;xi++)for(let yi=0;yi<yLines.length-1;yi++){
   const x0=xLines[xi],x1=xLines[xi+1],y0=yLines[yi],y1=yLines[yi+1];
   const midX=(x0+x1)/2,midY=(y0+y1)/2;
   if(check.openings.some(o=>midX>o.x-o.w/2-1e-5&&midX<o.x+o.w/2+1e-5&&
       midY>o.y-1e-5&&midY<o.y+o.h+1e-5))continue;
   wall(x1-x0,y1-y0,depth,midX,midY);
  }
  const frameMat=new THREE.MeshStandardMaterial({color:0xb1a99a,metalness:.2,roughness:.55}),
   leafMat=new THREE.MeshStandardMaterial({color:0x795439,roughness:.63,metalness:.08}),
   hingeMat=new THREE.MeshStandardMaterial({color:0xe2b960,metalness:.85,roughness:.22}),
   glassMat=new THREE.MeshStandardMaterial({color:0x8ed9ed,metalness:.1,roughness:.15,
    transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide});
  const extra=(group,w,h,d,x,y,z,mat,name)=>{
   if(w<=0||h<=0||d<=0)return;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
   mesh.position.set(x,y,z);mesh.name=name;mesh.userData.phoenixInsert=true;
   group.add(mesh);return mesh;
  };
  for(const o of check.openings){
   const frame=new THREE.Group();frame.name='phoenixOpening:'+o.id;root.add(frame);
   const left=o.x-o.w/2,right=o.x+o.w/2,frameWidth=.045;
   extra(frame,frameWidth,o.h,depth+.035,left,o.y+o.h/2,0,frameMat,'frame:left');
   extra(frame,frameWidth,o.h,depth+.035,right,o.y+o.h/2,0,frameMat,'frame:right');
   extra(frame,o.w,frameWidth,depth+.035,o.x,o.y+o.h,0,frameMat,'frame:top');
   if(o.type==='window'){
    extra(frame,o.w,frameWidth,depth+.035,o.x,o.y,0,frameMat,'frame:bottom');
    extra(frame,o.w-frameWidth*2,o.h-frameWidth*2,.025,o.x,o.y+o.h/2,0,glassMat,'window:glass');
    extra(frame,.035,o.h,.09,o.x,o.y+o.h/2,0,frameMat,'frame:cross');
   }else{
    const dir=o.hinge==='left'?1:-1,hingeX=o.hinge==='left'?left+.045:right-.045;
    const pivot=new THREE.Group();pivot.name='phoenixDoorPivot:'+o.id;
    pivot.position.set(hingeX,0,0);pivot.userData.hingeSide=o.hinge;frame.add(pivot);
    const leafW=Math.max(.15,o.w-.11),leafH=Math.max(.2,o.h-.08);
    extra(pivot,leafW,leafH,.065,dir*leafW/2,o.y+.045+leafH/2,0,leafMat,'door:leaf');
    for(const offset of [.35,o.h-.33]){
     const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.09,10),hingeMat);
     hinge.position.set(0,o.y+offset,.045);hinge.name='door:hinge';
     pivot.add(hinge);
    }
    pivot.rotation.y=(o.angle*Math.PI/180)*(o.hinge==='right'?-1:1);
   }
  }
  return {ok:true,changed:true,wallPieces:parts.length,openings:check.openings.length};
 }
 function setDoorAngle(root,id,angle){
  const match=String(id);
  let pivot=null;
  root.traverse(o=>{if(o.name==='phoenixDoorPivot:'+match)pivot=o});
  if(!pivot)return false;
  pivot.rotation.y=clamp(Number(angle)||0,-160,160)*Math.PI/180*
   (pivot.userData.hingeSide==='right'?-1:1);
  return true;
 }
 return {normalize,validate,render,setDoorAngle,WIDTH,HEIGHT,MAX};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WallOpenings;
