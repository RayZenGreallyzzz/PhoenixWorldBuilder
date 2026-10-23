/* Permanent, editable-instance-safe white construction modules for round buildings.
 * All geometry is generated in metres, with true centreline end sockets.
 * Built-in prototypes are reconstructed on every request and never mutated.
 */
const RoundedModules=(()=>{
 const R=2,H=2.6,T=.22,SEG=24;
 const kinds=new Set(['arc90','arc180','arcFloor90','arcCeiling90']);
 const white=()=>new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.86,side:THREE.DoubleSide});
 const point=(radius,angle,y)=>[radius*Math.cos(angle),y,radius*Math.sin(angle)];
 function geometry(sweep,slab=false){
  const positions=[],uvs=[];
  const vertex=(p,u,v)=>{positions.push(...p);uvs.push(u,v)};
  const face=(a,b,c,d,uv)=>{
   const coords=uv||[[0,0],[1,0],[1,1],[0,1]];
   for(const i of [0,1,2,0,2,3])vertex([a,b,c,d][i],...coords[i]);
  };
  if(!slab){
   for(let i=0;i<SEG;i++){
    const a=sweep*i/SEG,z=sweep*(i+1)/SEG;
    const midA=point(R,a,0),midZ=point(R,z,0);
    const inA=point(R-T/2,a,0),inZ=point(R-T/2,z,0);
    const outA=point(R+T/2,a,0),outZ=point(R+T/2,z,0);
    const f=i/SEG,g=(i+1)/SEG;
    face(outA,outZ,point(R+T/2,z,H),point(R+T/2,a,H),[[f,0],[g,0],[g,1],[f,1]]);
    face(inZ,inA,point(R-T/2,a,H),point(R-T/2,z,H),[[g,0],[f,0],[f,1],[g,1]]);
    face(point(R-T/2,a,H),point(R+T/2,a,H),point(R+T/2,z,H),point(R-T/2,z,H));
    face(inA,inZ,outZ,outA);
   }
   face(point(R-T/2,0,0),point(R+T/2,0,0),
    point(R+T/2,0,H),point(R-T/2,0,H));
   face(point(R+T/2,sweep,0),point(R-T/2,sweep,0),
    point(R-T/2,sweep,H),point(R+T/2,sweep,H));
  }else{
   const top=.17,bottom=0;
   const center=(y)=>[0,y,0];
   for(let i=0;i<SEG;i++){
    const a=sweep*i/SEG,z=sweep*(i+1)/SEG;
    const aTop=point(R,a,top),zTop=point(R,z,top);
    const aBottom=point(R,a,bottom),zBottom=point(R,z,bottom);
    face(center(top),aTop,zTop,center(top),[[0,0],[Math.cos(a),Math.sin(a)],[Math.cos(z),Math.sin(z)],[0,0]]);
    face(center(bottom),zBottom,aBottom,center(bottom));
    face(aBottom,zBottom,zTop,aTop);
   }
   face(center(bottom),point(R,0,bottom),point(R,0,top),center(top));
   face(point(R,sweep,bottom),center(bottom),center(top),point(R,sweep,top));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  return g;
 }
 function create(kind){
  if(!kinds.has(kind))return null;
  const slab=kind==='arcFloor90'||kind==='arcCeiling90';
  const sweep=kind==='arc180'?Math.PI:Math.PI/2;
  const root=new THREE.Group();
  const mesh=new THREE.Mesh(geometry(sweep,slab),white());
  mesh.receiveShadow=true;root.add(mesh);root.name=kind;
  root.userData.pwbCategory=kind==='arcFloor90'?'foundation':
   kind==='arcCeiling90'?'ceiling':'wall';
  if(!slab){
   root.userData.pwbModuleShape=kind;
   root.userData.pwbModuleSockets=[
    {point:[R,0,0],out:[0,0,-1]},
    {point:[R*Math.cos(sweep),0,R*Math.sin(sweep)],
     out:[-Math.sin(sweep),0,Math.cos(sweep)]}
   ];
  }
  return root;
 }
 return {create,kinds};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoundedModules;
