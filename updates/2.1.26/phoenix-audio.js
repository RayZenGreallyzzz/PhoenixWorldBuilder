/* Phoenix Audio 1.2 — audio bytes in IndexedDB, tiny references in world JSON.
 * Local Android/WebView playback; no network, no eval, no extra animation loop.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_SOUND=16*1024*1024,MAX_MUSIC=32*1024*1024,MAX_TOTAL=96*1024*1024;
 const holdable=event=>event==='attack'||event.startsWith('skill:');
 const EVENTS=['idle','walk','run','attack','hit','death','cast',
  'skill:slot3','skill:slot4','skill:slot5','skill:slot6','skill:slot7','skill:ultimate'];
 const EVENT_LABELS=['🧍 Idle / ожидание','🚶 Walk / шаги','🏃 Run / бег',
  '⚔️ Attack / удар','💥 Hit / получение урона','☠️ Death / смерть',
  '✨ Cast / заклинание','✨ Навык 1','🌀 Навык 2',
  '🌟 Навык 3','💠 Навык 4','🌙 Навык 5','🔥 Ульта'];
 const MIME={'mp3':'audio/mpeg','wav':'audio/wav','ogg':'audio/ogg','m4a':'audio/mp4','aac':'audio/aac'};
 const clamp01=x=>Number.isFinite(Number(x))?Math.max(0,Math.min(1,Number(x))):1;
 const blank=()=>({version:1,mix:{master:1,music:.65,effects:.8},world:null,actors:{}});
 const allowed=id=>id==='player'||/^prefab-[1-9]\d*$/.test(id);
 function validSound(v,maxBytes,event=''){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const name=String(v.name||'sound').slice(0,90);
  const volume=clamp01(v.volume??1),loop=!!v.loop;
  const stopOnRelease=typeof v.stopOnRelease==='boolean'?v.stopOnRelease:holdable(event);
  if(typeof v.ref==='string'&&/^audio:clip:[a-zA-Z0-9._-]{4,100}$/.test(v.ref)){
   const size=Number(v.size||0);
   if(!Number.isInteger(size)||size<1||size>maxBytes)return null;
   const mime=Object.values(MIME).includes(v.mime)?v.mime:'audio/mpeg';
   return {name,ref:v.ref,size,mime,volume,loop,stopOnRelease};
  }
  // Older 2.1.20 projects contained the full Base64 data URI. Read them
  // unchanged and allow the user to replace them without losing old audio.
  const match=/^data:(audio\/(?:mpeg|mp3|wav|x-wav|wave|ogg|mp4|aac));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(v.data||'');
  if(!match||match[2].length>Math.ceil(maxBytes/3)*4+4)return null;
  return {name,data:v.data,volume,loop,stopOnRelease};
 }
 function soundBytes(v){return v?.ref?v.size:(v?.data?Math.ceil(v.data.length*.75):0)}
 function normalize(raw){
  const state=blank();
  if(!raw||typeof raw!=='object')return state;
  state.mix.master=clamp01(raw.mix?.master??1);
  state.mix.music=clamp01(raw.mix?.music??.65);
  state.mix.effects=clamp01(raw.mix?.effects??.8);
  state.world=validSound(raw.world,MAX_MUSIC,'music');
  let budget=soundBytes(state.world);
  if(budget>MAX_TOTAL){state.world=null;budget=0;}
  if(raw.actors&&typeof raw.actors==='object'&&!Array.isArray(raw.actors)){
   for(const [actor,events] of Object.entries(raw.actors)){
    if(!allowed(actor)||!events||typeof events!=='object')continue;
    const mapped={};
    for(const key of EVENTS){
     const v=validSound(events[key],MAX_SOUND,key);
     if(!v||budget+soundBytes(v)>MAX_TOTAL)continue;
     mapped[key]=v;budget+=soundBytes(v);
    }
    if(Object.keys(mapped).length)state.actors[actor]=mapped;
   }
  }
  return state;
 }
 class Studio{
  constructor(builder,doc,storage={}){
   this.b=builder;this.doc=doc||document;
   this.storage=storage;this.urls=new Map();this.pending=new Map();this.generation=0;
   this.state=blank();this.playing=false;this.music=null;
   this.loops=new Map();this.voices=new Set();this.preview=null;
   // One rejected WebView play() must NOT create another Audio next frame.
   this.loopFailures=new Map();this.assetRetryAt=new Map();this.lastAudioErrorNotice=0;
   this.holds=new Map();this.voiceActions=new Map();this.audioTemplates=new Map();
   this.draft=null;this.draftFile='';this.previewURL=null;this.panel=this.el('phoenixAudioPanel');
   if(!this.panel)throw new Error('Phoenix audio panel missing');
   this.bind();this.refreshTargets();this.updateForm();
  }
  el(id){return this.doc.getElementById(id)}
  info(v){const n=this.el('phoenixAudioNotice');if(n)n.textContent=v}
  mark(){this.b.markProjectDirty?.()}
  serialize(){return this.state}
  loadFromProject(raw){
   this.stopPlay();this.generation++;this.assetEpoch=(this.assetEpoch||0)+1;
   this.clearAssetCache();
   this.state=normalize(raw);this.draft=null;this.draftFile='';
   this.refreshTargets();this.updateForm();
   // Prepare world music for a later user-initiated PLAY gesture.
   if(this.state.world?.ref)this.ensureURL(this.state.world).catch(()=>{});
  }
  clearAssetCache(){
   this.loopFailures?.clear();this.assetRetryAt?.clear();
   for(const url of this.urls.values())try{URL.revokeObjectURL?.(url)}catch(e){}
   this.urls.clear();this.pending.clear();this.audioTemplates.clear();
  }
  bind(){
   this.el('btnPhoenixAudio')?.addEventListener('click',()=>this.panel.hidden?this.open():this.close());
   this.el('btnPhoenixAudioClose')?.addEventListener('click',()=>this.close());
   this.el('phoenixAudioActor')?.addEventListener('change',()=>this.updateForm());
   this.el('phoenixAudioEvent')?.addEventListener('change',()=>this.updateForm());
   this.el('phoenixAudioFile')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];if(file)this.pickFile(file);
    else this.info('Файл не выбран. Открой «Файлы» Android и выбери аудио.');
   });
   this.el('btnPhoenixAudioSaveProject')?.addEventListener('click',()=>{
    const ok=this.safeSave();this.info(ok?'✅ Открытый проект сохранён.':'⚠ Сохранение остановлено: сцена отличается от ранее сохранённой. Не удаляй резервную копию.');
   });
   this.el('phoenixAudioVolume')?.addEventListener('input',()=>this.paintVolume());
   this.el('btnPhoenixAudioPreview')?.addEventListener('click',()=>this.previewSound());
   this.el('btnPhoenixAudioStop')?.addEventListener('click',()=>this.stopPreview());
   this.el('btnPhoenixAudioSave')?.addEventListener('click',()=>this.save());
   this.el('btnPhoenixAudioRemove')?.addEventListener('click',()=>this.remove());
   for(const [key,id] of [['master','phoenixAudioMaster'],['music','phoenixAudioMusic'],['effects','phoenixAudioEffects']])
    this.el(id)?.addEventListener('input',e=>{
     this.state.mix[key]=clamp01(Number(e.target.value)/100);
     this.el(id+'Value').textContent=Math.round(this.state.mix[key]*100)+'%';
     this.applyMix();this.mark();
    });
  }
  refreshTargets(){
   const select=this.el('phoenixAudioActor');if(!select)return;
   const prev=select.value||'world';select.replaceChildren();
   const items=[['world','🌍 Общий мир / музыка'],['player','🧍 Герой / игрок']];
   for(const prefab of this.b.prefabEditor?.registry.list()||[])
    items.push([prefab.id,({mob:'🐺 ',boss:'👹 ',npc:'🧑 ',hero:'🧍 '}[prefab.type]||'🧬 ')+(prefab.name||prefab.id)]);
   for(const [id,name] of items){const o=this.doc.createElement('option');o.value=id;o.textContent=name;select.appendChild(o)}
   select.value=items.some(([id])=>id===prev)?prev:'world';
  }
  refreshEvents(){
   const sel=this.el('phoenixAudioEvent'),old=sel.value||'idle';sel.replaceChildren();
   const actor=this.el('phoenixAudioActor')?.value;
   if(actor==='world'){
    const o=this.doc.createElement('option');o.value='music';o.textContent='🎵 Фоновая музыка мира';sel.appendChild(o);
   }else for(let i=0;i<EVENTS.length;i++){
    const o=this.doc.createElement('option');o.value=EVENTS[i];o.textContent=EVENT_LABELS[i];sel.appendChild(o);
   }
   sel.value=actor==='world'?'music':(EVENTS.includes(old)?old:'idle');
  }
  slot(){return [this.el('phoenixAudioActor')?.value||'world',this.el('phoenixAudioEvent')?.value||'music']}
  entry(){const [actor,event]=this.slot();return actor==='world'?this.state.world:this.state.actors[actor]?.[event]||null}
  updateForm(){
   this.stopPreview();this.draft=null;this.draftFile='';
   this.refreshEvents();
   const v=this.entry(),[actor,event]=this.slot();
   this.el('phoenixAudioCurrent').textContent=v?'🎧 '+v.name:'Звук не назначен';
   this.el('phoenixAudioVolume').value=Math.round((v?.volume??1)*100);
   this.el('phoenixAudioLoop').checked=v?.loop??(actor==='world'||['idle','walk','run'].includes(event));
   this.el('phoenixAudioStopOnRelease').checked=v?.stopOnRelease??holdable(event);
   this.el('phoenixAudioStopOnReleaseRow').hidden=actor==='world';
   this.el('phoenixAudioLoop').disabled=actor==='world';
   if(actor==='world')this.el('phoenixAudioLoop').checked=true;
   this.el('phoenixAudioFile').value='';
   this.paintVolume();this.paintMix();
   this.info(actor==='world'?'Музыка прозвучит только в PLAY. Доступно до 32 МБ.':
    'Выбери файл и нажми «Сохранить звук». Для одного звука — до 16 МБ.');
  }
  paintVolume(){this.el('phoenixAudioVolumeValue').textContent=this.el('phoenixAudioVolume').value+'%'}
  paintMix(){for(const [key,id] of [['master','phoenixAudioMaster'],['music','phoenixAudioMusic'],['effects','phoenixAudioEffects']]){
   const v=Math.round(this.state.mix[key]*100);this.el(id).value=v;this.el(id+'Value').textContent=v+'%';
  }}
  open(){if(this.b.playBridge?.active)return false;this.refreshTargets();this.panel.hidden=false;this.updateForm();return true}
  openForActor(actor,event='attack'){
   if(!this.open())return false;
   const select=this.el('phoenixAudioActor');
   if([...select.options].some(o=>o.value===actor))select.value=actor;
   this.refreshEvents();
   const events=this.el('phoenixAudioEvent');if([...events.options].some(o=>o.value===event))events.value=event;
   this.updateCurrent();return true;
  }
  updateCurrent(){this.stopPreview();this.draft=null;this.draftFile='';this.el('phoenixAudioFile').value='';
   const v=this.entry(),[actor,event]=this.slot();
   this.el('phoenixAudioCurrent').textContent=v?'🎧 '+v.name:'Звук не назначен';
   this.el('phoenixAudioVolume').value=Math.round((v?.volume??1)*100);
   this.el('phoenixAudioLoop').checked=v?.loop??(actor==='world'||['idle','walk','run'].includes(event));
   this.el('phoenixAudioStopOnRelease').checked=v?.stopOnRelease??holdable(event);
   this.el('phoenixAudioStopOnReleaseRow').hidden=actor==='world';
   this.el('phoenixAudioLoop').disabled=actor==='world';
   if(actor==='world')this.el('phoenixAudioLoop').checked=true;
   this.paintVolume();this.info('Прикрепи звук или измени громкость и нажми «Сохранить звук».');
  }
  close(){this.panel.hidden=true;this.stopPreview()}
  async pickFile(file){
   if(!file)return;
   const [actor]=this.slot();const extension=(file.name.split('.').pop()||'').toLowerCase();
   const mime=MIME[extension]||(Object.values(MIME).includes(file.type)?file.type:null);
   const max=actor==='world'?MAX_MUSIC:MAX_SOUND;
   if(!mime||!file.size||file.size>max){
    this.el('phoenixAudioFile').value='';
    this.info('⚠ '+file.name+': '+(file.size/1048576).toFixed(2)+' МБ. '+
     'Нужен MP3/WAV/OGG/M4A до '+Math.floor(max/1048576)+' МБ для этого действия.');return;
   }
   // Never embed audio as Base64 in the scene: Android native project save
   // has a hard 16-million-character limit. Preserve the original bytes.
   this.draft={file,name:file.name,mime,size:file.size};this.draftFile=file.name;
   this.el('phoenixAudioCurrent').textContent='Новый: '+file.name;
   this.info('✅ Выбран '+file.name+' ('+(file.size/1048576).toFixed(2)+
    ' МБ). Нажми «Сохранить звук».');
  }
  async save(){
   const [actor,event]=this.slot(),previous=this.entry();
   if(!previous&&!this.draft){this.info('Сначала выбери аудиофайл.');return false;}
   let v={...(this.draft||previous),volume:clamp01(this.el('phoenixAudioVolume').value/100),
    loop:actor==='world'?true:!!this.el('phoenixAudioLoop').checked,
    stopOnRelease:actor!=='world'&&!!this.el('phoenixAudioStopOnRelease').checked};
   const next=normalize(this.state);
   try{
    if(this.draft){
     const id='audio:clip:'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);
     const bytes=await this.draft.file.arrayBuffer();
     if(typeof this.storage.writeAsset!=='function')throw Error('Хранилище аудио недоступно');
     await this.storage.writeAsset(id,bytes);
     v={name:this.draft.name,mime:this.draft.mime,size:this.draft.size,ref:id,
      volume:v.volume,loop:v.loop,stopOnRelease:v.stopOnRelease};
     if(typeof URL!=='undefined'&&URL.createObjectURL){
      const url=URL.createObjectURL(this.draft.file);this.urls.set(id,url);
     }
    }
    if(actor==='world')next.world=v;
    else{if(!next.actors[actor])next.actors[actor]={};next.actors[actor][event]=v;}
    const verified=normalize(next);
    const accepted=actor==='world'?verified.world?.ref===v.ref&&verified.world?.data===v.data:
     verified.actors[actor]?.[event]?.ref===v.ref&&verified.actors[actor]?.[event]?.data===v.data;
    if(!accepted)throw Error('Общий лимит аудио (96 МБ) превышен');
    this.state=verified;this.draft=null;this.draftFile='';
    this.el('phoenixAudioCurrent').textContent='🎧 '+v.name;
    this.el('phoenixAudioFile').value='';this.mark();this.applyMix();
    // Asset bytes are already persisted. Never implicitly write the WORLD
    // from the Audio panel, particularly before the user's project is loaded.
    this.info('✅ Звук назначен. Теперь нажми «💾 Сохранить проект» после проверки мира.');
    return true;
   }catch(e){this.info('⚠ Не удалось сохранить звук: '+e.message);return false}
  }
  async ensureURL(source){
   if(!source?.ref)return source?.data||null;
   if(this.urls.has(source.ref))return this.urls.get(source.ref);
   if(this.pending.has(source.ref))return this.pending.get(source.ref);
   if(Date.now()<(this.assetRetryAt.get(source.ref)||0))return null;
   if(typeof this.storage.readAsset!=='function')throw Error('Хранилище аудио недоступно');
   const epoch=this.assetEpoch||0;
   const promise=Promise.resolve().then(()=>this.storage.readAsset(source.ref)).then(bytes=>{
    if(epoch!==(this.assetEpoch||0))throw Error('Проект сменился во время загрузки аудио');
    if(!bytes)throw Error('Файл '+source.name+' не найден в библиотеке');
    const blob=new Blob([bytes],{type:source.mime||'audio/mpeg'});
    const url=URL.createObjectURL(blob);
    if(epoch!==(this.assetEpoch||0)){
     URL.revokeObjectURL?.(url);throw Error('Аудио относится к старому проекту');
    }
    this.urls.set(source.ref,url);
    if(!this.playing)this.prepareTemplate(source,url);
    return url;
   }).catch(error=>{
    if(epoch===(this.assetEpoch||0))this.assetRetryAt.set(source.ref,Date.now()+30000);
    throw error;
   }).finally(()=>{
    if(epoch===(this.assetEpoch||0))this.pending.delete(source.ref);
   });
   this.pending.set(source.ref,promise);return promise;
  }
  remove(){
   const [actor,event]=this.slot();
   if(actor==='world')this.state.world=null;
   else if(this.state.actors[actor])delete this.state.actors[actor][event];
   this.stopPreview();this.draft=null;this.draftFile='';this.stopPlay();
   this.mark();this.updateCurrent();
   this.info('🗑 Привязка удалена. Нажми «💾 Сохранить проект» после проверки мира.');
  }
  // Audio changes never save a world implicitly. Explicit save performs a
  // conservative comparison with the existing native/LocalStorage world.
  safeSave(){
   try{
    if(typeof this.b.project!=='function'||typeof this.b.save!=='function')return false;
    const current=this.b.project();
    const stored=globalThis.NativeBridge?.loadCleanProject?.()||
     globalThis.localStorage?.getItem?.('phoenix-builder-clean-v2')||'';
    if(stored){
     const previous=JSON.parse(stored);
     const oldObjects=Array.isArray(previous.objects)?previous.objects:[];
     const newObjects=Array.isArray(current.objects)?current.objects:[];
     const oldIds=new Set(oldObjects.map(v=>v.id).filter(v=>v!==undefined));
     const retained=newObjects.filter(v=>oldIds.has(v.id)).length;
     // A completely different scene, or an unexpected major deletion, must
     // not be overwritten merely because the Audio panel is open.
     const suspicious=oldObjects.length>=8&&(
      (newObjects.length<oldObjects.length*.65)||
      (oldIds.size>=8&&retained<Math.min(oldIds.size,newObjects.length)*.25));
     if(suspicious){
      this.info('⚠ Открытая сцена сильно отличается от сохранённой. ' +
       'Сохрани резервную копию. Подтверди замену старого мира отдельно.');
      return false;
     }
    }
    return this.b.save()===true;
   }catch(e){this.info('⚠ Проект не сохранён: '+e.message);return false}
  }
  prepareTemplate(source,url){
   if(!source?.ref||!url||this.audioTemplates.has(source.ref)||typeof Audio==='undefined')return;
   try{const a=new Audio(url);a.preload='auto';a.load?.();this.audioTemplates.set(source.ref,a)}catch(e){}
  }
  sound(source,kind='effects',pos=null,{preview=false,loop=false}={}){
   if(!source||(!source.data&&!this.urls.get(source.ref))||typeof Audio==='undefined')return null;
   if(!preview&&!this.playing)return null;
   const vol=this.volume(source,kind,pos);
   if(vol<=.001)return null;
   try{
    // This media element is created only for an actual sound.
    const cached=this.audioTemplates.get(source.ref);
    const audio=cached?.cloneNode?cached.cloneNode(true):new Audio(source.data||this.urls.get(source.ref));
    audio.preload='auto';audio.loop=loop;audio.volume=vol;
    const promise=audio.play();
    if(promise?.then)promise.then(()=>this.playbackSucceeded(audio),
     err=>this.playbackFailed(audio,err));
    return audio;
   }catch(e){return null}
  }
  playbackSucceeded(audio){
   // Playback succeeded: reset this instance's retry counter.
   for(const [key,entry] of this.loops){
    if(entry.audio===audio)this.loopFailures.delete(key);
   }
  }
  playbackFailed(audio,error){
   // A rejected play() never emits 'ended'. Reclaim the occupied channel.
   // Otherwise move() is called every frame and creates Audio endlessly.
   const message=String(error?.message||error||'');
   const denied=error?.name==='NotAllowedError'||/NotAllowedError|user gesture|user activation/i.test(message);
   for(const [key,entry] of this.loops){
    if(entry.audio!==audio)continue;
    const count=Math.min(20,(this.loopFailures.get(key)?.count||0)+1);
    const wait=denied?Number.POSITIVE_INFINITY:
     Date.now()+Math.min(30000,1000*Math.pow(2,Math.min(5,count-1)));
    this.loopFailures.set(key,{source:entry.source,count,nextAt:wait,needsGesture:denied});
   }
   this.voices.delete(audio);
   for(const [key,set] of this.voiceActions){
    set.delete(audio);if(!set.size)this.voiceActions.delete(key);
   }
   for(const [key,entry] of this.loops){
    if(entry.audio===audio)this.loops.delete(key);
   }
   if(this.music===audio){this.music=null;this.musicRetry=true}
   this.stopOne(audio);
   // Avoid DOM writes at frame rate if multiple mob sounds fail.
   const now=Date.now();
   if(this.playing&&now-this.lastAudioErrorNotice>10000){
    this.lastAudioErrorNotice=now;
    this.info('🔇 Android отклонил звук: '+message.slice(0,100)+
     '. Следующая попытка будет позже или после касания.');
   }
  }
  volume(source,kind,pos){
   let attenuation=1;
   if(pos&&this.b.player?.position){
    const hero=this.b.player.position;
    const d=Math.hypot(pos.x-hero.x,pos.y-hero.y,pos.z-hero.z);
    attenuation=Math.max(0,Math.min(1,(32-d)/28));
   }
   return Math.max(0,Math.min(1,source.volume*this.state.mix.master*
    (kind==='music'?this.state.mix.music:this.state.mix.effects)*attenuation));
  }
  async previewSound(){
   this.stopPreview();const [actor]=this.slot(),v=this.draft||this.entry();
   if(!v){this.info('Выбери аудиофайл для прослушивания.');return;}
   try{
    let source=v;
    if(v.file){
     this.previewURL=URL.createObjectURL(v.file);
     source={data:this.previewURL,volume:clamp01(this.el('phoenixAudioVolume').value/100)};
    }else if(v.ref)await this.ensureURL(v);
    this.preview=this.sound({...source,volume:clamp01(this.el('phoenixAudioVolume').value/100)},
     actor==='world'?'music':'effects',null,{preview:true,loop:false});
    if(!this.preview)this.info('Не удалось проиграть звук. Проверь формат файла.');
   }catch(e){this.info('⚠ Не удалось открыть звук: '+e.message)}
  }
  stopPreview(){if(this.preview){this.stopOne(this.preview);this.preview=null}
   if(this.previewURL){URL.revokeObjectURL?.(this.previewURL);this.previewURL=null}}
  stopOne(audio){try{if(audio?.stop)audio.stop();else{audio.pause();audio.src=''}}catch(e){}}
  stopLoops(){for(const entry of this.loops.values())this.stopOne(entry.audio);this.loops.clear()}
  tryStartMusic(){
   if(!this.playing||!this.state.world||this.music)return false;
   const world=this.state.world;
   if(world.ref&&!this.urls.has(world.ref))return false;
   this.musicRetry=false;
   this.music=this.sound(world,'music',null,{loop:true});
   if(!this.music)this.musicRetry=true;
   return !!this.music;
  }
  onGameGesture(){
   if(!this.playing)return;
   // Only a real user gesture can release NotAllowedError audio retries.
   for(const [key,failure] of this.loopFailures){
    if(failure.needsGesture)this.loopFailures.set(key,{...failure,
     needsGesture:false,nextAt:Date.now()});
   }
   if(!this.music&&this.state.world)this.tryStartMusic();
  }
  pressActor(actor,event,pointerId=null){
   if(!this.playing)return;
   const key=actor+'|'+event;
   this.holds.set(key,pointerId??true);
   this.onGameGesture();
  }
  releaseActor(actor,event,pointerId=null){
   const key=actor+'|'+event;
   if(!this.holds.has(key))return;
   if(pointerId!==null&&this.holds.get(key)!==pointerId)return;
   this.holds.delete(key);
   const source=this.state.actors[actor]?.[event];
   if(source?.stopOnRelease){
    for(const voice of this.voiceActions.get(key)||[]){this.stopOne(voice);this.voices.delete(voice)}
    this.voiceActions.delete(key);
   }
  }
  startPlay(){
   this.stopPlay();this.playing=true;
   const run=this.generation;
   // Android WebView may require a gesture before the music can begin.
   // Register a retry during the next real touch; do not start duplicates.
   this.gameGesture=()=>this.onGameGesture();
   this.doc?.addEventListener?.('pointerdown',this.gameGesture,{passive:true});
   // Stability hotfix: NEVER open/deserialize sounds for *all* mobs at
   // PLAY start. Large worlds could load dozens of 16 MB clips at once.
   // Only small player sounds are prepared in PLAY.
   for(const source of Object.values(this.state.actors.player||{})){
    if(source?.ref&&source.size<=256*1024)this.ensureURL(source).then(url=>{
     if(this.playing&&this.generation===run)this.prepareTemplate(source,url);
    }).catch(()=>{});
   }
   const world=this.state.world;
   if(world)this.ensureURL(world).then(()=>{
    if(this.playing&&this.generation===run)this.tryStartMusic();
   }).catch(e=>this.info('⚠ Музыка: '+e.message));
  }
  stopPlay(){
   ++this.generation;this.playing=false;
   if(this.gameGesture)this.doc?.removeEventListener?.('pointerdown',this.gameGesture);
   this.gameGesture=null;this.musicRetry=false;
   this.holds.clear();this.voiceActions.clear();this.loopFailures.clear();
   this.stopLoops();if(this.music){this.stopOne(this.music);this.music=null}
   for(const audio of this.voices)this.stopOne(audio);this.voices.clear();
  }
  applyMix(){
   if(this.music&&this.state.world)this.music.volume=this.volume(this.state.world,'music');
   for(const entry of this.loops.values())entry.audio.volume=this.volume(entry.source,'effects',entry.pos);
   for(const [key,voices] of this.voiceActions){
    const [actor,event]=key.split('|'),source=this.state.actors[actor]?.[event];
    if(source)for(const voice of voices)voice.volume=this.volume(source,'effects');
   }
  }
  playActor(actor,event,pos=null){
   if(!this.playing)return false;
   const source=this.state.actors[actor]?.[event];if(!source)return false;
   if(this.voices.size>=14)return false;
   const key=actor+'|'+event,held=this.holds.get(key),generation=this.generation;
   if(source.ref&&!this.urls.has(source.ref)){
    // No late sound after the user lifted the finger. Unloaded clips are
    // warmed for the next press instead of firing seconds too late.
    if(Date.now()<(this.assetRetryAt.get(source.ref)||0))return false;
    this.ensureURL(source).then(url=>{
     if(!url||!this.playing||generation!==this.generation)return;
     if(source.stopOnRelease&&held===undefined)return;
     if(held!==undefined&&this.holds.get(key)!==held)return;
     this.playActor(actor,event,pos);
    }).catch(e=>this.info('⚠ Звук: '+e.message));return true;
   }
   const voice=this.sound(source,'effects',pos,{loop:false});if(!voice)return false;
   this.voices.add(voice);
   if(source.stopOnRelease){
    if(!this.voiceActions.has(key))this.voiceActions.set(key,new Set());
    this.voiceActions.get(key).add(voice);
   }
   const done=()=>{this.voices.delete(voice);this.voiceActions.get(key)?.delete(voice);
    voice.removeEventListener?.('ended',done);voice.removeEventListener?.('error',done)};
   voice.addEventListener?.('ended',done);voice.addEventListener?.('error',done);
   return true;
  }
  move(actor,event,pos=null,instance='player'){
   if(!this.playing)return;
   const key=String(instance),current=this.loops.get(key),source=this.state.actors[actor]?.[event];
   if(!source||this.volume(source,'effects',pos)<.01){
    if(current){this.stopOne(current.audio);this.loops.delete(key)}return;
   }
   if(current&&current.actor===actor&&current.event===event){
    current.pos=pos;current.audio.volume=this.volume(source,'effects',pos);return;
   }
   if(current){this.stopOne(current.audio);this.loops.delete(key)}
   // Retain cooldown even after failed voice is removed from this.loops.
   const failure=this.loopFailures.get(key);
   if(failure?.source===source&&Date.now()<failure.nextAt)return;
   if(this.loops.size>=9)return;
   if(source.ref&&!this.urls.has(source.ref)){
    if(Date.now()>=(this.assetRetryAt.get(source.ref)||0))
     this.ensureURL(source).catch(e=>this.info('⚠ Звук ходьбы: '+e.message));
    return;
   }
   const voice=this.sound(source,'effects',pos,{loop:!!source.loop});
   if(voice){
    this.loops.set(key,{audio:voice,actor,event,pos,source});
    if(!source.loop){
     const finished=()=>{
      if(this.loops.get(key)?.audio===voice)this.loops.delete(key);
      voice.removeEventListener?.('ended',finished);
      voice.removeEventListener?.('error',finished);
     };
     voice.addEventListener?.('ended',finished);
     voice.addEventListener?.('error',finished);
    }
   }
  }
  stopInstance(instance){const key=String(instance),entry=this.loops.get(key);
   if(entry){this.stopOne(entry.audio);this.loops.delete(key)}
  }
 }
 return Object.freeze({Studio,normalize,EVENTS,MAX_SOUND,MAX_MUSIC});
});
