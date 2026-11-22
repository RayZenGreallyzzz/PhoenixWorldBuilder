/* Phoenix Weather Editor — touch-friendly no-code weather, one shared scene.
 * Preview is temporary; only Save Weather marks the project dirty.
 */
(function(root,factory){
 'use strict';const Editor=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=Editor;
 if(root)root.PhoenixWeatherEditor=Editor;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PRESET_NAMES={
  clear:'☀️ Ясно',cloudy:'☁️ Облака',rain:'🌧️ Дождь',
  storm:'⛈️ Гроза',snow:'❄️ Снег',fog:'🌫️ Туман'
 };
 const SEASON_NAMES={spring:'🌸 Весна',summer:'☀️ Лето',
  autumn:'🍁 Осень',winter:'❄️ Зима'};
 class Editor{
  constructor(builder,doc){
   this.b=builder;this.doc=doc||document;
   this.panel=this.el('phoenixWeatherPanel');
   this.settings=PhoenixWeather.defaults();
   this.runtime=new PhoenixWeatherRuntime(builder,globalThis.THREE);
   this.statusCount=0;this.audio=null;
   this.runtime.onLightning=state=>this.lightning(state);
   this.bind();this.writeForm(this.settings);
  }
  el(id){return this.doc.getElementById(id)}
  info(value){const el=this.el('phoenixWeatherStatus');if(el)el.textContent=value}
  bind(){
   this.el('btnPhoenixWeather')?.addEventListener('click',()=>this.toggle());
   this.el('btnWeatherClose')?.addEventListener('click',()=>this.close());
   this.el('btnWeatherSave')?.addEventListener('click',()=>this.save());
   this.el('btnWeatherReset')?.addEventListener('click',()=>{
    this.writeForm(PhoenixWeather.defaults());this.preview();
   });
   for(const preset of Object.keys(PhoenixWeather.PRESETS)){
    const button=this.el('weatherPreset_'+preset);
    button?.addEventListener('click',()=>{
     this.el('weatherMode').value='manual';
     this.el('weatherPreset').value=preset;
     this.el('weatherEnabled').checked=true;
     this.preview();
    });
   }
   const fields=['weatherEnabled','weatherMode','weatherPreset','weatherSeason',
    'weatherQuality','weatherTimeMode','weatherTimeOfDay',
    'weatherDayLengthMinutes','weatherSeasonLengthDays','weatherAutoSeasons',
    'weatherIntervalSeconds','weatherTransitionSeconds','weatherIntensity',
    'weatherWindSpeed','weatherWindDirection','weatherSound','weatherSwayTrees'];
   for(const id of fields){
    const el=this.el(id);
    el?.addEventListener('input',()=>this.preview());
    el?.addEventListener('change',()=>{
     if(id==='weatherSound'&&el.checked)this.unlockSound();
     this.preview();
    });
   }
  }
  writeForm(raw){
   const p=PhoenixWeather.normalize(raw);
   for(const key of Object.keys(p)){
    if(key==='version')continue;
    const node=this.el('weather'+key[0].toUpperCase()+key.slice(1));
    if(!node)continue;
    if(typeof p[key]==='boolean')node.checked=p[key];
    else node.value=String(p[key]);
   }
   this.updateButtons(p);
   return p;
  }
  readForm(){
   const raw={version:1},fields=PhoenixWeather.defaults();
   for(const [key,val] of Object.entries(fields)){
    if(key==='version')continue;
    const node=this.el('weather'+key[0].toUpperCase()+key.slice(1));
    if(!node){raw[key]=val;continue}
    raw[key]=typeof val==='boolean'?!!node.checked:
     typeof val==='number'?Number(node.value):node.value;
   }
   return PhoenixWeather.normalize(raw);
  }
  updateButtons(cfg){
   for(const preset of Object.keys(PhoenixWeather.PRESETS)){
    const btn=this.el('weatherPreset_'+preset);
    if(!btn)continue;
    const selected=cfg.preset===preset&&cfg.mode==='manual';
    btn.classList?.toggle?.('selected',selected);
    btn.setAttribute?.('aria-pressed',selected?'true':'false');
   }
   const lamp=this.el('weatherLightState');
   if(lamp)lamp.textContent=cfg.enabled?'🌦 Эффекты включены':'☀️ Погода выключена';
  }
  preview(){
   if(this.b.playBridge?.active)return false;
   try{
    const next=this.readForm();
    this.runtime.setSettings(next);this.updateButtons(next);
    this.info('👁 Предпросмотр: '+(PRESET_NAMES[next.preset]||next.preset)+
     ' · '+(SEASON_NAMES[next.season]||next.season)+
     ' · качество '+next.quality+
     '. Для записи в проект нажми «💾 Сохранить погоду».');
    return true;
   }catch(error){this.info('⚠ '+error.message);return false}
  }
  open(){
   if(this.b.playBridge?.active)return false;
   this.b.prefabEditor?.close?.();
   this.b.skillDefinitionEditor?.close?.();
   this.b.progressionEditor?.close?.();
   this.b.galleryEditor?.close?.();
   this.b.minimapEditor?.close?.();
   this.b.worldEditor?.close?.();
   this.b.worldLayersEditor?.close?.();
   this.b.networkEditor?.close?.();
   if(this.panel)this.panel.hidden=false;
   this.writeForm(this.settings);
   this.info('🌦 Выбирай погоду, время суток и сезон. Изменения до сохранения — только предпросмотр.');
   return true;
  }
  close(){
   if(this.panel)this.panel.hidden=true;
   this.runtime.setSettings(this.settings);
   return true;
  }
  toggle(){return this.panel?.hidden?this.open():this.close()}
  save(){
   if(this.b.playBridge?.active)return false;
   try{
    this.settings=this.readForm();
    this.runtime.setSettings(this.settings);
    this.b.markProjectDirty?.();
    this.info('✅ Погода добавлена к сцене. Нажми верхнюю 💾 Сохранить проект. '+
     'Настройки также войдут в «🗺 Сохранить карту».');
    return true;
   }catch(error){this.info('⚠ '+error.message);return false}
  }
  loadFromProject(raw){
   try{this.settings=PhoenixWeather.normalize(raw)}
   catch(error){
    this.settings=PhoenixWeather.defaults();
    console.warn('Weather project data invalid; using disabled clear sky',error);
   }
   this.writeForm(this.settings);
   this.runtime.setSettings(this.settings);
  }
  serialize(){return PhoenixWeather.normalize(this.settings)}
  update(dt){
   this.runtime.update(dt);
   this.statusCount+=Number.isFinite(dt)?dt:0;
   if(this.panel?.hidden||this.statusCount<.65)return;
   this.statusCount=0;
   const state=this.runtime.last;
   if(!state||!state.enabled)return;
   const readout=this.el('weatherLiveReadout');
   if(!readout)return;
   const hh=Math.floor(state.timeOfDay),mm=Math.floor((state.timeOfDay%1)*60);
   readout.textContent='🌤 '+(PRESET_NAMES[state.preset]||state.preset)+
    ' · '+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+
    ' · ☁️ '+Math.round(state.cloud*100)+'%'+
    ' · 🌧️ '+Math.round(state.rain*100)+'%'+
    ' · ❄️ '+Math.round(state.snow*100)+'%'+
    ' · 🌫 '+Math.round(state.fog*100)+'%';
  }
  unlockSound(){
   if(!this.el('weatherSound')?.checked)return;
   try{
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)return;
    this.audio=this.audio||new Audio();
    this.audio.resume?.();
   }catch(error){console.warn('Thunder audio unavailable',error)}
  }
  lightning(state){
   if(!this.settings.sound||!this.audio||this.audio.state!=='running')return;
   try{
    // Short filtered noise burst. Created only on lightning events; no
    // microphone permissions, external sounds, network or background audio.
    const audio=this.audio,n=Math.floor(audio.sampleRate*.8);
    const buffer=audio.createBuffer(1,n,audio.sampleRate);
    const pcm=buffer.getChannelData(0);
    for(let i=0;i<n;i++)pcm[i]=(Math.random()*2-1);
    const source=audio.createBufferSource();source.buffer=buffer;
    const filter=audio.createBiquadFilter();filter.type='lowpass';
    filter.frequency.value=180+state.storm*210;
    const gain=audio.createGain();
    const when=audio.currentTime+.28;
    gain.gain.setValueAtTime(.0001,when);
    gain.gain.exponentialRampToValueAtTime(.075,when+.06);
    gain.gain.exponentialRampToValueAtTime(.0001,when+.75);
    source.connect(filter);filter.connect(gain);gain.connect(audio.destination);
    source.start(when);source.stop(when+.8);
   }catch(error){console.warn('Thunder playback unavailable',error)}
  }
 }
 return Editor;
});
