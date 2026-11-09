/* Physical face-selection / UV regression on right/left L, 90/180 arcs,
 * real door/window/passage cuts; preserve the original mirror control.
 * Uses actual Three r140 meshes, not screenshots or source-string stubs.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
const T=global.THREE=require(path.join(base,'js/three.min.js'));
const G=global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const UV=global.SurfaceWorkshop=require(path.join(base,'js/surface-workshop.js'));
const O=require(path.join(base,'js/wall-openings.js'));
const M=require(path.join(base,'js/surface-materials.js'));
const image=new T.DataTexture(new Uint8Array(16).fill(255),2,2,T.RGBAFormat);
const imageId='texture:regression';
const front={style:'custom',mapping:'repeat',imageId,tileMeters:1,color:'#ffffff'};
const sides={front,back:{...front,offsetU:.27}};
const textures=new Map([[imageId,image]);
const V=()=>new T.Vector3();
function triangle(mesh,i,root){
 const pos=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index;
 const v=[0,1,2].map(j=>V().fromBufferAttribute(pos,idx?idx.getX(i+j):i+j));
 const n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
 const transform=root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
 return {mid:v[0].add(v[1]).add(v[2]).multiplyScalar(1/3).applyMatrix4(transform),
  normal:n.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(transform)).normalize(),
  meshNormal:n};
}
function materialAt(mesh,index){
 const group=mesh.geometry.groups.find(g=>index>=g.start&&index<g.start+g.count);
 return Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;
}
function positions(geometry){
 const g=geometry.index?geometry.toNonIndexed():geometry;
 const result=Array.from(g.getAttribute('position').array);
 if(g!==geometry)g.dispose();return result;
}
let tested=0;
for(const kind of ['corner','arc90','arc180'])
 for(const angle of [0,Math.PI/2,.73])for(const handed of [1,-1]){
  const root=G.create(kind);root.rotation.y=angle;root.scale.x=handed;
  root.updateWorldMatrix(true,true);
  const saved=root.children.map(mesh=>positions(mesh.geometry));
  const result=M.applyFaces(root,{style:'none'},sides,textures,{kind,category:'wall'});
  assert(result.ok&&result.faces>=1,'No paint on '+kind);
  root.children.forEach((mesh,k)=>{
   assert.deepEqual(positions(mesh.geometry),saved[k],'Paint changed source mesh vertices');
   const uv=mesh.geometry.getAttribute('uv'),pos=mesh.geometry.getAttribute('position');
   const values={front:[],back:[]};let assigned=0;
   for(let i=0;i<pos.count;i+=3){
    const t=triangle(mesh,i,root),p=t.mid,n=t.normal;
    let expected=null;
    if(kind==='corner'){
     if(p.x<-.45&&Math.abs(n.z)>.85&&Math.abs(p.z)>.015)
      expected=p.z>0?'front':'back';
     else if(p.z<-.45&&Math.abs(n.x)>.85&&Math.abs(p.x)>.015)
      expected=p.x>0?'front':'back';
    }else{
     const r=Math.hypot(p.x,p.z),dot=(p.x*n.x+p.z*n.z)/(r||1);
     if(Math.abs(dot)>.85&&Math.abs(r-2)>.04)expected=r>2?'front':'back';
    }
    if(!expected)continue;
    assert(materialAt(mesh,i).name.includes('отдельная сторона'),
     'Wrong face material for '+kind);
    assert.equal(M.sideFromNormal(n,'wall',kind,p),expected,
     'Face side reversed on rotated '+kind);
    for(let j=0;j<3;j++)values[expected].push(uv.getX(i+j));
    assigned++;
   }
   assert(assigned>=2,'No broad face samples '+kind);
   for(const [side,valuesU] of Object.entries(values)){
    const range=Math.max(...valuesU)-Math.min(...valuesU);
    assert(range>(kind==='corner'?1.7:kind==='arc90'?2.9:5.9),
     kind+' '+side+' UV became stripes after rotation/mirror: '+range);
   }
  });
  tested++;
 }
// Actual left/right-handed *imported* GLB L shapes, not only root mirroring.
for(const handed of [1,-1])for(const angle of [0,Math.PI/2]){
 const root=new T.Group(),inner=G.create('corner');
 root.name='glb:corner-user';inner.scale.x=handed;root.rotation.y=angle;
 root.add(inner);root.updateWorldMatrix(true,true);
 const profile=UV.importedWallProfile(root,root.name,'wall');
 assert.equal(profile?.type,'corner');
 const result=M.applyFaces(root,{style:'none'},sides,textures,
  {kind:root.name,category:'wall'});
 assert(result.ok&&result.faces===2,'Imported left/right L painting failed');
 for(const mesh of inner.children){
  const uv=mesh.geometry.getAttribute('uv'),pos=mesh.geometry.getAttribute('position');
  const x={front:[],back:[]};
  for(let i=0;i<pos.count;i+=3){
   const t=triangle(mesh,i,root),p=t.mid,n=t.normal;
   const first=Math.abs(n.z)>.85&&Math.abs(p.z)>.015;
   const second=Math.abs(n.x)>.85&&Math.abs(p.x)>.015;
   if(!first&&!second)continue;
   const exterior=first?(p.z>0):(handed===1?p.x>0:p.x<0);
   const side=exterior?'front':'back';
   assert.equal(M.sideFromNormal(n,'wall',root.name,p,profile),side,
    'Imported mirrored L outside/inside inverted');
   assert(materialAt(mesh,i).name.includes('отдельная сторона'));
   for(let j=0;j<3;j++)x[side].push(uv.getX(i+j));
  }
  for(const [side,u] of Object.entries(x)){
   assert(u.length&&Math.max(...u)-Math.min(...u)>1.7,
    'Imported '+side+' L-wall texture stripes');
  }
 }
}
// Detect both physical sides of an X-normal or Z-normal imported wall.
for(const axis of ['x','z']){
 const root=new T.Group();root.name='glb:straight';
 root.add(new T.Mesh(axis==='x'?new T.BoxGeometry(.22,2.6,2):
  new T.BoxGeometry(2,2.6,.22),new T.MeshStandardMaterial()));
 const result=M.applyFaces(root,{style:'none'},sides,textures,
  {kind:root.name,category:'wall'});
 assert.equal(result.faces,1);
 const mesh=root.children[0],counts={front:0,back:0};
 root.updateWorldMatrix(true,true);
 for(let i=0;i<mesh.geometry.getAttribute('position').count;i+=3){
  const t=triangle(mesh,i,root),point=t.mid.clone().applyMatrix4(root.matrixWorld);
  const selected=M.faceFromHit({object:mesh,face:{normal:t.meshNormal},point},
   root,'wall',root.name);
  if(counts[selected]!==undefined)counts[selected]++;
 }
 assert(counts.front>=2&&counts.back>=2,'Imported '+axis+' wall sides swapped/lost');
}
// No texture geometry across ACTUAL window/door/arched passage, even
// when the entire wall has a negative X scale.
let openings=0;
for(const kind of ['wall','corner','arc90','arc180'])
 for(const type of ['window','door','passage'])for(const mirrored of [1,-1]){
  const root=G.create(kind),profile=O.profile(kind),s=profile.length*.25;
  const opening={id:'cut',type,x:s-profile.length/2,
   y:type==='window'?.7:0,w:.42,h:type==='window'?1.1:2.1,
   shape:type==='passage'?'round':'rectangle'};
  assert(O.render(root,kind,[opening],
   {thickness:.22,axes:{x:1,y:1,z:1}}).ok,'Opening cut failed');
  root.rotation.y=.78;root.scale.x=mirrored;root.updateWorldMatrix(true,true);
  const mesh=root.getObjectByName('structure:wall'),
   original=positions(mesh.geometry);
  assert(M.applyFaces(root,{style:'none'},sides,textures,{kind,category:'wall'}).ok);
  assert.deepEqual(positions(mesh.geometry),original,'Paint closed the hole');
  const p=profile.pos(s),y=type==='window'?1.2:1.05;
  const a=new T.Vector3(p.x+p.nx*.7,y,p.z+p.nz*.7).applyMatrix4(root.matrixWorld);
  const b=new T.Vector3(p.x-p.nx*.7,y,p.z-p.nz*.7).applyMatrix4(root.matrixWorld);
  const delta=b.clone().sub(a);
  assert.equal(new T.Raycaster(a,delta.clone().normalize(),0,delta.length())
   .intersectObject(mesh,false).length,0,'Opening was plugged by texture');
  openings++;
 }
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),
 app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
for(const id of ['quickMirrorDuplicate','btnMirrorDuplicate'])
 assert(html.includes('id="'+id+'"'),'Mirror toolbar control missing');
for(const token of ['duplicate(mirror=false){','mirrorX:config.mirrorX===true',
 '(obj.mirrorX?-1:1)*obj.scale*a.x','this.duplicate(true)',
 'this.preview.mirrorX=data.mirrorX===true'])
 assert(app.includes(token),'Mirror-copy persistence or handler missing: '+token);
console.log('Left/right GLB and built-in curved wall faces, physical UV, '+tested+
 ' rotations/mirrors, '+openings+' real cuts, restored mirror tool OK');
