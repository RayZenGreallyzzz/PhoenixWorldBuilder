/* Offline module/character format router.
 * External FBX/OBJ textures must be embedded or converted to GLB in Blender;
 * the editor never silently fetches files from the network or filesystem.
 * Non-GLB *modules* are converted to static GLB for the existing library.
 * FBX *characters* keep their original skeleton and animation clips.
 */
const ModelFormats=(()=>{
 'use strict';
 const supported=['glb','gltf','fbx','obj','vox','stl','ply'];
 const ext=name=>String(name||'').toLowerCase().split('.').pop();
 const accepts=(name,role='module')=>role==='character'?
  ['glb','fbx'].includes(ext(name)):supported.includes(ext(name));
 const safeBuffer=async file=>{
  if(!file||typeof file.arrayBuffer!=='function')
   throw Error('Выбери файл модели');
  if(file.size>50000000)throw Error('Файл больше лимита 50 МБ: используй GLB');
  return file.arrayBuffer();
 };
 const fromGeometry=(geometry,kind)=>{
  if(!geometry?.getAttribute('position'))
   throw Error(kind+': не найдена геометрия');
  if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const root=new THREE.Group();
  const useColors=!!geometry.getAttribute('color');
  const material=new THREE.MeshStandardMaterial({
   color:0xffffff,roughness:.82,vertexColors:useColors,
   side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=kind+' import';root.add(mesh);
  return root;
 };
 const validRoot=(root,type)=>{
  if(!root?.traverse)throw Error(type.toUpperCase()+': нет 3D-сцены');
  let faces=0;
  root.traverse(node=>{
   const g=node.isMesh?node.geometry:null;
   const count=g?.index?.count||g?.getAttribute('position')?.count||0;
   faces+=count/3;
  });
  if(!faces||!Number.isFinite(faces))
   throw Error(type.toUpperCase()+': отсутствуют треугольники');
  if(faces>900000)throw Error('Слишком сложная модель для планшета; сократи её в Blender');
  return {root,triangles:Math.round(faces)};
 };
 async function parse(file){
  const type=ext(file?.name);
  if(!supported.includes(type))
   throw Error('Нужен GLB, glTF, FBX, OBJ, VOX, STL или PLY');
  const raw=await safeBuffer(file);
  let root,animations=[],result;
  if(type==='glb'){
   const loaded=await GLB.load(raw);
   return {...validRoot(loaded.root,type),animations:loaded.animations||[],type};
  }
  if(type==='gltf'){
   const text=new TextDecoder().decode(raw),json=JSON.parse(text);
   const references=[...(json.buffers||[]),...(json.images||[])];
   if(references.some(ref=>ref.uri&&!String(ref.uri).startsWith('data:')))
    throw Error('glTF со внешним .bin или текстурами: сначала экспортируй единый GLB');
   const loader=new THREE.GLTFLoader();
   const loaded=await new Promise((resolve,reject)=>{
    loader.parse(text,'',resolve,reject);
   });
   root=loaded.scene||loaded.scenes?.[0];
   animations=loaded.animations||[];
  }else if(type==='fbx'){
   if(!THREE.FBXLoader)throw Error('FBX-декодер отсутствует в APK');
   root=new THREE.FBXLoader().parse(raw,'');
   animations=root?.animations||[];
  }else if(type==='obj'){
   if(!THREE.OBJLoader)throw Error('OBJ-декодер отсутствует в APK');
   root=new THREE.OBJLoader().parse(new TextDecoder().decode(raw));
  }else if(type==='vox'){
   if(!THREE.VOXLoader||!THREE.VOXMesh)
    throw Error('VOX-декодер отсутствует в APK');
   const chunks=new THREE.VOXLoader().parse(raw);
   if(!Array.isArray(chunks)||!chunks.length)
    throw Error('VOX: нужен файл MagicaVoxel версии 150');
   root=new THREE.Group();
   chunks.forEach((chunk,i)=>{
    const mesh=new THREE.VOXMesh(chunk);
    mesh.name='Voxel '+(i+1);
    root.add(mesh);
   });
  }else if(type==='stl'){
   if(!THREE.STLLoader)throw Error('STL-декодер отсутствует в APK');
   root=fromGeometry(new THREE.STLLoader().parse(raw),'STL');
  }else if(type==='ply'){
   if(!THREE.PLYLoader)throw Error('PLY-декодер отсутствует в APK');
   root=fromGeometry(new THREE.PLYLoader().parse(raw),'PLY');
  }
  return {...validRoot(root,type),animations,type};
 }
 async function convertModule(file){
  const model=await parse(file);
  // This exporter writes real triangle geometry, UV, colour and PBR base
  // texture into one GLB, used by the existing offline project library.
  // Animation is deliberately retained only when importing as CHARACTER.
  const blob=await SceneExporter.build(
   {objects:[{mesh:model.root}]},{houseOnly:true,keepWorldCoordinates:true});
  if(blob.size>50000000)
   throw Error('Преобразованная модель больше 50 МБ; оптимизируй текстуры');
  return {buffer:await blob.arrayBuffer(),type:model.type,
   triangles:model.triangles,animationCount:model.animations.length};
 }
 return {supported,ext,accepts,parse,convertModule};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ModelFormats;
