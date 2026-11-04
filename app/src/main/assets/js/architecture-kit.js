/* Phoenix Builder Studio 2.0 — zero-download modular architecture library.
 * Lightweight procedural meshes for doors, frames, normal/fantasy roofs.
 * Each create() returns a unique scene graph; no external GLB or network calls.
 */
const ArchitectureKit=(()=>{
 'use strict';
 const catalog=[
  {kind:'doorClassic',name:'🚪 Дверь — классическая',category:'prop',group:'doors'},
  {kind:'doorRound',name:'🚪 Дверь — округлый верх',category:'prop',group:'doors'},
  {kind:'doorGothic',name:'🚪 Дверь — готическая арка',category:'prop',group:'doors'},
  {kind:'doorRune',name:'🚪 Дверь — фэнтези / руны',category:'prop',group:'doors'},
  {kind:'doorDouble',name:'🚪 Дверь — двустворчатая',category:'prop',group:'doors'},
  {kind:'frameClassic',name:'▯ Рама — прямая',category:'prop',group:'frames'},
  {kind:'frameRound',name:'♧ Рама — полукруглая',category:'prop',group:'frames'},
  {kind:'frameGothic',name:'♜ Рама — стрельчатая',category:'prop',group:'frames'},
  {kind:'framePortal',name:'✦ Рама — магический портал',category:'prop',group:'frames'},
  {kind:'roofGable2',name:'🏠 Крыша — 2 ската, двускатная',category:'roof',group:'roofs'},
  {kind:'roofHip3',name:'🏠 Крыша — 3 ската, вальмовая',category:'roof',group:'roofs'},
  {kind:'roofHip4',name:'🏠 Крыша — 4 ската, вальмовая',category:'roof',group:'roofs'},
  {kind:'roofPyramid4',name:'🏠 Крыша — 4 ската, шатёр',category:'roof',group:'roofs'},
  {kind:'roofMansard',name:'🏠 Крыша — мансардная',category:'roof',group:'roofs'},
  {kind:'roofFantasySpire',name:'🏰 Крыша — фэнтези, высокий шпиль',category:'roof',group:'roofs'},
  {kind:'roofFantasyWitch',name:'🧙 Крыша — фэнтези, ведьмина',category:'roof',group:'roofs'},
  {kind:'roofFantasyTurret',name:'🏰 Крыша — фэнтези, башенная',category:'roof',group:'roofs'}
 ];
 const ids=new Set(catalog.map(e=>e.kind));
 const mat=(color,metalness=0,roughness=.7)=>new THREE.MeshStandardMaterial({
  color,roughness,metalness,side:THREE.DoubleSide});
 const wood=()=>mat(0x795034,0,.72),darkwood=()=>mat(0x392c36,0,.75),
  stone=()=>mat(0xb3a39b,0,.83),iron=()=>mat(0x4e5059,.65,.42),
  gold=()=>mat(0xd4aa56,.68,.32),rune=()=>new THREE.MeshStandardMaterial({
   color:0x69bcd9,emissive:0x147397,emissiveIntensity:.45,metalness:.35,roughness:.3});
 const shingles=()=>mat(0x8e4e42,0,.78),
  slate=()=>mat(0x414958,.1,.72),copper=()=>mat(0x55776f,.65,.45);
 function box(parent,name,x,y,z,w,h,d,material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);mesh.name=name;parent.add(mesh);return mesh;
 }
 function ball(parent,x,y,z,r,material){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),material);
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 function beam(parent,a,b,width,material,name='beam'){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);
  const len=from.distanceTo(to);
  if(len<1e-5)return null;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,len,width),material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());
  mesh.name=name;parent.add(mesh);return mesh;
 }
 function leaf(parent,w,h,mode,material,base=0){
  const shape=new THREE.Shape(),hw=w/2,r=hw;
  shape.moveTo(-hw,base);shape.lineTo(hw,base);
  if(mode==='round'){
   shape.lineTo(hw,base+h-r);
   for(let i=0;i<=12;i++){
    const t=i*Math.PI/12;
    shape.lineTo(hw*Math.cos(t),base+h-r+r*Math.sin(t));
   }
  }else if(mode==='gothic'){
   shape.lineTo(hw,base+h-.52);shape.lineTo(hw*.75,base+h-.34);
   shape.lineTo(0,base+h);
   shape.lineTo(-hw*.75,base+h-.34);shape.lineTo(-hw,base+h-.52);
  }else{shape.lineTo(hw,base+h);shape.lineTo(-hw,base+h)}
  shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,
   curveSegments:12,steps:1});
  geo.translate(0,0,-.0325);
  const mesh=new THREE.Mesh(geo,material);mesh.name='door:leaf';parent.add(mesh);
  return mesh;
 }
 function archPoints(w,h,mode){
  const hw=w/2,pts=[],r=hw;
  if(mode==='round'){
   for(let i=0;i<=12;i++){
    const t=i*Math.PI/12;
    pts.push([hw*Math.cos(t),h-r+r*Math.sin(t)]);
   }
  }else if(mode==='gothic'){
   for(const [x,y] of [[hw,h-.52],[hw*.75,h-.34],[0,h],
    [-hw*.75,h-.34],[-hw,h-.52]])pts.push([x,y]);
  }else pts.push([hw,h],[-hw,h]);
  return pts;
 }
 function frame(parent,w,h,mode,material,depth=.17){
  const sideHeight=mode==='round'?h-w/2:mode==='gothic'?h-.52:h;
  box(parent,'frame:left',-w/2-.045,sideHeight/2,.015,.095,sideHeight,depth,material);
  box(parent,'frame:right',w/2+.045,sideHeight/2,.015,.095,sideHeight,depth,material);
  const arch=archPoints(w,h,mode);
  for(let i=0;i<arch.length-1;i++){
   const [x0,y0]=arch[i],[x1,y1]=arch[i+1];
   const b=box(parent,'frame:arch',0,0,.015,
    Math.hypot(x1-x0,y1-y0)+.025,.09,depth,material);
   b.position.set((x0+x1)/2,(y0+y1)/2,.015);
   b.rotation.z=Math.atan2(y1-y0,x1-x0);
  }
  return parent;
 }
 function addStuds(parent,w,h,material,rows=4){
  for(let row=0;row<rows;row++)for(const side of [-1,1]){
   ball(parent,side*(w/2-.10),.22+row*(h-.4)/(rows-1),.065,.025,material);
  }
 }
 function doors(kind){
  const root=new THREE.Group();root.name=kind;
  let w=kind==='doorDouble'?1.55:.9,h=kind==='doorRune'?2.3:2.12;
  const mode=kind==='doorRound'?'round':
   ['doorGothic','doorRune'].includes(kind)?'gothic':'flat';
  const frameMat=kind==='doorRune'?darkwood():stone(),
   leafMat=kind==='doorRune'?darkwood():wood(),hardware=gold();
  frame(root,w,h,mode,frameMat,.17);
  if(kind==='doorDouble'){
   for(const dir of [-1,1]){
    const px=dir*w/2,pivot=new THREE.Group();
    pivot.name=dir<0?'door:pivot-left':'door:pivot-right';
    pivot.position.x=px;root.add(pivot);
    box(pivot,'door:leaf',-dir*w/4,h/2,0,w/2-.065,h-.13,.072,leafMat);
    box(pivot,'door:panel',-dir*w/4,h*.48,.047,w*.30,h*.46,.024,frameMat);
    for(const y of [.28,h-.27]){
     const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.09,8),hardware);
     hinge.position.set(0,y,.07);hinge.name='door:hinge';pivot.add(hinge);
    }
    ball(pivot,-dir*(w/2-.16),1.05,.075,.045,hardware);
   }
  }else{
   const pivot=new THREE.Group();pivot.name='door:pivot-left';
   pivot.position.x=-w/2;root.add(pivot);
   const inset=new THREE.Group();inset.position.x=w/2;pivot.add(inset);
   leaf(inset,w-.085,h-.095,mode,leafMat);
   for(const y of [.35,h-.35]){
    const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.10,8),hardware);
    hinge.position.set(0,y,.075);hinge.name='door:hinge';pivot.add(hinge);
   }
   ball(pivot,w-.12,1.05,.082,.05,hardware);
   if(kind==='doorClassic'){
    box(inset,'door:panel',0,h*.58,.046,w*.68,h*.38,.03,frameMat);
    box(inset,'door:panel',0,h*.20,.046,w*.68,h*.24,.03,frameMat);
   }else if(kind==='doorRound'){
    const points=archPoints(w-.19,h-.14,'round');
    for(let i=0;i<points.length-1;i++){
     beam(inset,[points[i][0],points[i][1],.069],
      [points[i+1][0],points[i+1][1],.069],.025,hardware,'door:arch-trim');
    }
    box(inset,'door:panel',0,.62,.046,w*.68,.85,.025,frameMat);
   }else{
    addStuds(inset,w-.1,h-.1,hardware,5);
    box(inset,'door:rib',0,1.12,.07,.052,1.65,.06,hardware);
    if(kind==='doorRune'){
     const gem=rune();
     for(let i=0;i<3;i++)ball(inset,0,.67+i*.42,.10,.065,gem);
     ball(root,0,h+.17,0,.095,gem);
    }
   }
  }
  return root;
 }
 function frames(kind){
  const root=new THREE.Group();root.name=kind;
  const mode=kind==='frameClassic'?'flat':kind==='frameRound'?'round':'gothic';
  const w=kind==='framePortal'?1.45:1.0;
  const h=kind==='framePortal'?2.7:2.2;
  const m=kind==='framePortal'?darkwood():stone(),trim=kind==='framePortal'?rune():gold();
  frame(root,w,h,mode,m,kind==='framePortal'?.28:.15);
  if(kind==='frameGothic'||kind==='framePortal'){
   box(root,'frame:keystone',0,h-.08,.11,.19,.18,.15,trim);
   for(const side of [-1,1]){
    box(root,'frame:column',side*(w/2+.09),.85,.01,.14,1.5,.21,m);
    ball(root,side*(w/2+.09),1.74,.1,.09,trim);
   }
  }
  if(kind==='framePortal'){
   for(const side of [-1,1])for(let i=0;i<3;i++)
    ball(root,side*(w/2+.13),.48+i*.50,.13,.06,trim);
  }
  return root;
 }
 function facet(parent,points,material,thickness=.11,name='roof:facet'){
  // Top face always points upward, bottom and edges close the actual slab.
  const p=points.map(a=>new THREE.Vector3(...a));
  if(p.length<3)return;
  const v0=new THREE.Vector3().subVectors(p[1],p[0]),
   v1=new THREE.Vector3().subVectors(p[2],p[0]);
  if(new THREE.Vector3().crossVectors(v0,v1).y<0)p.reverse();
  const coords=[],uv=[];
  const add=(v)=>{coords.push(v.x,v.y,v.z);uv.push(v.x*.5,v.z*.5)};
  const tri=(a,b,c)=>{add(a);add(b);add(c)};
  for(let i=1;i<p.length-1;i++){
   tri(p[0],p[i],p[i+1]);
   const a=p[0].clone().add(new THREE.Vector3(0,-thickness,0)),
    b=p[i].clone().add(new THREE.Vector3(0,-thickness,0)),
    c=p[i+1].clone().add(new THREE.Vector3(0,-thickness,0));
   tri(a,c,b);
  }
  for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length],
    c=b.clone().add(new THREE.Vector3(0,-thickness,0)),
    d=a.clone().add(new THREE.Vector3(0,-thickness,0));
   tri(a,d,c);tri(a,c,b);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,material);mesh.name=name;parent.add(mesh);return mesh;
 }
 function roofs(kind){
  const root=new THREE.Group();root.name=kind;
  const roofMat=kind==='roofFantasyWitch'?slate():
   kind==='roofFantasySpire'?slate():
   kind==='roofFantasyTurret'?copper():shingles();
  const trim=kind.startsWith('roofFantasy')?gold():mat(0x5f4a41,0,.7);
  // 4 x 4.4 m footprint; eave y=0, ridge/apex above it.
  const F=[-2,0,-2.2],B=[-2,0,2.2],C=[2,0,2.2],D=[2,0,-2.2];
  const rise=kind==='roofFantasyWitch'?1.95:1.35;
  const A=[0,rise,-2.2],E=[0,rise,2.2];
  if(kind==='roofGable2'){
   facet(root,[F,B,E,A],roofMat,.115);
   facet(root,[D,A,E,C],roofMat,.115);
   beam(root,A,E,.07,trim,'roof:ridge');
  }else if(kind==='roofHip3'){
   const S=[0,1.3,-1.05],T=[0,1.3,2.2];
   facet(root,[F,B,T,S],roofMat);
   facet(root,[D,S,T,C],roofMat);
   facet(root,[F,S,D],roofMat);
   beam(root,S,T,.065,trim,'roof:ridge');
  }else if(kind==='roofHip4'){
   const S=[0,1.25,-1.05],T=[0,1.25,1.05];
   facet(root,[F,B,T,S],roofMat);
   facet(root,[D,S,T,C],roofMat);
   facet(root,[F,S,D],roofMat);
   facet(root,[B,C,T],roofMat);
   beam(root,S,T,.07,trim,'roof:ridge');
  }else if(kind==='roofPyramid4'||kind==='roofFantasySpire'){
   const top=[kind==='roofFantasySpire'?.27:0,kind==='roofFantasySpire'?3.35:1.9,
    kind==='roofFantasySpire'?-.35:0];
   for(const [p,q] of [[F,B],[B,C],[C,D],[D,F]])facet(root,[p,q,top],roofMat,.12);
   if(kind==='roofFantasySpire'){
    for(let i=0;i<3;i++){
     const radius=.11+i*.06;
     ball(root,top[0],top[1]+i*.18,top[2],radius,trim);
    }
    beam(root,[...top],[top[0],top[1]+.6,top[2]],.075,trim,'roof:spire');
   }
  }else if(kind==='roofMansard'){
   const lower=[[F,B], [B,C], [C,D], [D,F]],
    upper=[[-1.1,.94,-1.15],[-1.1,.94,1.15],[1.1,.94,1.15],[1.1,.94,-1.15]];
   for(let i=0;i<4;i++){
    const [p,q]=lower[i],a=upper[i],b=upper[(i+1)%4];
    facet(root,[p,q,b,a],roofMat,.11,'roof:mansard');
    beam(root,a,b,.055,trim,'roof:cornice');
   }
   const capY=1.1;
   facet(root,[...upper.map(p=>[p[0],capY,p[2]])],roofMat,.12,'roof:flat-cap');
  }else if(kind==='roofFantasyWitch'){
   // Crooked dual-pitched roof with a flared skirt, ridge crest and crest ornaments.
   const R1=[-.22,.72,-1.85],R2=[-.22,.72,1.85];
   const high1=[.31,2.25,-2],high2=[.31,2.25,2];
   facet(root,[F,B,R2,R1],roofMat,.10,'roof:witch-skirt');
   facet(root,[D,R1,R2,C],roofMat,.10,'roof:witch-skirt');
   facet(root,[R1,R2,high2,high1],roofMat,.11,'roof:witch-upper');
   facet(root,[D,high1,high2,C],roofMat,.11,'roof:witch-upper');
   beam(root,high1,high2,.08,trim,'roof:crest');
   for(const z of [-1.75,0,1.75])ball(root,.31,2.3,z,.10,trim);
  }else if(kind==='roofFantasyTurret'){
   const segments=16,rr=2,rrTop=.12,h=2.6;
   for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const p=[rr*Math.cos(a),0,rr*Math.sin(a)],
     q=[rr*Math.cos(b),0,rr*Math.sin(b)],
     r=[rrTop*Math.cos(b)+.12,h,rrTop*Math.sin(b)],
     t=[rrTop*Math.cos(a)+.12,h,rrTop*Math.sin(a)];
    facet(root,[p,q,r,t],roofMat,.11,'roof:turret-slope');
   }
   const spike=[.12,h,0],tip=[.12,h+.65,0];
   beam(root,spike,tip,.08,trim,'roof:finial');
   ball(root,tip[0],tip[1],tip[2],.105,trim);
  }
  return root.children.length?root:null;
 }
 function create(kind){
  if(!ids.has(kind))return null;
  return kind.startsWith('door')?doors(kind):
   kind.startsWith('frame')?frames(kind):roofs(kind);
 }
 function openingStyle(value){return ['classic','round','gothic','rune','double'].includes(value)?value:'classic'}
 function frameStyle(value){return ['classic','round','gothic','portal'].includes(value)?value:'classic'}
 function decorateOpening(group,opening){
  const o=opening||{},st=openingStyle(o.doorStyle),fs=frameStyle(o.frameStyle);
  const accent=st==='rune'||fs==='portal'?rune():gold();
  const depth=.15;
  if(st==='rune'||fs==='portal'){
   for(let i=0;i<4;i++)for(const x of [-o.w/2+.12,o.w/2-.12]){
    const y=o.y+.33+i*Math.max(.12,(o.h-.7)/3);
    ball(group,x,y,depth,.045,accent);
   }
  }else if(st==='gothic'||fs==='gothic'){
   ball(group,0,o.y+o.h+.025,.10,.055,accent);
  }
 }
 return {catalog,create,has:kind=>ids.has(kind),openingStyle,frameStyle,decorateOpening,
  facet,archPoints};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ArchitectureKit;
