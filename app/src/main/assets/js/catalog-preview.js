/* One small shared WebGL thumbnail renderer. Generate images lazily, cache as JPEG. */
const CatalogPreview=(()=>{
 let renderer=null,scene=null,camera=null,turntable=null,observer=null;
 let busy=false,disabled=false;const jobs=[];
 const PLACEHOLDERS={foundation:'▦',ceiling:'▤',stairs:'▰',wall:'▥',roof:'⌂',door:'▣',prop:'♣'};
 function init(){
  if(renderer||disabled)return !!renderer;
  try{
   const canvas=document.createElement('canvas');canvas.width=144;canvas.height=116;
   renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
   renderer.setPixelRatio(1);renderer.setSize(144,116,false);
   renderer.outputEncoding=THREE.sRGBEncoding;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   scene=new THREE.Scene();scene.background=new THREE.Color('#354956');
   scene.add(new THREE.HemisphereLight('#ffffff','#708080',1.18));
   const light=new THREE.DirectionalLight('#ffe6cf',1.25);light.position.set(4,7,8);scene.add(light);
   camera=new THREE.PerspectiveCamera(43,144/116,.05,100);
   turntable=new THREE.Group();scene.add(turntable);return true;
  }catch(e){console.warn('3D thumbnails unavailable',e);disabled=true;return false}
 }
 function placeholder(category){return PLACEHOLDERS[category]||'◈'}
 function wait(ms=75){return new Promise(resolve=>setTimeout(resolve,ms))}
 async function preview(id,isBuiltin,getModel,dbGet,dbPut){
  const key='v2:'+id;
  try{const cached=await dbGet('previews',key);if(cached)return cached}catch(e){}
  if(!init())return null;
  const source=isBuiltin?getModel(id,true):await getModel(id,false);
  if(!source)return null;
  const model=source.clone(true);model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);if(box.isEmpty())return null;
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const longest=Math.max(.001,size.x,size.y,size.z);
  model.position.sub(center);model.scale.multiplyScalar(1.55/longest);
  turntable.add(model);camera.position.set(2.5,1.95,2.85);camera.lookAt(0,0,0);
  try{
   renderer.render(scene,camera);
   const src=renderer.domElement.toDataURL('image/jpeg',.74);
   try{await dbPut('previews',key,src)}catch(e){}
   return src;
  }finally{turntable.remove(model)}
 }
 async function pump(){
  if(busy)return;busy=true;
  while(jobs.length){
   const job=jobs.shift();if(!job.image.isConnected)continue;
   try{
    const src=await preview(job.id,job.builtin,job.getModel,job.dbGet,job.dbPut);
    if(src&&job.image.isConnected){job.image.src=src;job.image.classList.remove('unloaded')}
   }catch(e){console.warn('Preview failed:',job.id,e)}
   await wait();
  }
  busy=false;
 }
 function observeCards(parent,getModel,dbGet,dbPut){
  if(observer)observer.disconnect();
  observer=new IntersectionObserver((entries)=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    const el=entry.target;observer.unobserve(el);
    jobs.push({image:el,id:el.dataset.previewId,builtin:el.dataset.builtin==='1',getModel,dbGet,dbPut});
   }
   pump();
  },{root:document.getElementById('buildPanel'),rootMargin:'100px 0px'});
  for(const img of parent.querySelectorAll('img[data-preview-id]'))observer.observe(img);
 }
 return {observeCards,placeholder};
})();