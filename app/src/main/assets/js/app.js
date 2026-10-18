'use strict';
const $=id=>document.getElementById(id), $all=s=>[...document.querySelectorAll(s)];
const BUILTINS=[['floor','Пол 2×2','foundation'],['ceiling','Потолок / перекрытие 2×2','ceiling'],['wall','Стена 2×2,6','wall'],['window','Стена с окном','wall'],['roof','Двускатная крыша','roof'],['door','Дверь с петлями','door'],['pillar','Колонна','wall'],['stairs','Лестница','stairs'],['tree','Дерево','prop'],['crate','Ящик','prop']];
const CATEGORIES=[['foundation','Пол'],['stairs','Лестницы'],['ceiling','Потолки'],['wall','Стены'],['roof','Крыши'],['door','Двери'],['prop','Декор']];
const COLORS=['#b7ac91','#ede6d0','#645c56','#90694c','#674535','#ad5650','#426b9a','#345448','#d2b45f','#424856','#b79bb2','#202c33'];
const TERRAIN_COLORS=['#668358','#3b653b','#a59b71','#89705b','#a8a6a1','#d4c99c','#a6b8c0','#426a7b'];
const w=new WorldBuilder($('viewport'));w.textures=new Map();try{const remembered=Number(localStorage.getItem('phoenix_scene_exposure'));if(remembered>=45&&remembered<=125){$('sceneExposure').value=String(remembered);$('exposureValue').textContent=remembered+'%';w.renderer.toneMappingExposure=remembered/100;}}catch(_){}let currentFilter='all',catalogMode='models',catalogPage=0,catalogMeta={},savedMeta=new Map(),textureMeta=new Map(),lastToast=null,lastTouch=null,pointers=new Map(),inputDragging=false,brushLast=0,localStore=null,isLoading=false;
let statusMessage='';
function toast(s){const el=$('toast');el.textContent=s;el.classList.remove('hidden');clearTimeout(lastToast);lastToast=setTimeout(()=>el.classList.add('hidden'),3300)}
function fmtName(n){return n.replace(/^\d+[_-]/,'').replace(/_/g,' ').replace(/\.glb$/i,'').slice(0,55)}
function groupType(name){
 const s=String(name).toLowerCase();
 if(/потол|ceiling|overhead|перекрыт/.test(s))return 'ceiling';
 if(/лест|ступен|stairs?|step(s)?/.test(s))return 'stairs';
 if(/кры|кровл|roof|shingles|gable/.test(s))return 'roof';
 if(/двер|door|ворот|gate/.test(s))return 'door';
 if(/стен|окно|wall|window|колон|pillar|column/.test(s))return 'wall';
 if(/пол|floor|foundation|фундамент|плит|основан|platform/.test(s))return 'foundation';
 return 'prop';
}
async function openDB(){return await new Promise((resolve,reject)=>{const request=indexedDB.open('phoenix_world_builder_v1',5);request.onupgradeneeded=()=>{const db=request.result;for(const store of ['assets','textures','projects','bindings','categories','previews','catalog'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function dbOp(store,key,value){return new Promise((resolve,reject)=>{const tx=localStore.transaction(store,value===undefined?'readonly':'readwrite');const req=value===undefined?tx.objectStore(store).get(key):tx.objectStore(store).put(value,key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbKeys(store){return new Promise((resolve,reject)=>{const tx=localStore.transaction(store,'readonly');const r=tx.objectStore(store).getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function cacheFromDB(id){if(w.assetCache.has(id))return w.assetCache.get(id);const row=await dbOp('assets',id);if(!row)return null;try{const parsed=await GLB.load(row.bytes);await bindImportedMaterials(id,parsed.root);w.assetCache.set(id,parsed.root);w.assetAnimations.set(id,parsed.animations||[]);if(parsed.triangles>150000)toast('Модель тяжёлая: '+Math.round(parsed.triangles)+' треугольников');return parsed.root}catch(e){toast('Модель не открыта: '+e.message);throw e}}
async function bindImportedMaterials(id,root){if(!localStore)return;const binding=await dbOp('bindings',id);if(!binding?.slots?.length)return;
 const maps=new Map();for(const slot of binding.slots){if(!slot.texture)continue;
  if(!maps.has(slot.texture))try{maps.set(slot.texture,await loadTexture(slot.texture))}catch(e){console.warn('Missing texture',slot.texture,e)}
 }
 root.traverse(o=>{if(!o.isMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];
  for(let i=0;i<mats.length;i++){let m=mats[i];const slot=binding.slots.find(s=>s.name===m.name)||binding.slots[i];const t=maps.get(slot?.texture);if(t){m.map=t;m.color.set('#ffffff');m.needsUpdate=true;}}
 });
}
w.getAsset=cacheFromDB;
// Old projects contain GLB IDs but may not yet contain a saved category.
w.categoryForKind=kind=>BUILTINS.find(item=>item[0]===kind)?.[2]||savedMeta.get(kind)?.category||groupType(savedMeta.get(kind)?.name||kind);
async function rememberAsset(id,name,bytes){await dbOp('assets',id,{name,bytes});savedMeta.set(id,{...(savedMeta.get(id)||{}),...(catalogMeta[id]||{}),name});}
async function rememberTexture(id,name,bytes,mime='image/png',sourcePath=''){await dbOp('textures',id,{name,bytes,mime,sourcePath});textureMeta.set(id,{name,sourcePath});}
async function loadTexture(id){if(w.textures.has(id))return w.textures.get(id);const row=await dbOp('textures',id);if(!row)return null;const url=URL.createObjectURL(new Blob([row.bytes],{type:row.mime}));return await new Promise((resolve,reject)=>{new THREE.TextureLoader().load(url,t=>{t.encoding=THREE.sRGBEncoding;t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;w.textures.set(id,t);URL.revokeObjectURL(url);resolve(t)},undefined,reject)})}
async function updateCatalog(id,patch){
 catalogMeta[id]={...(catalogMeta[id]||{}),...patch};
 const m=savedMeta.get(id);if(m)Object.assign(m,patch);
 try{if(localStore)await dbOp('catalog','metadata',catalogMeta)}catch(e){toast('Не удалось сохранить название: '+e.message)}
}
async function chooseAsset(id){
 try{
  const root=await cacheFromDB(id);if(!root)return toast('Файл не найден');
  const meta=savedMeta.get(id);
  w.setPlacement(id,meta?.category||groupType(meta?.name||id));w.select(null);
  $('btnSelect').classList.remove('active');renderLibrary();
  $('snapShiftLabel').textContent='0 м';toast('Выбрано: '+fmtName(meta?.displayName||meta?.name||id));
 }catch(e){console.error(e);toast('Не удалось выбрать модель: '+e.message)}
}

const GALLERY_SIZE=20;
function makeAssetButton(id,title,kind,category){
 const wrapper=document.createElement('div');wrapper.className='assetGroup';
 const meta=savedMeta.get(id)||{};
 const b=document.createElement('button');b.className='asset';
 if(w.placement===id)b.classList.add('active');
 const img=document.createElement('img');img.className='assetImage unloaded';
 img.alt='3D-превью: '+title;
 img.dataset.previewId=id;img.dataset.builtin=kind==='builtin'?'1':'0';
 const strong=document.createElement('b');strong.textContent=title;
 const small=document.createElement('small');
 small.textContent=kind==='builtin'?'Встроенная деталь':[(meta.library||'Импортированный GLB'),(meta.sourceId?'ID '+meta.sourceId:'')].filter(Boolean).join(' · ');
 const materials=document.createElement('span');materials.className='materialStatus';
 if(kind==='builtin')materials.textContent='Цвет можно изменить';
 else if(meta.materialTotal!==undefined){
  materials.textContent='Материалы: '+(meta.materialLinked||0)+'/'+meta.materialTotal;
  if(!meta.materialLinked)materials.classList.add('missing');
 }else{
  materials.textContent='Текстуры: проверяю…';
  dbOp('bindings',id).then(row=>{
   if(!materials.isConnected)return;
   const total=row?.slots?.length||0,found=row?.slots?.filter(s=>s.texture).length||0;
   materials.textContent=total?'Текстуры: '+found+'/'+total:'Проверяю встроенные…';
   if(!total){
    const check=()=>{
     const model=w.assetCache.get(id);if(!model)return false;
     let all=0,textured=0;
     model.traverse(obj=>{if(obj.isMesh)for(const mat of(Array.isArray(obj.material)?obj.material:[obj.material])){all++;if(mat?.map)textured++;}});
     materials.textContent=textured?'В GLB: '+textured+'/'+all+' текстур':'Нет назначенных изображений';
     if(!textured)materials.classList.add('missing');return true;
    };
    if(!check())img.addEventListener('load',check,{once:true});
   }else if(!found)materials.classList.add('missing');
  }).catch(()=>{materials.textContent='Без информации о текстурах'});
 }
 b.append(img,strong,small,materials);
 b.onclick=async()=>{
  if(kind==='builtin'){w.setPlacement(id,category);w.select(null);$('snapShiftLabel').textContent='0 м';toast('Выбрано: '+title)}
  else await chooseAsset(id);
  if(w.mode==='playbuild')document.body.classList.remove('catalogOpen');
  renderLibrary();
 };
 wrapper.append(b);
 if(kind!=='builtin'){
  const controls=document.createElement('div');controls.className='assetControls';
  const selector=document.createElement('select');selector.className='assetCategory';
  for(const [key,label] of CATEGORIES){const opt=document.createElement('option');opt.value=key;opt.textContent=label;selector.append(opt)}
  selector.value=category;selector.title='Категория модуля';
  selector.onchange=async event=>{
   const type=event.target.value;
   await updateCatalog(id,{category:type,manualCategory:true});
   try{await dbOp('categories',id,type)}catch(e){}
   if(w.placement===id)w.placementCategory=type;
   renderLibrary();toast('Категория изменена');
  };
  const edit=document.createElement('button');edit.textContent='✎';edit.title='Исправить название';
  edit.onclick=()=>{
   const input=document.createElement('input');input.className='assetRename';
   input.value=meta.displayName||fmtName(meta.name||id);
   wrapper.append(input);input.focus();input.select();edit.disabled=true;
   let saved=false;
   const commit=async(save)=>{
    if(saved)return;saved=true;edit.disabled=false;
    if(save&&input.value.trim())await updateCatalog(id,{displayName:input.value.trim()});
    renderLibrary();
   };
   input.onkeydown=e=>{if(e.key==='Enter')commit(true);else if(e.key==='Escape')commit(false)};
   input.onblur=()=>commit(true);
  };
  controls.append(selector,edit);wrapper.append(controls);
 }
 return wrapper;
}
function renderTextureOptions(){
 const el=$('textureSelect'),current=el.value;
 el.innerHTML='<option value="">Без дополнительной текстуры</option>';
 for(const [id,meta] of textureMeta){
  const option=document.createElement('option');option.value=id;option.textContent=meta.name;el.append(option)
 }el.value=current;
}
async function showTextureImage(img,id){
 if(!img.isConnected||!localStore)return;
 const row=await dbOp('textures',id);if(!row||!img.isConnected)return;
 const url=URL.createObjectURL(new Blob([row.bytes],{type:row.mime||'image/jpeg'}));
 img.onload=()=>URL.revokeObjectURL(url);
 img.onerror=()=>URL.revokeObjectURL(url);
 img.src=url;
}
function selectTexture(id){
 return (async()=>{
  const tex=await loadTexture(id);
  if(!tex){toast('Не удалось открыть текстуру');return}
  w.textureId=id;
  if(w.selected){
   w.remember();w.selected.data.texture=id;applyEntry(w.selected);w.onChanged();
  }
  if(w.ghost)w.ghost.traverse(obj=>{
   if(!obj.isMesh)return;
   for(const mat of(Array.isArray(obj.material)?obj.material:[obj.material])){
    mat.map=tex;if(mat.color)mat.color.set('#ffffff');mat.needsUpdate=true;
   }
  });
  toast('Текстура выбрана: '+(textureMeta.get(id)?.name||id));
  renderLibrary();
 })().catch(e=>toast('Ошибка текстуры: '+e.message));
}
function renderLibrary(){
 const el=$('assetList');el.innerHTML='';
 const isTexture=catalogMode==='textures';
 $('categoryFilters').classList.toggle('hidden',isTexture);
 $('btnCatalogModels').classList.toggle('active',!isTexture);
 $('btnCatalogTextures').classList.toggle('active',isTexture);
 const q=$('assetSearch')?.value.trim().toLowerCase()||'';
 const items=[];
 if(isTexture){
  for(const [id,meta] of textureMeta){
   if(q&&!(meta.name+' '+(meta.sourcePath||id)).toLowerCase().includes(q))continue;
   items.push([id,meta]);
  }
 }else{
  for(const [id,name,category] of BUILTINS){
   if((currentFilter!=='all'&&currentFilter!==category)||(q&&!name.toLowerCase().includes(q)))continue;
   items.push({id,name,kind:'builtin',category});
  }
  for(const [id,meta] of savedMeta){
   const name=meta.displayName||fmtName(meta.name);
   const category=meta.category||groupType(meta.name);
   if((currentFilter!=='all'&&currentFilter!==category)||(q&&!(name+' '+meta.name+' '+(meta.sourceId||'')).toLowerCase().includes(q)))continue;
   items.push({id,name,kind:'asset',category});
  }
 }
 const pages=Math.max(1,Math.ceil(items.length/GALLERY_SIZE));
 catalogPage=Math.min(Math.max(0,catalogPage),pages-1);
 $('galleryStatus').textContent='Стр. '+(catalogPage+1)+'/'+pages+' · '+items.length;
 $('galleryPrev').disabled=catalogPage===0;
 $('galleryNext').disabled=catalogPage>=pages-1;
 $('galleryHint').textContent=isTexture?'Нажми на изображение, чтобы назначить покрытие выбранной детали или использовать его для новых.':'Картинки показывают реальную геометрию GLB. Неверное название исправь кнопкой ✎; материалы без привязки отмечены отдельно.';
 const page=items.slice(catalogPage*GALLERY_SIZE,(catalogPage+1)*GALLERY_SIZE);
 if(isTexture){
  for(const [id,meta] of page){
   const card=document.createElement('button');card.className='textureCard';
   if(w.textureId===id)card.classList.add('active');
   const image=document.createElement('img');image.className='textureImage';image.alt=meta.name;
   const title=document.createElement('b');title.textContent=(meta.sourcePath||id.replace(/^tex:/,'')).replace(/^Текстуры[\\/]/i,'');
   card.append(image,title);card.onclick=()=>selectTexture(id);
   el.append(card);showTextureImage(image,id).catch(console.warn);
  }
 }else{
  for(const item of page)el.append(makeAssetButton(item.id,item.name,item.kind,item.category));
  if(localStore&&typeof CatalogPreview!=='undefined')
   CatalogPreview.observeCards(el,(id,builtin)=>builtin?w.makeBuiltin(id):cacheFromDB(id),dbOp,dbOp);
 }
}
function refreshConstructionUI(){
 const height=(w.storeyHeight||2.6).toFixed(2);
 $('storeyHeightInput').value=height;$('buildStoreyHeight').value=height;
 $('levelValue').textContent=(w.floorLevel||0)+1;
 $('buildLevelValue').textContent=(w.floorLevel||0)+1;
 $('placementLiftValue').textContent=Math.round((w.placementLift||0)*100)+' см';
 $('btnSnapToggle').textContent=w.smartSnap!==false?'🧲 К краю пола: вкл.':'○ Свободно: сетка';
 $('btnSnapToggle').setAttribute('aria-pressed',String(w.smartSnap!==false));
 $('btnOverheadCenter').textContent=w.centerOverhead?'⌂ Центрировать крышу: вкл.':'⌂ Центрировать крышу: выкл.';
 $('btnOverheadCenter').setAttribute('aria-pressed',String(!!w.centerOverhead));
}
function setupPicker(){
 $('btnCatalogModels').onclick=()=>{catalogMode='models';catalogPage=0;renderLibrary()};
 $('btnCatalogTextures').onclick=()=>{catalogMode='textures';catalogPage=0;renderLibrary()};
 $('galleryPrev').onclick=()=>{catalogPage=Math.max(0,catalogPage-1);renderLibrary();$('buildPanel').scrollTop=0};
 $('galleryNext').onclick=()=>{catalogPage++;renderLibrary();$('buildPanel').scrollTop=0};const search=document.createElement('input');search.id='assetSearch';search.placeholder='Поиск по названию или ID';search.style.cssText='background:#203442;color:#fff;border:1px solid #486373;border-radius:7px;padding:10px;width:100%;margin-bottom:8px;font-size:12px';$('assetList').before(search);search.oninput=()=>{catalogPage=0;renderLibrary()};
 $all('.pill').forEach(b=>b.onclick=()=>{$all('.pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;catalogPage=0;renderLibrary()});
 $all('.tab').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
 $all('[data-brush]').forEach(b=>b.onclick=()=>{$all('[data-brush]').forEach(t=>t.classList.remove('active'));b.classList.add('active');w.brush=b.dataset.brush});
 $('brushSize').oninput=e=>{w.brushSize=+e.target.value;$('brushSizeValue').textContent=e.target.value};$('brushPower').oninput=e=>{w.brushPower=+e.target.value/100;$('brushPowerValue').textContent=e.target.value+'%'};
 $('roughSlider').oninput=e=>{let val=e.target.value/100;$('roughValue').textContent=e.target.value+'%';updateStyle('roughness',val)};
 $('metalSlider').oninput=e=>{let val=e.target.value/100;$('metalValue').textContent=e.target.value+'%';updateStyle('metalness',val)};
 const changeLevel=dir=>{
  const level=w.changeFloor(dir);
  $('levelValue').textContent=level;$('buildLevelValue').textContent=level;
  toast('Этаж '+level+' · базовая отметка '+(w.floorLevel*(w.storeyHeight||2.6)).toFixed(2)+' м');
 };
 $('levelDown').onclick=()=>changeLevel(-1);$('levelUp').onclick=()=>changeLevel(1);
 $('btnBuildLevelDown').onclick=()=>changeLevel(-1);$('btnBuildLevelUp').onclick=()=>changeLevel(1);
 const changeHeight=e=>{
  const h=w.setStoreyHeight(e.target.value);
  refreshConstructionUI();
  toast('Высота этажа: '+h.toFixed(2)+' м. Существующие детали не перемещены.');
 };
 $('storeyHeightInput').onchange=changeHeight;
 $('buildStoreyHeight').onchange=changeHeight;
 $('textureSelect').onchange=async e=>{if(!w.selected)return toast('Сначала выбери объект');let id=e.target.value;try{if(id)await loadTexture(id);w.remember();w.selected.data.texture=id||null;applyEntry(w.selected);w.onChanged();toast(id?'Текстура применена':'Текстура снята')}catch(err){toast('Ошибка текстуры: '+err.message)}};
 $('modelScale').oninput=e=>{let scale=+e.target.value/100;$('modelScaleValue').textContent=e.target.value+'%';if(!w.selected)return;w.selected.data.scale=scale;w.selected.mesh.scale.setScalar(scale);w.onChanged()};
 function updateAvatarSize(meters){
 w.setAvatarHeight(meters);
 const value=w.avatarHeight.toFixed(2);
 $('avatarHeightValue').textContent=value+' м';$('avatarQuickValue').textContent=value+' м';
 $('avatarHeight').value=String(Math.round(w.avatarHeight*100));
 $('avatarHeightExact').value=value;
}
$('avatarHeight').oninput=e=>updateAvatarSize(Number(e.target.value)/100);
$('avatarHeightExact').onchange=e=>updateAvatarSize(Number(e.target.value));
 $('avatarAnimation').onchange=e=>{w.avatarAnimationOverride=e.target.value||null;w.avatarMotionState='';w.setAvatarMotion(false,true)};
 $('customColor').onchange=e=>updateStyle('color',e.target.value);$('walkSpeed').oninput=e=>{w.playerSpeed=+e.target.value;$('walkSpeedValue').textContent=(+e.target.value).toFixed(1)};
 function swatches(where,colors,fn){let root=$(where);for(const color of colors){const b=document.createElement('button');b.className='swatch';b.style.background=color;b.title=color;b.onclick=()=>{root.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');fn(color)};root.append(b)}}
 swatches('materialColors',COLORS,c=>updateStyle('color',c));swatches('terrainColors',TERRAIN_COLORS,c=>{w.terrainPaint=c;toast('Цвет земли выбран')});
}
function updateStyle(key,value){w.currentPaint=key==='color'?value:w.currentPaint;const e=w.selected;if(!e){toast('Сначала выбери объект на карте');return}w.remember();e.data[key]=value;applyEntry(e);w.onChanged()}
function applyEntry(e){const color=e.data.color?new THREE.Color(e.data.color):null;e.mesh.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m.color&&color&&!(e.kind==='window'&&m.transparent))m.color.copy(color);if(m.roughness!==undefined)m.roughness=e.data.roughness??.8;if(m.metalness!==undefined)m.metalness=e.data.metalness??0;if(e.data.texture&&w.textures.get(e.data.texture)){m.map=w.textures.get(e.data.texture);m.needsUpdate=true}}});}
function setMode(mode){w.setMode(mode);const game=mode==='walk'||mode==='playbuild';
 $all('.tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 for(const m of ['build','terrain','style','walk'])$(m+'Panel').classList.toggle('hidden',mode==='playbuild'?m!=='build':mode!==m);
 document.body.classList.toggle('walking',mode==='walk');document.body.classList.toggle('playbuilding',mode==='playbuild');document.body.classList.remove('catalogOpen');
 $('joystick').classList.toggle('hidden',!game);$('walkHint').classList.toggle('hidden',mode!=='walk');$('actionbar').classList.toggle('hidden',mode==='terrain'||game);
 $('gameBuildHud').classList.toggle('hidden',mode!=='playbuild');$('btnBackEditor').classList.toggle('hidden',mode!=='walk');
 $('btnGameBuild').textContent=mode==='playbuild'?'🏗️ Строим':'🎮 Строить в игре';
 }
function wireButtons(){
 $('btnGameBuild').onclick=()=>setMode('playbuild');
 $('btnBuildCatalog').onclick=()=>{document.body.classList.toggle('catalogOpen');if(document.body.classList.contains('catalogOpen'))renderLibrary()};
 $('btnBuildRotate').onclick=()=>toast('Дополнительный поворот: '+w.rotatePlacement()+'°');
 $('btnSnapToggle').onclick=()=>{
  const active=w.toggleSmartSnap();
  $('btnSnapToggle').textContent=active?'🧲 К краю пола: вкл.':'○ Свободно: сетка';
  $('btnSnapToggle').setAttribute('aria-pressed',String(active));
  toast(active?'Привязка к краям пола включена':'Свободная установка по сетке');
 };
 const moveEdge=delta=>{
  const v=w.shiftAlongEdge(delta);
  $('snapShiftLabel').textContent=v.toFixed(2)+' м';
  toast('Сдвиг вдоль края: '+v.toFixed(2)+' м');
 };
 $('btnShiftLeft').onclick=()=>moveEdge(-.25);
 $('btnShiftRight').onclick=()=>moveEdge(.25);
 const heightStep=delta=>{
  const amount=w.setPlacementLift((w.placementLift||0)+delta);
  refreshConstructionUI();
  toast('Смещение детали по высоте: '+Math.round(amount*100)+' см');
 };
 $('btnLiftDown').onclick=()=>heightStep(-.1);
 $('btnLiftUp').onclick=()=>heightStep(.1);
 $('btnOverheadCenter').onclick=()=>{
  const centered=w.toggleOverheadCenter();refreshConstructionUI();
  toast(centered?'Крыша и потолок центрируются над выбранным полом':'Свободное положение крыши и потолка');
 };
 w.onSnapChanged=result=>{
  const el=$('snapStatus');if(!el)return;
  el.textContent=result.snapped?
   (result.overhead?'✓ Опирается на верх стен или перекрытия':result.edge?'✓ Привязано к краю пола':'✓ Установлено на GLB-пол'):
   (w.smartSnap?'Подойди ближе к краю пола':'Свободная установка');
  el.classList.toggle('snapped',!!result.snapped);
 };
 const setModuleScale=value=>{
  const scale=w.setPlacementScale(value);
  $('moduleScaleValue').textContent=Math.round(scale*100)+'%';
  $('moduleScaleInput').value=Math.round(scale*100);
  toast('Размер детали: '+Math.round(scale*100)+'%');
 };
 $('btnModuleSmaller').onclick=()=>setModuleScale(Math.round(w.placementScale*.8*100)/100);
 $('btnModuleLarger').onclick=()=>setModuleScale(Math.round(w.placementScale*1.25*100)/100);
 $('moduleScaleInput').onchange=e=>setModuleScale(Number(e.target.value)/100);
 $('btnBuildPlace').onclick=()=>{
  if(!w.placement)return toast('Выбери модуль в каталоге');
  const snap=w.solvePlacement(w.forwardPlacementPoint());
  w.placeAt(w.forwardPlacementPoint());saveSoon();
  toast(snap.snapped?'Установлено с привязкой к '+(snap.edge?'краю':'поверхности'):'Установлено по сетке');
 };
 $('btnGameWalk').onclick=()=>{w.setPlacement(null);toast('Осматривай постройку, или выбери деталь в каталоге')};$('btnGameAvatar').onclick=()=>$('fileAvatar').click();$('btnGameRun').onclick=()=>{w.running=!w.running;$('btnGameRun').textContent='🏃 Бег: '+(w.running?'вкл.':'выкл.')};$('btnAvatarAnimationToggle').onclick=()=>{const on=w.toggleAvatarAnimations();$('btnAvatarAnimationToggle').textContent='🎞️ Анимация: '+(on?'вкл.':'выкл.');toast(on?'Анимации включены':'Анимации приостановлены: проверка рига')};const sizeFactor=factor=>updateAvatarSize(Math.max(.01,Math.round(w.avatarHeight*factor*1000)/1000));
 $('btnAvatarSmaller').onclick=()=>{sizeFactor(.5);toast('Рост персонажа: '+w.avatarHeight.toFixed(2)+' м')};
 $('btnAvatarTaller').onclick=()=>{sizeFactor(2);toast('Рост персонажа: '+w.avatarHeight.toFixed(2)+' м')};
 $('btnAvatarTiny').onclick=()=>{sizeFactor(.1);toast('Рост персонажа: '+w.avatarHeight.toFixed(2)+' м')};
 $('btnAvatarHuge').onclick=()=>{sizeFactor(10);toast('Рост персонажа: '+w.avatarHeight.toFixed(2)+' м')};
  const feetAdjust=delta=>{
   const val=w.setAvatarGroundOffset(Math.round((w.avatarGroundOffset+delta)*100)/100);
   $('avatarGroundValue').textContent=Math.round(val*100)+' см';
   toast('Поправка ступней '+Math.round(val*100)+' см');
  };
  $('btnGroundDown').onclick=()=>feetAdjust(-.05);
  $('btnGroundUp').onclick=()=>feetAdjust(.05);$('btnGameExit').onclick=()=>setMode('build');
 $('btnImport').onclick=$('importAssets').onclick=()=>$('fileAssets').click();$('btnTexture').onclick=()=>$('fileTexture').click();$('btnAvatar').onclick=()=>$('fileAvatar').click();
 $('btnUndo').onclick=async()=>{await w.undoLast();toast('Действие отменено')};$('btnSelect').onclick=()=>{w.placement=null;w.moveTarget=null;if(w.ghost)w.ghost.removeFromParent();w.ghost=null;$('btnSelect').classList.add('active');toast('Нажми на объект, чтобы выделить')};
 for(const action of ['Rotate','Copy','Move','Delete'])$('btn'+action).onclick=()=>{if(!w.action(action.toLowerCase()))toast('Сначала выбери объект');else toast({Rotate:'Поворот 90°',Copy:'Создана копия',Move:'Выбери новое место',Delete:'Удалено'}[action])};
 $('btnDoor').onclick=()=>{if(!w.selected)return toast('Выбери дверь или объект');w.remember();w.selected.data.door=!w.selected.data.door;toast(w.selected.data.door?'Дверь интерактивна':'Объект больше не дверь')};
 $('btnDoorOpen').onclick=()=>{if(w.selected){w.toggleDoor(w.selected);toast(w.selected.data.open?'Открыто':'Закрыто')}};
 $('btnZoomIn').onclick=()=>w.distance=Math.max(3,w.distance*.8);$('btnZoomOut').onclick=()=>w.distance=Math.min(90,w.distance*1.22);$('btnCamera').onclick=()=>{w.pitch=.55;w.yaw=.65;w.distance=(w.mode==='playbuild'||w.mode==='walk')?5.2:23};
 $('btnRun').onclick=()=>{w.running=!w.running;$('btnRun').textContent='🏃 Бег: '+(w.running?'вкл.':'выкл.')};
 $('btnSave').onclick=()=>saveLocal(true);$('btnMenu').onclick=()=>{$('modal').classList.remove('hidden')};$('btnCloseModal').onclick=()=>{$('modal').classList.add('hidden')};
 $('newWorld').onclick=async()=>{if(!confirm('Очистить текущую карту? Локально сохранённая версия останется.'))return;w.remember();await w.restore({heights:new Array(4225).fill(0),objects:[]});$('modal').classList.add('hidden');toast('Создана новая карта')};
 $('saveWorld').onclick=async()=>{await saveLocal(true);$('modal').classList.add('hidden')};$('loadWorld').onclick=()=>$('fileProject').click();
 $('exportHouse').onclick=()=>exportHouse();$('exportJson').onclick=()=>exportJson();$('exportPack').onclick=()=>exportPack();$('exportGlb').onclick=()=>exportGlb();
 $('settingsBtn').onclick=()=>$('settings').classList.toggle('hidden');$('fpsLimit').onchange=e=>{w.fpsLimit=+e.target.value;toast('Ограничение '+e.target.value+' FPS')};
 $('sceneExposure').oninput=e=>{const exp=+e.target.value/100;w.renderer.toneMappingExposure=exp;$('exposureValue').textContent=e.target.value+'%';try{localStorage.setItem('phoenix_scene_exposure',e.target.value)}catch(_){}};$('renderScale').onchange=e=>{w.setQuality(+e.target.value,$('shadows').checked);toast('Разрешение '+Math.round(+e.target.value*100)+'%')};$('invertCameraX').onchange=e=>{w.invertCameraX=e.target.checked;try{localStorage.setItem('pwb_camera_x',e.target.checked?'1':'0')}catch(_){}};$('invertJoystickX').onchange=e=>{w.invertJoystickX=e.target.checked;try{localStorage.setItem('pwb_joy_x',e.target.checked?'1':'0')}catch(_){}};$('invertJoystickY').onchange=e=>{w.invertJoystickY=e.target.checked;try{localStorage.setItem('pwb_joy_y',e.target.checked?'1':'0')}catch(_){}};$('avatarFacing').onchange=e=>{w.avatarFacingOffset=Number(e.target.value)*Math.PI/180;try{localStorage.setItem('pwb_avatar_forward',e.target.value)}catch(_){}};$('shadows').onchange=e=>{w.setQuality(w.renderScale,e.target.checked);toast(e.target.checked?'Тени включены':'Тени выключены')};
 $('fileAssets').onchange=async e=>{let files=[...e.target.files];e.target.value='';if(!files.length)return;toast('Загружаю файлы…');let n=0;for(const f of files){try{if(/\.zip$/i.test(f.name)){n+=await importZip(f)}else if(/\.glb$/i.test(f.name)){let id='glb:'+f.name.toLowerCase();await rememberAsset(id,f.name,new Uint8Array(await f.arrayBuffer()));n++}else toast('GLTF с внешними данными пока не поддерживается');}catch(err){toast('Ошибка импорта: '+err.message);console.error(err)}}renderLibrary();renderTextureOptions();toast('Загружено моделей: '+n)};
 $('fileProject').onchange=async e=>{let f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.name.toLowerCase().endsWith('.zip')){await importZip(f,true)}else{const project=JSON.parse(await f.text());await restoreProject(project)}$('modal').classList.add('hidden');toast('Проект открыт')}catch(err){toast('Ошибка проекта: '+err.message);console.error(err)}};
 $('fileAvatar').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;
  try{
   const id='avatar:'+f.name.toLowerCase()+':'+f.size;
   await rememberAsset(id,f.name,new Uint8Array(await f.arrayBuffer()));
   w.assetCache.delete(id);w.assetAnimations.delete(id);
   await cacheFromDB(id);
   const info=await w.setAvatar(id);updateAvatarSize(w.avatarHeight);$('avatarGroundValue').textContent='0 см';$('btnAvatarAnimationToggle').textContent='🎞️ Анимация: вкл.';
   const sel=$('avatarAnimation');sel.innerHTML='<option value="">Автоматически: покой / ходьба / бег</option>';
   for(const name of info.animations){const opt=document.createElement('option');opt.value=name;opt.textContent=name;sel.append(opt)}
   const formatDim=n=>Number(n).toFixed(n>=100?0:2);
   $('avatarInfo').textContent=(info.rigged?'Скелет найден':'Без скелета')+
    ' · Анимаций: '+info.animations.length+
    ' · Исходные размеры XYZ: '+[info.originalSize.width,info.originalSize.height,info.originalSize.depth].map(formatDim).join(' × ');
   toast('Персонаж загружен: '+info.animations.length+' анимаций');
  }catch(err){console.error(err);toast('Ошибка персонажа: '+err.message)}
 };
 $('fileTexture').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const id='tex:'+f.name.toLowerCase();await rememberTexture(id,f.name,new Uint8Array(await f.arrayBuffer()),f.type||'image/png');await loadTexture(id);renderTextureOptions();$('textureSelect').value=id;if(w.selected){w.remember();w.selected.data.texture=id;applyEntry(w.selected);w.onChanged();toast('Текстура установлена')}else toast('Текстура добавлена. Выбери объект для применения')}catch(err){toast('Текстура не открыта: '+err.message)}};
}
async function importZip(file,isProject=false){const entries=await ZipUtils.extract(file),glbs=[],textureKeys=[],keys=Object.keys(entries);let project=null;let manifest=null;let materialMap=null;let savedBindings=null;
 if(entries['assets_manifest.json'])try{manifest=JSON.parse(new TextDecoder().decode(entries['assets_manifest.json']))}catch(e){};
 if(entries['bindings.json'])try{savedBindings=JSON.parse(new TextDecoder().decode(entries['bindings.json']))}catch(e){};
  if(entries['catalog.json'])try{const importedCatalog=JSON.parse(new TextDecoder().decode(entries['catalog.json']));catalogMeta={...catalogMeta,...importedCatalog}}catch(e){};
 for(const key of keys)if(/(?:^|\/)Привязки_материалов(?:_Все)?\.json$/i.test(key)){
  try{materialMap=JSON.parse(new TextDecoder().decode(entries[key]))}catch(e){console.warn(e)}break
 }
 for(let i=0;i<keys.length;i++){
  let name=keys[i],bytes=entries[name],base=name.split('/').pop();
  if(/\.glb$/i.test(name)){const id=manifest?.[name]||'glb:'+name.toLowerCase();await rememberAsset(id,base,bytes);glbs.push(id)}
  else if(/\.(png|jpe?g|webp)$/i.test(name)){const id=manifest?.[name]||'tex:'+name.toLowerCase();let ext=base.split('.').pop().toLowerCase();await rememberTexture(id,base,bytes,ext==='jpg'?'image/jpeg':'image/'+ext,name);textureKeys.push(id)}
  else if(/(?:^|\/)project\.json$/i.test(name))project=JSON.parse(new TextDecoder().decode(bytes));
  if(i%80===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(materialMap?.libraries){
   let linked=0,covered=0;const imported=new Set(glbs);
   for(const [library,lib] of Object.entries(materialMap.libraries)){
    for(const [modelId,model] of Object.entries(lib.models||{})){
     const id='glb:'+String(model.file||'').toLowerCase();
     if(!imported.has(id))continue;
     covered++;
     const slots=(model.material_slots||[]).map(slot=>{
      const candidate=slot.fbx_linked_texture||slot.palette_texture;
      const texture=candidate&&entries[candidate]?'tex:'+candidate.toLowerCase():null;
      return {name:slot.name||'',texture};
     });
     if(slots.some(s=>s.texture)){await dbOp('bindings',id,{slots});w.assetCache.delete(id);linked++}
     const prior=catalogMeta[id]||{},old=savedMeta.get(id)||{};
     const metadata={
      sourceId:String(model.id||modelId),
      library:library.replace(/_\d+$/,''),
      sourceName:model.name_ru||'',
      materialTotal:slots.length,
      materialLinked:slots.filter(s=>s.texture).length
     };
     if(!prior.manualCategory&&!old.manualCategory){
      metadata.category=groupType(model.name_ru||old.name||'');
     }
     catalogMeta[id]={...metadata,...prior};
     savedMeta.set(id,{...old,...catalogMeta[id]});
     if(covered%100===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
   }
   try{await dbOp('catalog','metadata',catalogMeta)}catch(e){console.warn('Catalogue metadata write',e)}
   toast('Найдено текстурных привязок: '+linked+'/'+covered);
  }
  if(savedBindings)for(const [id,row] of Object.entries(savedBindings)){await dbOp('bindings',id,row);w.assetCache.delete(id);}
  if(entries['catalog.json']){try{await dbOp('catalog','metadata',catalogMeta)}catch(e){}for(const [id,meta] of Object.entries(catalogMeta)){if(savedMeta.has(id))Object.assign(savedMeta.get(id),meta)}}
 if(isProject&&project)await restoreProject(project);
 renderLibrary();renderTextureOptions();if(!isProject)toast(`Импорт: ${glbs.length} GLB и ${textureKeys.length} текстур`);return glbs.length;
}
async function loadDependencies(project){const need=new Set(project.objects.map(o=>o.kind).filter(k=>!BUILTINS.some(x=>x[0]===k)));
 for(const id of need)if(!w.assetCache.has(id))try{await cacheFromDB(id)}catch(e){console.warn(id,e)};
 const tex=new Set(project.objects.map(o=>o.texture).filter(Boolean));for(const id of tex)try{await loadTexture(id)}catch(e){};
}
async function restoreProject(project){await loadDependencies(project);await w.restore(project);refreshConstructionUI();if(project.camera){w.yaw=project.camera.yaw??.65;w.pitch=project.camera.pitch??.55;w.distance=project.camera.distance??26;w.target.fromArray(project.camera.target||[0,2,0])}w.undo=[];}
function projectData(){return {...w.snapshot(),camera:{yaw:w.yaw,pitch:w.pitch,distance:w.distance,target:w.target.toArray()},editor:'Phoenix World Builder',format:'PhoenixMap 1.0'}}
async function saveLocal(notify=false){if(isLoading)return;try{await dbOp('projects','autosave',projectData());if(notify)toast('Карта сохранена на планшете')}catch(err){toast('Не удалось сохранить: '+err.message)}}
function b64(bytes){let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result)}
async function saveToDevice(filename,blob){if(window.NativeBridge?.beginSave){const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length>100000000){toast('Файл больше 100 МБ: уменьшите набор моделей');return}
  NativeBridge.beginSave(filename,blob.type||'application/octet-stream');for(let i=0;i<bytes.length;i+=32768)NativeBridge.appendSaveChunk(b64(bytes.subarray(i,i+32768)));NativeBridge.finishSave();toast('Выбери папку для сохранения');
 }else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}}
async function exportJson(){await saveToDevice('phoenix_map.json',new Blob([JSON.stringify(projectData())],{type:'application/json'}));}
async function exportPack(){try{toast('Создаю пакет карты…');const project=projectData(),items={'project.json':JSON.stringify(project)},manifest={};
 const assetIds=new Set(project.objects.map(x=>x.kind).filter(x=>!BUILTINS.some(b=>b[0]===x)));// Character GLB is only used for scene inspection, not exported as house geometry.
 for(const id of assetIds){const row=await dbOp('assets',id);if(row){const path='models/'+id.replace(/[^a-zA-Z0-9._-]/g,'_')+'.glb';items[path]=row.bytes;manifest[path]=id;}}
 const texIds=new Set(project.objects.map(x=>x.texture).filter(Boolean));for(const id of assetIds){const binding=await dbOp('bindings',id);for(const slot of binding?.slots||[])if(slot.texture)texIds.add(slot.texture)}for(const id of texIds){const row=await dbOp('textures',id);if(row){const path='textures/'+id.replace(/[^a-zA-Z0-9._-]/g,'_')+'.'+(row.mime.split('/')[1]||'png');items[path]=row.bytes;manifest[path]=id;}}
 const bindings={};for(const id of assetIds){const row=await dbOp('bindings',id);if(row)bindings[id]=row;}
 const exportCatalog={};for(const id of assetIds)if(catalogMeta[id])exportCatalog[id]=catalogMeta[id];
  items['catalog.json']=JSON.stringify(exportCatalog);items['bindings.json']=JSON.stringify(bindings);items['assets_manifest.json']=JSON.stringify(manifest);let archive=await ZipUtils.build(items);await saveToDevice('phoenix_world_project.zip',archive);}catch(e){toast('Ошибка ZIP: '+e.message);console.error(e)}}
async function exportHouse(){try{toast('Собираю дом без земли и персонажа…');const blob=await SceneExporter.build(w,{houseOnly:true});await saveToDevice('phoenix_house.glb',blob)}catch(e){toast('Ошибка экспорта дома: '+e.message);console.error(e)}}
async function exportGlb(){try{toast('Экспорт 3D-карты…');const blob=await SceneExporter.build(w);await saveToDevice('phoenix_map.glb',blob)}catch(e){toast('Ошибка GLB: '+e.message);console.error(e)}}
function attachTouches(){const canvas=$('viewport');let down=null,strokePrepared=false;
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){down={x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,drag:false};strokePrepared=false;
  if(w.mode==='terrain'){let pos=w.hit(e.clientX,e.clientY);if(pos){w.remember();w.sculpt(pos.x,pos.z,1);strokePrepared=true;}}
 }});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const arr=[...pointers.values()];const d=Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y);if(lastTouch)w.distance=THREE.MathUtils.clamp(w.distance*lastTouch/d,2,85);lastTouch=d;return;}lastTouch=null;
  if(!down)return;let dx=e.clientX-down.px,dy=e.clientY-down.py;down.px=e.clientX;down.py=e.clientY;
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)down.drag=true;
  if(w.mode==='terrain'){const p=w.hit(e.clientX,e.clientY);if(p&&performance.now()-brushLast>32){if(!strokePrepared){w.remember();strokePrepared=true;}w.sculpt(p.x,p.z,.8);brushLast=performance.now()}return;}
  if((w.mode==='build'||w.mode==='style')&&(w.placement||w.moveTarget)){const p=w.hit(e.clientX,e.clientY);if(p)w.updateGhost(p);return;}
  if(down.drag){w.yaw+=(w.invertCameraX?1:-1)*dx*.006;w.pitch=THREE.MathUtils.clamp(w.pitch+dy*.005,(w.mode==='playbuild'||w.mode==='walk')?-.65:.12,1.32);}
 });
 canvas.addEventListener('pointerup',e=>{const point=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(pointers.size!==0){lastTouch=null;return;}lastTouch=null;if(!down)return;
  const dist=Math.hypot(e.clientX-down.x,e.clientY-down.y);if(w.mode==='terrain'){down=null;saveSoon();return;}
  if((w.mode==='walk'||w.mode==='playbuild')&&dist<12){const id=w.hit(e.clientX,e.clientY,true),entry=w.objects.find(x=>x.data.id===id);if(entry&&entry.data.door&&entry.mesh.position.distanceTo(w.player.position)<5){w.toggleDoor(entry);toast(entry.data.open?'Дверь открыта':'Дверь закрыта')}down=null;return;}
  if(w.mode==='build'||w.mode==='style'){
   if(w.placement||w.moveTarget){const p=w.hit(e.clientX,e.clientY);if(p){w.placeAt(p);saveSoon()}}
   else if(dist<12){let id=w.hit(e.clientX,e.clientY,true);w.select(w.objects.find(x=>x.data.id===id)||null);if(id)toast('Деталь выделена')}
  }down=null;});
 canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);down=null;lastTouch=null});
 canvas.addEventListener('wheel',e=>{e.preventDefault();w.distance=THREE.MathUtils.clamp(w.distance*(e.deltaY>0?1.08:.92),2,90)},{passive:false});
 window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;w.keys[e.code]=true;if(w.mode==='playbuild'&&e.code==='KeyE'&&w.placement){w.placeAt(w.forwardPlacementPoint());saveSoon()}if(w.mode==='playbuild'&&e.code==='KeyR')w.rotatePlacement();if(e.code==='Escape'){$('modal').classList.add('hidden');w.select(null)}if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();saveLocal(true)}});window.addEventListener('keyup',e=>w.keys[e.code]=false);
 const stick=$('joystick'),knob=$('joystickKnob');const update=e=>{const r=stick.getBoundingClientRect();let vx=(e.clientX-(r.left+r.width/2))/(r.width*.32),vy=(e.clientY-(r.top+r.height/2))/(r.height*.32);let l=Math.hypot(vx,vy);if(l>1){vx/=l;vy/=l}w.joy={x:vx,y:vy};knob.style.transform=`translate(${vx*36}px,${vy*36}px)`};
 stick.addEventListener('pointerdown',e=>{e.preventDefault();stick.setPointerCapture(e.pointerId);update(e)});stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))update(e)});const reset=()=>{w.joy={x:0,y:0};knob.style.transform='translate(0,0)'};stick.addEventListener('pointerup',reset);stick.addEventListener('pointercancel',reset);
}
let saveHandle=0;function saveSoon(){clearTimeout(saveHandle);saveHandle=setTimeout(()=>saveLocal(),1500)}
async function init(){setupPicker();wireButtons();refreshConstructionUI();attachTouches();const exit=document.createElement('button');exit.id='btnBackEditor';exit.className='hidden';exit.textContent='✎ Редактор';exit.style.cssText='position:absolute;right:12px;bottom:72px;z-index:5;background:#236758';exit.onclick=()=>setMode('build');document.body.append(exit);
 w.onSelected=e=>{if(e){$('modelScale').value=Math.round((e.data.scale||1)*100);$('modelScaleValue').textContent=$('modelScale').value+'%';$('textureSelect').value=e.data.texture||'';$('customColor').value=e.data.color||'#b7ac91';$('roughSlider').value=Math.round((e.data.roughness??.8)*100);$('metalSlider').value=Math.round((e.data.metalness??0)*100);}};w.onChanged=saveSoon;
 renderLibrary();w.animate(0);
 try{localStore=await openDB();const files=await dbKeys('assets');for(const id of files){const row=await dbOp('assets',id);savedMeta.set(id,{name:row.name})}
  const categories=await dbKeys('categories');for(const id of categories){const meta=savedMeta.get(id);if(meta)meta.category=await dbOp('categories',id)}
  const textures=await dbKeys('textures');for(const id of textures){const row=await dbOp('textures',id);textureMeta.set(id,{name:row.name,sourcePath:row.sourcePath||''})}renderTextureOptions();
  catalogMeta=await dbOp('catalog','metadata')||{};
  for(const [id,meta] of Object.entries(catalogMeta)){if(savedMeta.has(id))Object.assign(savedMeta.get(id),meta)}
  const autosave=await dbOp('projects','autosave');if(autosave){isLoading=true;await restoreProject(autosave);isLoading=false;toast('Карта восстановлена из памяти')}else toast('Редактор готов. Выбери деталь и коснись земли');renderLibrary();
 }catch(err){isLoading=false;toast('Хранилище недоступно: '+err.message);console.error(err)}
 try{w.invertCameraX=localStorage.getItem('pwb_camera_x')==='1';$('invertCameraX').checked=w.invertCameraX;w.invertJoystickX=localStorage.getItem('pwb_joy_x')==='1';w.invertJoystickY=localStorage.getItem('pwb_joy_y')==='1';const facing=localStorage.getItem('pwb_avatar_forward');w.avatarFacingOffset=(facing===null?180:Number(facing))*Math.PI/180;$('invertJoystickX').checked=w.invertJoystickX;$('invertJoystickY').checked=w.invertJoystickY;$('avatarFacing').value=String(Math.round(w.avatarFacingOffset*180/Math.PI))}catch(e){}setMode('playbuild');document.addEventListener('visibilitychange',()=>{if(document.hidden)saveLocal()});setInterval(()=>{$('fps').textContent=Math.round(w.fps)+' FPS'},1000);
}
init();
