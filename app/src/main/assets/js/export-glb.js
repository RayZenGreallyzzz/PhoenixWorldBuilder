/* Static glTF/GLB scene exporter: terrain, placed mesh geometry, per-instance
 * materials, embedded base-color textures. Game logic remains in map.json. */
const SceneExporter=(()=>{
 const te=new TextEncoder();const align=n=>(n+3)&~3;
 // Use the same pixel budget as high-resolution decal imports. Keep wide
 // PNG/JPEG pictures at full native resolution when they fit in memory.
 function textureDimensions(width,height){
  const maxEdge=4096,maxPixels=2048*2048;
  const scale=Math.min(1,maxEdge/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
 }
 async function encodeTexture(tex){
  const img=tex?.image;if(!img||!img.width||!img.height)return null;
  const size=textureDimensions(img.width,img.height);
  const cv=document.createElement('canvas');cv.width=size.width;cv.height=size.height;
  const ctx=cv.getContext('2d');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,0,0,cv.width,cv.height);
  const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));
  return blob?new Uint8Array(await blob.arrayBuffer()):null;
 }
 async function build(world,options={}){
  const gltf={asset:{version:'2.0',generator:'Phoenix World Builder'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}]};
  const binary=[],matIdx=new Map(),texIdx=new Map();let offset=0;
  function data(arr,target){const bytes=arr instanceof Uint8Array?arr:new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);const padded=new Uint8Array(align(bytes.length));padded.set(bytes);const index=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});binary.push(padded);offset+=padded.length;return index}
  function access(typed,num,kind){let components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[kind],comp=typed instanceof Uint32Array?5125:typed instanceof Uint16Array?5123:5126;
   const meta={bufferView:data(typed,num===1?34963:34962),componentType:comp,count:typed.length/components,type:kind};
   if(kind==='VEC3'&&comp===5126){let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<typed.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],typed[i+a]);max[a]=Math.max(max[a],typed[i+a])}meta.min=min;meta.max=max;}
   let idx=gltf.accessors.length;gltf.accessors.push(meta);return idx;}
  async function material(m){if(Array.isArray(m))m=m[0];if(!m)m=new THREE.MeshStandardMaterial();if(matIdx.has(m))return matIdx.get(m);
   let color=m.color||new THREE.Color(1,1,1),a=m.opacity??1;
   let md={name:m.name||'Материал',pbrMetallicRoughness:{baseColorFactor:[color.r,color.g,color.b,a],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??1},doubleSided:m.side===THREE.DoubleSide,alphaMode:a<1?'BLEND':'OPAQUE'};
   if(m.map){let textureIndex=texIdx.get(m.map);if(textureIndex===undefined){const image=await encodeTexture(m.map);if(image){const imageIndex=gltf.images.length;gltf.images.push({bufferView:data(image),mimeType:'image/png'});textureIndex=gltf.textures.length;gltf.textures.push({source:imageIndex,sampler:0});texIdx.set(m.map,textureIndex)}}if(textureIndex!==undefined)md.pbrMetallicRoughness.baseColorTexture={index:textureIndex};}
   let idx=gltf.materials.length;gltf.materials.push(md);matIdx.set(m,idx);return idx;}
  const entries=options.houseOnly?
   world.objects.map(item=>({root:item.mesh,entry:item})):
   [{root:world.terrain,entry:null},...world.objects.map(item=>({root:item.mesh,entry:item}))];
  const models=entries.map(item=>item.root);
  const assembledBounds=new THREE.Box3();
  for(const obj of models){obj.updateMatrixWorld(true);assembledBounds.expandByObject(obj)}
  const shift=options.houseOnly&&!assembledBounds.isEmpty()
    ?new THREE.Vector3(-((assembledBounds.min.x+assembledBounds.max.x)/2),-assembledBounds.min.y,-((assembledBounds.min.z+assembledBounds.max.z)/2))
    :new THREE.Vector3();
  if(options.houseOnly&&!models.length)throw Error('Сначала построй дом');
  const v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3(),
   edge1=new THREE.Vector3(),edge2=new THREE.Vector3(),normal=new THREE.Vector3();
  async function coatedMaterial(original,paint,label){
   const source=Array.isArray(original)?original[0]:original;
   if(!paint)return material(source);
   const mat=source?.clone()||new THREE.MeshStandardMaterial();
   mat.name=(source?.name||'Материал')+' ['+label+']';
   mat.map=paint.texture?world.textures?.get(paint.texture)||null:null;
   if(mat.color)mat.color.set(paint.color||'#ffffff');
   return material(mat);
  }
  const decalCache=new Map();
  async function materialWithDecals(original,paint,face,root,emblems){
   if(!emblems?.length)return coatedMaterial(original,paint,face);
   const source=Array.isArray(original)?original[0]:original;
   const cacheId=(source?.uuid||'')+root.uuid+face+JSON.stringify(paint)+JSON.stringify(emblems);
   if(decalCache.has(cacheId))return decalCache.get(cacheId);
   // Larger paintings need a larger baked image, but small emblems stay cheap.
   const sourceSize=Math.max(512,...emblems.map(e=>{
    const img=world.textures?.get(e.texture)?.image;
    return Math.max(img?.width||0,img?.height||0);
   }));
   const bakeSize=Math.min(2048,Math.ceil(sourceSize/512)*512);
   const cv=document.createElement('canvas');cv.width=cv.height=bakeSize;
   const ctx=cv.getContext('2d');if(!ctx)throw Error('Нет Canvas для экспорта');
   ctx.fillStyle=paint?.color||(source?.color?'#'+source.color.getHexString():'#ffffff');
   ctx.fillRect(0,0,bakeSize,bakeSize);
   const originalTexture=paint?.texture?world.textures?.get(paint.texture):source?.map;
   if(originalTexture?.image?.width){
    ctx.globalCompositeOperation='multiply';
    ctx.drawImage(originalTexture.image,0,0,bakeSize,bakeSize);
    ctx.globalCompositeOperation='source-over';
   }
   const g=DecalLayer.faceGeometry(root,face);
   if(g)for(const e of emblems){
    const im=world.textures?.get(e.texture)?.image;if(!im?.width||!im?.height)continue;
    const w=e.fit==='fill'?1:e.size;
    const h=e.fit==='fill'?1:Math.min(4,Math.max(.01,w*g.width/g.height*im.height/im.width));
    ctx.save();ctx.globalAlpha=e.opacity;
    if(e.muralId&&Array.isArray(e.crop)){
     // Bake precisely this module's slice of the full image. Every wall
     // remains an ordinary GLB mesh, while all slices form one tapestry.
     const [u0,v0,u1,v1]=e.crop;
     const sx=Math.round(u0*im.width),sy=Math.round((1-v1)*im.height);
     const sw=Math.max(1,Math.round((u1-u0)*im.width));
     const sh=Math.max(1,Math.round((v1-v0)*im.height));
     ctx.drawImage(im,sx,sy,Math.min(sw,im.width-sx),Math.min(sh,im.height-sy),0,0,bakeSize,bakeSize);
    }else{
     ctx.translate(e.x*bakeSize,(1-e.y)*bakeSize);ctx.rotate(e.rotation*Math.PI/180);
     ctx.drawImage(im,-w*bakeSize/2,-h*bakeSize/2,w*bakeSize,h*bakeSize);
    }
    ctx.restore();
   }
   const mat=source?.clone()||new THREE.MeshStandardMaterial();
   mat.name=(source?.name||'Материал')+' эмблема '+face;
   mat.color?.set('#ffffff');mat.map=new THREE.CanvasTexture(cv);
   mat.map.encoding=THREE.sRGBEncoding;mat.map.flipY=false;mat.opacity=1;mat.transparent=false;
   const index=await material(mat);decalCache.set(cacheId,index);return index;
  }
  for(const {root,entry} of entries){
   root.updateMatrixWorld(true);
   const hasPaint=typeof SurfacePaint!=='undefined'&&
    Object.keys(SurfacePaint.normalize(entry?.data?.surfacePaint)).length>0;
   const skin=hasPaint?SurfacePaint.normalize(entry.data.surfacePaint):{};
   const emblems=typeof DecalLayer!=='undefined'?DecalLayer.normalize(entry?.data?.decals):[];
   const hasEmblems=emblems.length>0;
   const bounds=hasEmblems?BuildSnap.attrBounds(root):null;
   const toRoot=hasEmblems?root.matrixWorld.clone().invert():null;
   const meshes=[];root.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position)meshes.push(o)});
   for(const mesh of meshes){
    const geom=mesh.geometry;if(geom.index&&geom.index.count>700000)continue;
    const pos=geom.getAttribute('position');if(!pos||pos.count<3)continue;
    const attrs={POSITION:access(new Float32Array(pos.array),0,'VEC3')};
    const norm=geom.getAttribute('normal'),uv=geom.getAttribute('uv'),col=geom.getAttribute('color');
    if(norm)attrs.NORMAL=access(new Float32Array(norm.array),0,'VEC3');
    if(uv)attrs.TEXCOORD_0=access(new Float32Array(uv.array),0,'VEC2');
    if(col&&col.itemSize===3)attrs.COLOR_0=access(new Float32Array(col.array),0,'VEC3');
    let primitives=[];
    if(!hasPaint&&!hasEmblems){
     const prim={attributes:attrs,mode:4,material:await material(mesh.material)};
     if(geom.index){
      const indices=geom.index.array;
      prim.indices=access(indices instanceof Uint32Array?new Uint32Array(indices):new Uint16Array(indices),1,'SCALAR');
     }
     primitives.push(prim);
    }else{
     // Keep one glTF mesh and one vertex buffer. Painted sides use separate
     // *index primitives*, not duplicated ceiling/floor meshes or triangles.
     const inds=geom.index?.array||null;
     const triCount=Math.floor((inds?.length||pos.count)/3);
     const groups=geom.groups||[],materialList=Array.isArray(mesh.material)?mesh.material:[mesh.material];
     const buckets=new Map(),projectedUV=new Map();
     function getProjection(mode){
      if(mode==='source')return attrs.TEXCOORD_0??null;
      if(projectedUV.has(mode))return projectedUV.get(mode);
      const data=new Float32Array(pos.count*2),p=new THREE.Vector3();
      for(let i=0;i<pos.count;i++){
       p.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
       if(mode.startsWith('emblem:')&&bounds){
        p.applyMatrix4(toRoot);
        const name=mode.slice(7);
        const x=(p.x-bounds.min.x)/Math.max(.001,bounds.max.x-bounds.min.x);
        const y=(p.y-bounds.min.y)/Math.max(.001,bounds.max.y-bounds.min.y);
        const z=(p.z-bounds.min.z)/Math.max(.001,bounds.max.z-bounds.min.z);
        data[2*i]=name==='back'?1-x:name==='right'?1-z:name==='left'?z:x;
        data[2*i+1]=name==='top'?z:name==='bottom'?1-z:y;
       }else if(mode==='xz'){data[2*i]=p.x;data[2*i+1]=p.z}
       else if(mode==='yz'){data[2*i]=p.z;data[2*i+1]=p.y}
       else {data[2*i]=p.x;data[2*i+1]=p.y}
      }
      const value=access(data,0,'VEC2');projectedUV.set(mode,value);return value;
     }
     for(let tri=0;tri<triCount;tri++){
      const off=tri*3,i0=inds?inds[off]:off,i1=inds?inds[off+1]:off+1,i2=inds?inds[off+2]:off+2;
      v0.set(pos.getX(i0),pos.getY(i0),pos.getZ(i0)).applyMatrix4(mesh.matrixWorld);
      v1.set(pos.getX(i1),pos.getY(i1),pos.getZ(i1)).applyMatrix4(mesh.matrixWorld);
      v2.set(pos.getX(i2),pos.getY(i2),pos.getZ(i2)).applyMatrix4(mesh.matrixWorld);
      normal.copy(edge1.subVectors(v1,v0)).cross(edge2.subVectors(v2,v0)).normalize();
      let face=normal.y>.55?'top':normal.y<-.55?'bottom':'side';
      if(hasEmblems){
       const local=normal.clone().transformDirection(toRoot);
       if(Math.abs(local.y)>.55)face=local.y>0?'top':'bottom';
       else if(Math.abs(local.z)>=Math.abs(local.x))face=local.z>0?'front':'back';
       else face=local.x>0?'right':'left';
      }
      const finish=(face==='top'?skin.top:face==='bottom'?skin.bottom:null)||skin.all||null;
      const srcGroup=groups.find(g=>off>=g.start&&off<g.start+g.count);
      const materialIndex=srcGroup?.materialIndex||0,orig=materialList[materialIndex]||materialList[0];
      let uvMode='source';
      if(finish?.texture){
       uvMode=face==='top'||face==='bottom'?'xz':
        Math.abs(normal.x)>=Math.abs(normal.z)?'yz':'xy';
      }
      const stamps=emblems.filter(e=>e.face===face);
      if(stamps.length)uvMode='emblem:'+face;
      const finishKey=finish===skin.top?'top':finish===skin.bottom?'bottom':finish===skin.all?'all':'original';
      const key=materialIndex+'|'+face+'|'+finishKey+'|'+uvMode;
      if(!buckets.has(key))buckets.set(key,{indices:[],orig,finish,face,uvMode,stamps});
      buckets.get(key).indices.push(i0,i1,i2);
     }
     for(const bucket of buckets.values()){
      let max=0;for(const idx of bucket.indices)if(idx>max)max=idx;
      const array=max>65535?new Uint32Array(bucket.indices):new Uint16Array(bucket.indices);
      const attributes={...attrs};
      const proj=getProjection(bucket.uvMode);
      if(proj!==null)attributes.TEXCOORD_0=proj;
      const primitive={attributes,mode:4,
       indices:access(array,1,'SCALAR'),
       material:await materialWithDecals(bucket.orig,bucket.finish,bucket.face,root,bucket.stamps)};
      primitives.push(primitive);
     }
    }
    const mi=gltf.meshes.length;gltf.meshes.push({name:mesh.name||'Деталь',primitives});
    const ni=gltf.nodes.length;
    gltf.nodes.push({mesh:mi,name:mesh.name||root.name||'Объект',
     matrix:new THREE.Matrix4().makeTranslation(shift.x,shift.y,shift.z).multiply(mesh.matrixWorld).toArray()});
    gltf.scenes[0].nodes.push(ni);
   }
  }
  gltf.buffers[0].byteLength=offset;
  const jsonData=te.encode(JSON.stringify(gltf)),jsonSize=align(jsonData.length),binSize=offset,total=12+8+jsonSize+8+binSize;
  const out=new Uint8Array(total),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,total,true);v.setUint32(12,jsonSize,true);v.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonSize);out.set(jsonData,20);
  let p=20+jsonSize;v.setUint32(p,binSize,true);v.setUint32(p+4,0x004e4942,true);p+=8;for(const x of binary){out.set(x,p);p+=x.length;}
  return new Blob([out],{type:'model/gltf-binary'});
 }
 return {build,textureDimensions};
})();
