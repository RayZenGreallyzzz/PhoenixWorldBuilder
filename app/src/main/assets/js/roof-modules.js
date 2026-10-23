/* Phoenix Builder: white modular roof kit. Each piece has its own fresh
 * geometry and material and can be rotated/resized with existing controls.
 * Complete roof templates contain exactly 1..6 independent sloped faces.
 * No geometry is stored in app data or the asset library.
 */
const RoofModules=(()=>{
 const kinds=new Set([
  'roof1','roof2','roof3','roof4','roof5','roof6',
  'roofSlope','roofRidge','roofValley','roofHip','roofEave',
  'roofFlat','roofInnerCorner','roofOuterCorner','roofGable'
 ]);
 const HEIGHT=1,THICKNESS=.12;
 const material=()=>new THREE.MeshStandardMaterial({
  color:'#ffffff',roughness:.86,metalness:0,side:THREE.DoubleSide
 });
 function polygon(points){
  if(points.length<3)throw Error('Roof face needs at least 3 corners');
  const top=points.map(p=>new THREE.Vector3(...p)),verts=[],uvs=[];
  // Fan triangulation for convex roof panels; roof shapes are convex by design.
  const triangles=(corners)=>{for(let k=1;k<corners.length-1;k++)
   for(const v of [corners[0],corners[k],corners[k+1]]){
    verts.push(v.x,v.y,v.z);uvs.push(v.x/2+.5,v.z/2+.5);
   }
  };
  triangles(top);
  const bottom=top.map(v=>v.clone().add(new THREE.Vector3(0,-THICKNESS,0)));
  triangles(bottom.slice().reverse());
  for(let i=0;i<top.length;i++){
   const j=(i+1)%top.length,a=top[i],c=top[j],bb=bottom[i],dd=bottom[j];
   for(const v of [a,bb,c,c,bb,dd]){
    verts.push(v.x,v.y,v.z);uvs.push(v.x/2+.5,v.z/2+.5);
   }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
 }
 const add=(root,points)=>{const mesh=new THREE.Mesh(polygon(points),material());
  mesh.receiveShadow=true;mesh.castShadow=false;root.add(mesh);return mesh;};
 function create(kind){
  if(!kinds.has(kind))return null;
  const root=new THREE.Group();root.name=kind;
  root.userData.pwbCategory='roof';root.userData.pwbRoofKit=true;
  const apex=[0,HEIGHT,0];
  if(kind==='roof1'){
   add(root,[[-1,0,-1],[-1,0,1],[1,HEIGHT,1],[1,HEIGHT,-1]]);
  }else if(kind==='roof2'){
   add(root,[[-1,0,-1],[0,HEIGHT,-1],[0,HEIGHT,1],[-1,0,1]]);
   add(root,[[0,HEIGHT,-1],[1,0,-1],[1,0,1],[0,HEIGHT,1]]);
  }else if(/^roof[3-6]$/.test(kind)){
   const n=Number(kind.slice(4)),radius=n===4?Math.SQRT2:1.25;
   const base=Array.from({length:n},(_,i)=>{
    const angle=-Math.PI/2+i*2*Math.PI/n+(n===4?Math.PI/4:0);
    return [radius*Math.cos(angle),0,radius*Math.sin(angle)];
   });
   for(let i=0;i<n;i++)add(root,[base[i],base[(i+1)%n],apex]);
  }else if(kind==='roofSlope'){
   add(root,[[-1,0,-1],[1,0,-1],[1,HEIGHT,1],[-1,HEIGHT,1]]);
  }else if(kind==='roofFlat'){
   add(root,[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]]);
  }else if(kind==='roofRidge'){
   add(root,[[-1,.14,-.16],[1,.14,-.16],[1,.28,0],[-1,.28,0]]);
   add(root,[[-1,.28,0],[1,.28,0],[1,.14,.16],[-1,.14,.16]]);
  }else if(kind==='roofValley'){
   add(root,[[-1,.23,-.4],[1,.23,-.4],[1,.02,0],[-1,.02,0]]);
   add(root,[[-1,.02,0],[1,.02,0],[1,.23,.4],[-1,.23,.4]]);
  }else if(kind==='roofHip'){
   add(root,[[-1,0,-1],[0,HEIGHT,0],[.12,HEIGHT,0],[-.88,0,-1]]);
  }else if(kind==='roofEave'){
   add(root,[[-1,0,-.2],[1,0,-.2],[1,.10,.2],[-1,.10,.2]]);
  }else if(kind==='roofInnerCorner'){
   add(root,[[0,0,0],[1,0,0],[1,HEIGHT,1],[0,HEIGHT,1]]);
   add(root,[[0,0,0],[0,0,-1],[1,HEIGHT,-1],[1,HEIGHT,0]]);
  }else if(kind==='roofOuterCorner'){
   add(root,[[0,HEIGHT,0],[-1,0,0],[-1,0,-1]]);
   add(root,[[0,HEIGHT,0],[-1,0,-1],[0,0,-1]]);
  }else if(kind==='roofGable'){
   add(root,[[-1,0,0],[1,0,0],[0,HEIGHT,0]]);
  }
  root.userData.pwbSlopeCount=/^roof[1-6]$/.test(kind)?Number(kind.slice(4)):null;
  root.userData.pwbRoofPart=!root.userData.pwbSlopeCount;
  return root;
 }
 return {kinds,create};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoofModules;
