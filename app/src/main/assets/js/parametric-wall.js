/* Parametric construction walls with real door/window openings.
 * Architectural shape and opening coordinates are independent from material,
 * GLB visuals and the magnet. Every opening passes through the wall mesh:
 * no textured fake windows and no CSG operations on heavy imported models.
 */
const ParametricWall=(()=>{
 const kinds=new Set(['pwall','pwindow','pdoor']);
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
 const round=v=>Math.round(v*10000)/10000;
 function defaults(kind='pwall'){
  const out={length:2,height:2.6,thickness:.22,openings:[]};
  if(kind==='pwindow')out.openings=[{type:'window',width:1.1,height:1.15,sill:.9,offset:0}];
  else if(kind==='pdoor')out.openings=[{type:'door',width:1.05,height:2.17,sill:0,offset:0}];
  return out;
 }
 function normalize(raw=null,kind='pwall'){
  const source=raw&&typeof raw==='object'?raw:defaults(kind);
  const length=round(clamp(finite(source.length,2),.7,24));
  const height=round(clamp(finite(source.height,2.6),1,9));
  const thickness=round(clamp(finite(source.thickness,.22),.06,1));
  const openings=[];
  for(const value of Array.isArray(source.openings)?source.openings.slice(0,8):[]){
   if(!value||!['door','window'].includes(value.type))continue;
   const type=value.type;
   const width=round(clamp(finite(value.width,1.1),.3,Math.max(.3,length-.16)));
   const maxHeight=Math.max(.3,height-.08);
   const holeHeight=round(clamp(finite(value.height,1.2),.3,maxHeight));
   const sill=type==='door'?0:round(clamp(finite(value.sill,.8),.06,Math.max(.06,height-holeHeight-.06)));
   // A door touches the floor. Windows must leave a small intact lintel.
   const actualHeight=round(Math.min(holeHeight,height-sill-.06));
   const actualOffset=round(clamp(finite(value.offset,0),
    -Math.max(0,(length-width)/2-.04),Math.max(0,(length-width)/2-.04)));
   openings.push({type,width,height:actualHeight,sill,offset:actualOffset});
  }
  return {length,height,thickness,openings};
 }
 function build(kind='pwall',raw=null){
  const spec=normalize(raw,kind);
  const root=new THREE.Group(),half=spec.length/2,eps=.00001;
  const stopsX=[-half,half],stopsY=[0,spec.height];
  const holes=spec.openings.map(o=>{
   const x0=o.offset-o.width/2,x1=o.offset+o.width/2;
   const y0=o.sill,y1=o.sill+o.height;
   stopsX.push(x0,x1);stopsY.push(y0,y1);
   return {x0,x1,y0,y1};
  });
  const unique=values=>[...new Set(values.map(round))].sort((a,b)=>a-b);
  const xs=unique(stopsX),ys=unique(stopsY);
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,side:THREE.DoubleSide});
  for(let i=0;i<xs.length-1;i++){
   const left=xs[i],right=xs[i+1],dx=right-left;
   if(dx<eps)continue;
   for(let j=0;j<ys.length-1;j++){
    const bottom=ys[j],top=ys[j+1],dy=top-bottom;
    if(dy<eps)continue;
    const cx=(left+right)/2,cy=(bottom+top)/2;
    if(holes.some(h=>cx>h.x0+eps&&cx<h.x1-eps&&cy>h.y0+eps&&cy<h.y1-eps))
     continue; // This prism is the actual open air of a door or window.
    const piece=new THREE.Mesh(new THREE.BoxGeometry(dx,dy,spec.thickness),material);
    piece.position.set(cx,cy,0);piece.receiveShadow=true;piece.castShadow=false;
    root.add(piece);
   }
  }
  root.name=kind;
  root.userData.pwbParametricWall=true;
  root.userData.pwbModuleUse='wall';
  root.userData.pwbParamWall=spec;
  // Explicit straight-wall endpoints; collision and endpoint snapping operate
  // on this structural baseline even when door/window voids remove mesh.
  root.userData.pwbModuleSockets=[
   {point:[-half,0,0],out:[-1,0,0],role:'wall-end'},
   {point:[half,0,0],out:[1,0,0],role:'wall-end'}
  ];
  return root;
 }
 return {kinds,defaults,normalize,build};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ParametricWall;
