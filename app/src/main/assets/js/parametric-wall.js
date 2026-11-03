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
  // A SINGLE mesh: no inner box faces between adjacent solid sections.
  // Adjacent faces use continuous UV coordinates over the full wall,
  // so windows never turn one facade into visibly separate blocks.
  const solid=xs.slice(0,-1).map((_,i)=>ys.slice(0,-1).map((_,j)=>{
   const cx=(xs[i]+xs[i+1])/2,cy=(ys[j]+ys[j+1])/2;
   return !holes.some(h=>cx>h.x0+eps&&cx<h.x1-eps&&cy>h.y0+eps&&cy<h.y1-eps);
  }));
  const vertices=[],normals=[],uvs=[];
  const zmin=-spec.thickness/2,zmax=spec.thickness/2;
  const pos=(x,y,z)=>[x,y,z];
  const uvFront=(x,y)=>[(x+half)/spec.length,y/spec.height];
  const uvSide=(z,y)=>[(z-zmin)/spec.thickness,y/spec.height];
  const uvTop=(x,z)=>[(x+half)/spec.length,(z-zmin)/spec.thickness];
  function quad(a,b,c,d,ua,ub,uc,ud,reverse=false){
   const v=reverse?[a,d,c,b]:[a,b,c,d],uv=reverse?[ua,ud,uc,ub]:[ua,ub,uc,ud];
   const ab=v[1].map((x,i)=>x-v[0][i]),ac=v[2].map((x,i)=>x-v[0][i]);
   let nx=ab[1]*ac[2]-ab[2]*ac[1],ny=ab[2]*ac[0]-ab[0]*ac[2],
    nz=ab[0]*ac[1]-ab[1]*ac[0];
   const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
   for(const i of [0,1,2,0,2,3]){
    vertices.push(...v[i]);uvs.push(...uv[i]);normals.push(nx,ny,nz);
   }
  }
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
   if(!solid[i][j])continue;
   const x0=xs[i],x1=xs[i+1],y0=ys[j],y1=ys[j+1];
   if(x1-x0<eps||y1-y0<eps)continue;
   // Front and back form two continuous planes, with real holes.
   quad(pos(x0,y0,zmax),pos(x1,y0,zmax),pos(x1,y1,zmax),pos(x0,y1,zmax),
    uvFront(x0,y0),uvFront(x1,y0),uvFront(x1,y1),uvFront(x0,y1));
   quad(pos(x0,y0,zmin),pos(x1,y0,zmin),pos(x1,y1,zmin),pos(x0,y1,zmin),
    uvFront(x0,y0),uvFront(x1,y0),uvFront(x1,y1),uvFront(x0,y1),true);
   // Side faces appear ONLY on outside edges or real jamb/lintel edges,
   // not between adjacent cells of the same wall.
   if(i===0||!solid[i-1][j])
    quad(pos(x0,y0,zmin),pos(x0,y0,zmax),pos(x0,y1,zmax),pos(x0,y1,zmin),
     uvSide(zmin,y0),uvSide(zmax,y0),uvSide(zmax,y1),uvSide(zmin,y1));
   if(i===solid.length-1||!solid[i+1][j])
    quad(pos(x1,y0,zmin),pos(x1,y0,zmax),pos(x1,y1,zmax),pos(x1,y1,zmin),
     uvSide(zmin,y0),uvSide(zmax,y0),uvSide(zmax,y1),uvSide(zmin,y1),true);
   if(j===0||!solid[i][j-1])
    quad(pos(x0,y0,zmin),pos(x1,y0,zmin),pos(x1,y0,zmax),pos(x0,y0,zmax),
     uvTop(x0,zmin),uvTop(x1,zmin),uvTop(x1,zmax),uvTop(x0,zmax));
   if(j===ys.length-2||!solid[i][j+1])
    quad(pos(x0,y1,zmin),pos(x1,y1,zmin),pos(x1,y1,zmax),pos(x0,y1,zmax),
     uvTop(x0,zmin),uvTop(x1,zmin),uvTop(x1,zmax),uvTop(x0,zmax),true);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.receiveShadow=true;mesh.castShadow=false;
  root.add(mesh);
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
