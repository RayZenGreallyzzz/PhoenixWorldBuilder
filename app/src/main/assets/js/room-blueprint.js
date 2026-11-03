/* Phoenix Builder: metric rooms along a closed user-defined footprint.
 * No third-party app code or meshes. Walls remain individually editable.
 * Floor and ceiling are physical single-mesh polygons (concave supported).
 */
const RoomBlueprint=(()=>{
 const round=n=>Math.round(n*1e4)/1e4;
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const crossed=(a,b,c,d)=>{
  const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const p=orient(a,b,c),q=orient(a,b,d),r=orient(c,d,a),s=orient(c,d,b);
  return p*q< -1e-9&&r*s< -1e-9;
 };
 function normalize(points){
  if(!Array.isArray(points))throw Error('Нужен замкнутый контур комнаты');
  let p=points.map(v=>Array.isArray(v)?[Number(v[0]),Number(v[1])]:null);
  if(p.length>1&&p[0]&&p[p.length-1]&&dist(p[0],p[p.length-1])<.001)p.pop();
  if(p.length<3||p.length>32||p.some(v=>!v||v.some(n=>!Number.isFinite(n)||Math.abs(n)>45)))
   throw Error('Контур комнаты: 3–32 точки, координаты до 45 м');
  p=p.map(v=>v.map(round));
  for(let i=0;i<p.length;i++)
   if(dist(p[i],p[(i+1)%p.length])<.55)throw Error('Сегмент стены короче 55 см');
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
   if(j===i+1||(i===0&&j===p.length-1))continue;
   if(crossed(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))
    throw Error('Контур самопересекается: проверь точки');
  }
  const area=p.reduce((v,a,i)=>{
   const b=p[(i+1)%p.length];return v+a[0]*b[1]-b[0]*a[1];
  },0)*.5;
  if(Math.abs(area)<.2)throw Error('Контур комнаты имеет нулевую площадь');
  if(area<0)p.reverse();
  return p;
 }
 function rectangle(width=5,depth=4){
  const w=Math.min(30,Math.max(1,Number(width)||5))/2;
  const d=Math.min(30,Math.max(1,Number(depth)||4))/2;
  return normalize([[-w,-d],[w,-d],[w,d],[-w,d]]);
 }
 function parse(text){
  const pieces=String(text||'').trim().split(/[;\n]+/);
  const points=pieces.map(s=>s.trim().split(/\s*,\s*|\s+/).map(Number));
  return normalize(points);
 }
 function slab(points,thickness=.18){
  const outline=normalize(points),depth=Math.min(.8,Math.max(.04,Number(thickness)||.18));
  // ShapeGeometry lies on XY; rotating X by -90° places the polygon on XZ,
  // and extrudes it upward in Y. Negate Z to preserve the local footprint.
  const shape=new THREE.Shape();
  for(let i=0;i<outline.length;i++){
   const [x,z]=outline[i];if(!i)shape.moveTo(x,-z);else shape.lineTo(x,-z);
  }
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:1});
  geometry.rotateX(-Math.PI/2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const root=new THREE.Group(),mesh=new THREE.Mesh(geometry,
   new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,side:THREE.DoubleSide}));
  mesh.receiveShadow=true;root.add(mesh);
  root.userData.pwbRoomSlab=true;
  root.userData.pwbRoomPolygon={points:outline,thickness:round(depth)};
  return root;
 }
 function plan(points,{x=0,z=0,y=0,height=2.6,thickness=.22,
     slabThickness=.18,ceiling=false,levels=1}={}){
  const outline=normalize(points);
  const h=Math.min(8,Math.max(1.5,Number(height)||2.6));
  const t=Math.min(.7,Math.max(.06,Number(thickness)||.22));
  const floorT=Math.min(.65,Math.max(.04,Number(slabThickness)||.18));
  const floors=Math.min(5,Math.max(1,Math.round(Number(levels)||1)));
  const result=[];
  for(let level=0;level<floors;level++){
   const base=Number(y)+level*(h+floorT);
   result.push({kind:'proomslab',category:'foundation',pos:[x,base,z],rot:0,
    roomPolygon:{points:outline,thickness:floorT},storey:level});
   for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    result.push({kind:'pwall',category:'wall',
     pos:[x+(a[0]+b[0])/2,base+floorT,z+(a[1]+b[1])/2],
     rot:Math.atan2(-dz,dx)*180/Math.PI,
     paramWall:{length:round(length),height:round(h),thickness:round(t),openings:[]},
     storey:level});
   }
  }
  if(ceiling)result.push({kind:'proomslab',category:'ceiling',
   pos:[x,Number(y)+floors*(h+floorT),z],rot:0,
   roomPolygon:{points:outline,thickness:floorT},storey:floors});
  return result;
 }
 return {normalize,rectangle,parse,slab,plan};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoomBlueprint;