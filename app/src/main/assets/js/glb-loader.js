/* Minimal offline glTF 2.0 binary importer for building assets. Supports triangles,
 * materials, embedded textures, mesh transforms and primitive instancing.
 * Does not support skins, Draco, meshopt or animations (avatar fallback remains usable). */
const GLB = (()=>{
 const td=new TextDecoder(); const typeCount={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 const typeCtor={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
 const typeSize={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 async function load(input){
  let ab=input instanceof ArrayBuffer?input:await input.arrayBuffer();const dv=new DataView(ab);
  if(dv.getUint32(0,true)!==0x46546c67)throw Error('Нужен GLB 2.0');
  if(dv.getUint32(4,true)!==2)throw Error('Неподдерживаемая версия GLB');
  let len=dv.getUint32(8,true), off=12, json=null,bin=null;
  while(off+8<=Math.min(len,ab.byteLength)){
    let size=dv.getUint32(off,true),code=dv.getUint32(off+4,true);off+=8;
    if(off+size>ab.byteLength)throw Error('Повреждён GLB');
    if(code===0x4e4f534a)json=JSON.parse(td.decode(new Uint8Array(ab,off,size)).replace(/\0+$/g,''));
    if(code===0x004e4942)bin=new Uint8Array(ab,off,size);off+=size;
  }
  if(!json||!bin)throw Error('GLB не содержит геометрию');
  const buffers=json.bufferViews||[], accessors=json.accessors||[];
  function accessor(id){
    let a=accessors[id];if(!a)throw Error('Отсутствует accessor '+id);
    let ct=typeCount[a.type], Cls=typeCtor[a.componentType],bs=typeSize[a.componentType];
    if(!Cls||!ct)throw Error('Тип геометрии не поддерживается');
    let out=new Cls(a.count*ct);
    if(a.bufferView!==undefined){
      const v=buffers[a.bufferView],stride=v.byteStride||ct*bs,base=(v.byteOffset||0)+(a.byteOffset||0);
      const d=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
      for(let i=0;i<a.count;i++)for(let c=0;c<ct;c++){
        let p=base+i*stride+c*bs;
        const f={5120:()=>d.getInt8(p),5121:()=>d.getUint8(p),5122:()=>d.getInt16(p,true),5123:()=>d.getUint16(p,true),5125:()=>d.getUint32(p,true),5126:()=>d.getFloat32(p,true)}[a.componentType];
        out[i*ct+c]=f();
      }
    }
    if(a.sparse)throw Error('GLB со sparse accessors пока не поддерживается');
    return out;
  }
  const imageURLs=[];
  for(const im of json.images||[]){
    if(im.bufferView===undefined){imageURLs.push(null);continue}
    const view=buffers[im.bufferView],bytes=bin.slice(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    imageURLs.push(URL.createObjectURL(new Blob([bytes],{type:im.mimeType||'image/png'})));
  }
  const texCache=new Map(), textureDefs=json.textures||[];
  function texture(id){if(id===undefined)return null;if(texCache.has(id))return texCache.get(id);const t=textureDefs[id];if(!t)return null;const url=imageURLs[t.source];if(!url)return null;const tex=new THREE.TextureLoader().load(url,()=>{URL.revokeObjectURL(url)}); tex.flipY=false;tex.encoding=THREE.sRGBEncoding;texCache.set(id,tex);return tex;}
  const materials=(json.materials||[]).map(m=>{
    let p=m.pbrMetallicRoughness||{}, factors=p.baseColorFactor||[1,1,1,1];
    let options={color:new THREE.Color(factors[0],factors[1],factors[2]),roughness:p.roughnessFactor??1,metalness:p.metallicFactor??0,side:m.doubleSided?THREE.DoubleSide:THREE.FrontSide,transparent:m.alphaMode==='BLEND'||factors[3]<1,opacity:factors[3],alphaTest:m.alphaMode==='MASK'?(m.alphaCutoff??.5):0};
    if(p.baseColorTexture)options.map=texture(p.baseColorTexture.index);
    if(m.normalTexture)options.normalMap=texture(m.normalTexture.index);
    if(m.emissiveFactor)options.emissive=new THREE.Color(...m.emissiveFactor);
    const res=new THREE.MeshStandardMaterial(options);res.name=m.name||'Материал'; return res;
  });
  const gm=(json.meshes||[]).map(mesh=>{
    const group=new THREE.Group();group.name=mesh.name||'Модель';
    for(const prim of mesh.primitives||[]){
      if(prim.mode!==undefined&&prim.mode!==4)continue;
      const at=prim.attributes||{};if(at.POSITION===undefined)continue;
      let geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(accessor(at.POSITION)),3));
      if(at.NORMAL!==undefined)geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(accessor(at.NORMAL)),3));
      if(at.TEXCOORD_0!==undefined)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(accessor(at.TEXCOORD_0)),2));
      if(at.COLOR_0!==undefined){const src=accessor(at.COLOR_0);const n=typeCount[accessors[at.COLOR_0].type], colors=[];for(let i=0;i<src.length;i+=n)colors.push(...[src[i],src[i+1],src[i+2]].map(x=>accessors[at.COLOR_0].normalized?(x/(accessors[at.COLOR_0].componentType===5121?255:65535)):x));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
      if(prim.indices!==undefined)geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices),1));
      if(!geometry.attributes.normal)geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      let mat=materials[prim.material]||new THREE.MeshStandardMaterial({color:'#b8ac96',roughness:.9,side:THREE.DoubleSide});
      let obj=new THREE.Mesh(geometry,mat);obj.castShadow=false;obj.receiveShadow=true;obj.name=mesh.name||'Деталь';group.add(obj);
    }
    return group;
  });
  let defs=json.nodes||[], made=defs.map((n,i)=>{
    const obj=new THREE.Group();obj.name=n.name||'Узел '+i;
    if(n.mesh!==undefined&&gm[n.mesh])obj.add(gm[n.mesh].clone(true));
    if(n.matrix){let mat=new THREE.Matrix4().fromArray(n.matrix);mat.decompose(obj.position,obj.quaternion,obj.scale)}
    else{if(n.translation)obj.position.fromArray(n.translation);if(n.rotation)obj.quaternion.fromArray(n.rotation);if(n.scale)obj.scale.fromArray(n.scale)}
    return obj;
  });
  defs.forEach((n,i)=>(n.children||[]).forEach(j=>{if(made[j])made[i].add(made[j])}));
  const root=new THREE.Group();root.name='Импортированный GLB';const scene=json.scenes?.[json.scene??0];
  for(const i of (scene?.nodes||defs.map((_,i)=>i).filter(i=>!defs.some(n=>(n.children||[]).includes(i)))))if(made[i])root.add(made[i]);
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);if(!bounds.isEmpty())root.userData.originalBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
  return {root,json,triangles:gm.reduce((a,g)=>a+g.children.reduce((s,m)=>s+(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3,0),0)};
 }
 return {load};
})();
