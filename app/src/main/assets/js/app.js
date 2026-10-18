'use strict';
const $=id=>document.getElementById(id), $all=s=>[...document.querySelectorAll(s)];
const BUILTINS=[['floor','Пол 2×2','foundation'],['wall','Стена 2×2,6','wall'],['window','Стена с окном','wall'],['roof','Двускатная крыша','roof'],['door','Дверь с петлями','door'],['pillar','Колонна','wall'],['stairs','Лестница','foundation'],['tree','Дерево','prop'],['crate','Ящик','prop']];
const COLORS=['#b7ac91','#ede6d0','#645c56','#90694c','#674535','#ad5650','#426b9a','#345448','#d2b45f','#424856','#b79bb2','#202c33'];
const TERRAIN_COLORS=['#668358','#3b653b','#a59b71','#89705b','#a8a6a1','#d4c99c','#a6b8c0','#426a7b'];
const w=new WorldBuilder($('viewport'));w.textures=new Map();try{const remembered=Number(localStorage.getItem('phoenix_scene_exposure'));if(remembered>=45&&remembered<=125){$('sceneExposure').value=String(remembered);$('exposureValue').textContent=remembered+'%';w.renderer.toneMappingExposure=remembered/100;}}catch(_){}let currentFilter='all',savedMeta=new Map(),textureMeta=new Map(),lastToast=null,lastTouch=null,pointers=new Map(),inputDragging=false,brushLast=0,localStore=null,isLoading=false;
let statusMessage='';
function toast(s){const el=$('toast');el.textContent=s;el.classList.remove('hidden');clearTimeout(lastToast);lastToast=setTimeout(()=>el.classList.add('hidden'),3300)}
function fmtName(n){return n.replace(/^\d+[_-]/,'').replace(/_/g,' ').replace(/\.glb$/i,'').slice(0,55)}
function groupType(name){const s=name.toLowerCase();if(/двер|door|ворот/.test(s))return 'door';if(/стен|окно|wall|window|колон/.test(s))return 'wall';if(/пол|лест|ступен|floor|stairs/.test(s))return 'foundation';if(/кры|roof|кровл/.test(s))return 'roof';return 'prop'}
async function openDB(){return await new Promise((resolve,reject)=>{const request=indexedDB.open('phoenix_world_builder_v1',3);request.onupgradeneeded=()=>{const db=request.result;for(const store of ['assets','textures','projects','bindings'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
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
async function rememberAsset(id,name,bytes){await dbOp('assets',id,{name,bytes});savedMeta.set(id,{name});}
async function rememberTexture(id,name,bytes,mime='image/png'){await dbOp('textures',id,{name,bytes,mime});textureMeta.set(id,{name});}
async function loadTexture(id){if(w.textures.has(id))return w.textures.get(id);const row=await dbOp('textures',id);if(!row)return null;const url=URL.createObjectURL(new Blob([row.bytes],{type:row.mime}));return await new Promise((resolve,reject)=>{new THREE.TextureLoader().load(url,t=>{t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;w.textures.set(id,t);URL.revokeObjectURL(url);resolve(t)},undefined,reject)})}
async function chooseAsset(id){try{const root=await cacheFromDB(id);if(!root)return toast('Файл не найден');w.setPlacement(id);w.select(null);$('btnSelect').classList.remove('active');toast('Выбрано: '+fmtName(savedMeta.get(id)?.name||id));}catch(e){console.error(e)}}
function makeAssetButton(id,title,kind){const b=document.createElement('button');b.className='asset';if(w.placement===id)b.classList.add('active');const strong=document.createElement('b');strong.textContent=title;const small=document.createElement('small');small.textContent=kind==='builtin'?'Встроенная деталь':'GLB из памяти';b.append(strong,small);b.onclick=()=>{if(kind==='builtin'){w.setPlacement(id);w.select(null);toast('Выбрано: '+title)}else chooseAsset(id);if(w.mode==='playbuild')document.body.classList.remove('catalogOpen');renderLibrary()};return b}
function renderTextureOptions(){const el=$('textureSelect'),current=el.value;el.innerHTML='<option value="">Без дополнительной текстуры</option>';for(const [id,meta] of textureMeta){const option=document.createElement('option');option.value=id;option.textContent=meta.name;el.append(option)}el.value=current;}
function renderLibrary(){const el=$('assetList');el.innerHTML='';const f=currentFilter,q=$('assetSearch')?.value.trim().toLowerCase()||'';
 for(const [id,name,cat] of BUILTINS)if((f==='all'||f===cat)&&(!q||name.toLowerCase().includes(q)))el.append(makeAssetButton(id,name,'builtin'));
 let count=0,total=0;for(const [id,meta] of savedMeta){let name=meta.name,cat=groupType(name);if((f!=='all'&&f!==cat)||(q&&!name.toLowerCase().includes(q)))continue;total++;if(count++>=90)continue;el.append(makeAssetButton(id,fmtName(name),'asset'))}
 if(total>90){let notice=document.createElement('small');notice.textContent=`Показаны первые 90 из ${total}. Используй поиск.`;notice.className='note';el.append(notice)}
}
function setupPicker(){const search=document.createElement('input');search.id='assetSearch';search.placeholder='Поиск по названию или ID';search.style.cssText='background:#203442;color:#fff;border:1px solid #486373;border-radius:7px;padding:10px;width:100%;margin-bottom:8px;font-size:12px';$('assetList').before(search);search.oninput=renderLibrary;
 $all('.pill').forEach(b=>b.onclick=()=>{$all('.pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;renderLibrary()});
 $all('.tab').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
 $all('[data-brush]').forEach(b=>b.onclick=()=>{$all('[data-brush]').forEach(t=>t.classList.remove('active'));b.classList.add('active');w.brush=b.dataset.brush});
 $('brushSize').oninput=e=>{w.brushSize=+e.target.value;$('brushSizeValue').textContent=e.target.value};$('brushPower').oninput=e=>{w.brushPower=+e.target.value/100;$('brushPowerValue').textContent=e.target.value+'%'};
 $('roughSlider').oninput=e=>{let val=e.target.value/100;$('roughValue').textContent=e.target.value+'%';updateStyle('roughness',val)};
 $('metalSlider').oninput=e=>{let val=e.target.value/100;$('metalValue').textContent=e.target.value+'%';updateStyle('metalness',val)};
 $('levelDown').onclick=()=>{w.floorLevel=Math.max(0,w.floorLevel-1);$('levelValue').textContent=w.floorLevel+1};$('levelUp').onclick=()=>{w.floorLevel=Math.min(20,w.floorLevel+1);$('levelValue').textContent=w.floorLevel+1};
 $('textureSelect').onchange=async e=>{if(!w.selected)return toast('Сначала выбери объект');let id=e.target.value;try{if(id)await loadTexture(id);w.remember();w.selected.data.texture=id||null;applyEntry(w.selected);w.onChanged();toast(id?'Текстура применена':'Текстура снята')}catch(err){toast('Ошибка текстуры: '+err.message)}};
 $('modelScale').oninput=e=>{let scale=+e.target.value/100;$('modelScaleValue').textContent=e.target.value+'%';if(!w.selected)return;w.selected.data.scale=scale;w.selected.mesh.scale.setScalar(scale);w.onChanged()};
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
 $('btnBuildCatalog').onclick=()=>document.body.classList.toggle('catalogOpen');
 $('btnBuildRotate').onclick=()=>toast('Поворот: '+w.rotatePlacement()+'°');
 $('btnBuildPlace').onclick=()=>{if(!w.placement)return toast('Выбери модуль в каталоге');w.placeAt(w.forwardPlacementPoint());saveSoon();toast('Установлено')};
 $('btnGameWalk').onclick=()=>setMode('walk');$('btnGameAvatar').onclick=()=>$('fileAvatar').click();$('btnGameExit').onclick=()=>setMode('build');
 $('btnImport').onclick=$('importAssets').onclick=()=>$('fileAssets').click();$('btnTexture').onclick=()=>$('fileTexture').click();$('btnAvatar').onclick=()=>$('fileAvatar').click();
 $('btnUndo').onclick=async()=>{await w.undoLast();toast('Действие отменено')};$('btnSelect').onclick=()=>{w.placement=null;w.moveTarget=null;if(w.ghost)w.ghost.removeFromParent();w.ghost=null;$('btnSelect').classList.add('active');toast('Нажми на объект, чтобы выделить')};
 for(const action of ['Rotate','Copy','Move','Delete'])$('btn'+action).onclick=()=>{if(!w.action(action.toLowerCase()))toast('Сначала выбери объект');else toast({Rotate:'Поворот 90°',Copy:'Создана копия',Move:'Выбери новое место',Delete:'Удалено'}[action])};
 $('btnDoor').onclick=()=>{if(!w.selected)return toast('Выбери дверь или объект');w.remember();w.selected.data.door=!w.selected.data.door;toast(w.selected.data.door?'Дверь интерактивна':'Объект больше не дверь')};
 $('btnDoorOpen').onclick=()=>{if(w.selected){w.toggleDoor(w.selected);toast(w.selected.data.open?'Открыто':'Закрыто')}};
 $('btnZoomIn').onclick=()=>w.distance=Math.max(3,w.distance*.8);$('btnZoomOut').onclick=()=>w.distance=Math.min(90,w.distance*1.22);$('btnCamera').onclick=()=>{w.pitch=.7;w.yaw=.65;w.distance=23};
 $('btnRun').onclick=()=>{w.running=!w.running;$('btnRun').textContent='🏃 Бег: '+(w.running?'вкл.':'выкл.')};
 $('btnSave').onclick=()=>saveLocal(true);$('btnMenu').onclick=()=>{$('modal').classList.remove('hidden')};$('btnCloseModal').onclick=()=>{$('modal').classList.add('hidden')};
 $('newWorld').onclick=async()=>{if(!confirm('Очистить текущую карту? Локально сохранённая версия останется.'))return;w.remember();await w.restore({heights:new Array(4225).fill(0),objects:[]});$('modal').classList.add('hidden');toast('Создана новая карта')};
 $('saveWorld').onclick=async()=>{await saveLocal(true);$('modal').classList.add('hidden')};$('loadWorld').onclick=()=>$('fileProject').click();
 $('exportHouse').onclick=()=>exportHouse();$('exportJson').onclick=()=>exportJson();$('exportPack').onclick=()=>exportPack();$('exportGlb').onclick=()=>exportGlb();
 $('settingsBtn').onclick=()=>$('settings').classList.toggle('hidden');$('fpsLimit').onchange=e=>{w.fpsLimit=+e.target.value;toast('Ограничение '+e.target.value+' FPS')};
 $('sceneExposure').oninput=e=>{const exp=+e.target.value/100;w.renderer.toneMappingExposure=exp;$('exposureValue').textContent=e.target.value+'%';try{localStorage.setItem('phoenix_scene_exposure',e.target.value)}catch(_){}};$('renderScale').onchange=e=>{w.setQuality(+e.target.value,$('shadows').checked);toast('Разрешение '+Math.round(+e.target.value*100)+'%')};$('shadows').onchange=e=>{w.setQuality(w.renderScale,e.target.checked);toast(e.target.checked?'Тени включены':'Тени выключены')};
 $('fileAssets').onchange=async e=>{let files=[...e.target.files];e.target.value='';if(!files.length)return;toast('Загружаю файлы…');let n=0;for(const f of files){try{if(/\.zip$/i.test(f.name)){n+=await importZip(f)}else if(/\.glb$/i.test(f.name)){let id='glb:'+f.name.toLowerCase();await rememberAsset(id,f.name,new Uint8Array(await f.arrayBuffer()));n++}else toast('GLTF с внешними данными пока не поддерживается');}catch(err){toast('Ошибка импорта: '+err.message);console.error(err)}}renderLibrary();renderTextureOptions();toast('Загружено моделей: '+n)};
 $('fileProject').onchange=async e=>{let f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.name.toLowerCase().endsWith('.zip')){await importZip(f,true)}else{const project=JSON.parse(await f.text());await restoreProject(project)}$('modal').classList.add('hidden');toast('Проект открыт')}catch(err){toast('Ошибка проекта: '+err.message);console.error(err)}};
 $('fileAvatar').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;
  try{
   const id='avatar:'+f.name.toLowerCase()+':'+f.size;
   await rememberAsset(id,f.name,new Uint8Array(await f.arrayBuffer()));
   w.assetCache.delete(id);w.assetAnimations.delete(id);
   await cacheFromDB(id);
   const info=await w.setAvatar(id);
   const sel=$('avatarAnimation');sel.innerHTML='<option value="">Автоматически: покой / ходьба / бег</option>';
   for(const name of info.animations){const opt=document.createElement('option');opt.value=name;opt.textContent=name;sel.append(opt)}
   $('avatarInfo').textContent=(info.rigged?'Скелет найден':'Без скелета')+' · Анимаций: '+info.animations.length;
   toast('Персонаж загружен: '+info.animations.length+' анимаций');
  }catch(err){console.error(err);toast('Ошибка персонажа: '+err.message)}
 };
 $('fileTexture').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const id='tex:'+f.name.toLowerCase();await rememberTexture(id,f.name,new Uint8Array(await f.arrayBuffer()),f.type||'image/png');await loadTexture(id);renderTextureOptions();$('textureSelect').value=id;if(w.selected){w.remember();w.selected.data.texture=id;applyEntry(w.selected);w.onChanged();toast('Текстура установлена')}else toast('Текстура добавлена. Выбери объект для применения')}catch(err){toast('Текстура не открыта: '+err.message)}};
}
async function importZip(file,isProject=false){const entries=await ZipUtils.extract(file),glbs=[],textureKeys=[],keys=Object.keys(entries);let project=null;let manifest=null;let materialMap=null;let savedBindings=null;
 if(entries['assets_manifest.json'])try{manifest=JSON.parse(new TextDecoder().decode(entries['assets_manifest.json']))}catch(e){};
 if(entries['bindings.json'])try{savedBindings=JSON.parse(new TextDecoder().decode(entries['bindings.json']))}catch(e){};
 for(const key of keys)if(/(?:^|\/)Привязки_материалов(?:_Все)?\.json$/i.test(key)){
  try{materialMap=JSON.parse(new TextDecoder().decode(entries[key]))}catch(e){console.warn(e)}break
 }
 for(let i=0;i<keys.length;i++){
  let name=keys[i],bytes=entries[name],base=name.split('/').pop();
  if(/\.glb$/i.test(name)){const id=manifest?.[name]||'glb:'+name.toLowerCase();await rememberAsset(id,base,bytes);glbs.push(id)}
  else if(/\.(png|jpe?g|webp)$/i.test(name)){const id=manifest?.[name]||'tex:'+name.toLowerCase();let ext=base.split('.').pop().toLowerCase();await rememberTexture(id,base,bytes,ext==='jpg'?'image/jpeg':'image/'+ext);textureKeys.push(id)}
  else if(/(?:^|\/)project\.json$/i.test(name))project=JSON.parse(new TextDecoder().decode(bytes));
  if(i%80===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(materialMap?.libraries){let linked=0;for(const lib of Object.values(materialMap.libraries))for(const model of Object.values(lib.models||{})){
   const id='glb:'+String(model.file||'').toLowerCase();if(!glbs.includes(id))continue;
   const slots=(model.material_slots||[]).map(slot=>{const path=slot.fbx_linked_texture||slot.palette_texture;
    const texture=path&&entries[path]?'tex:'+path.toLowerCase():null;
    return {name:slot.name||'',texture};});
   if(slots.some(s=>s.texture)){await dbOp('bindings',id,{slots});w.assetCache.delete(id);linked++}
  }toast('Связаны материалы '+linked+' моделей');
 }
 if(savedBindings)for(const [id,row] of Object.entries(savedBindings)){await dbOp('bindings',id,row);w.assetCache.delete(id);}
 if(isProject&&project)await restoreProject(project);
 renderLibrary();renderTextureOptions();if(!isProject)toast(`Импорт: ${glbs.length} GLB и ${textureKeys.length} текстур`);return glbs.length;
}
async function loadDependencies(project){const need=new Set(project.objects.map(o=>o.kind).filter(k=>!BUILTINS.some(x=>x[0]===k)));
 for(const id of need)if(!w.assetCache.has(id))try{await cacheFromDB(id)}catch(e){console.warn(id,e)};
 const tex=new Set(project.objects.map(o=>o.texture).filter(Boolean));for(const id of tex)try{await loadTexture(id)}catch(e){};
}
async function restoreProject(project){await loadDependencies(project);await w.restore(project);if(project.camera){w.yaw=project.camera.yaw??.65;w.pitch=project.camera.pitch??.55;w.distance=project.camera.distance??26;w.target.fromArray(project.camera.target||[0,2,0])}w.undo=[];}
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
 items['bindings.json']=JSON.stringify(bindings);items['assets_manifest.json']=JSON.stringify(manifest);let archive=await ZipUtils.build(items);await saveToDevice('phoenix_world_project.zip',archive);}catch(e){toast('Ошибка ZIP: '+e.message);console.error(e)}}
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
  if(w.mode!=='playbuild'&&(w.placement||w.moveTarget)){const p=w.hit(e.clientX,e.clientY);if(p)w.updateGhost(p);return;}
  if(down.drag){w.yaw+=dx*.006;w.pitch=THREE.MathUtils.clamp(w.pitch+dy*.005,.12,1.32);}
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
async function init(){setupPicker();wireButtons();attachTouches();const exit=document.createElement('button');exit.id='btnBackEditor';exit.className='hidden';exit.textContent='✎ Редактор';exit.style.cssText='position:absolute;right:12px;bottom:72px;z-index:5;background:#236758';exit.onclick=()=>setMode('build');document.body.append(exit);
 w.onSelected=e=>{if(e){$('modelScale').value=Math.round((e.data.scale||1)*100);$('modelScaleValue').textContent=$('modelScale').value+'%';$('textureSelect').value=e.data.texture||'';$('customColor').value=e.data.color||'#b7ac91';$('roughSlider').value=Math.round((e.data.roughness??.8)*100);$('metalSlider').value=Math.round((e.data.metalness??0)*100);}};w.onChanged=saveSoon;
 renderLibrary();w.animate(0);
 try{localStore=await openDB();const files=await dbKeys('assets');for(const id of files){const row=await dbOp('assets',id);savedMeta.set(id,{name:row.name})}const textures=await dbKeys('textures');for(const id of textures){const row=await dbOp('textures',id);textureMeta.set(id,{name:row.name})}renderTextureOptions();
  const autosave=await dbOp('projects','autosave');if(autosave){isLoading=true;await restoreProject(autosave);isLoading=false;toast('Карта восстановлена из памяти')}else toast('Редактор готов. Выбери деталь и коснись земли');renderLibrary();
 }catch(err){isLoading=false;toast('Хранилище недоступно: '+err.message);console.error(err)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)saveLocal()});setInterval(()=>{$('fps').textContent=Math.round(w.fps)+' FPS'},1000);
}
init();
