/* Phoenix Engine Weather 1.0 — deterministic, DOM-free authored weather.
 * A world-layer setting, never a prefab, construction mesh, or game character.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWeather=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1;
 const PRESETS=Object.freeze({
  clear:Object.freeze({cloud:.13,rain:0,snow:0,fog:.02,storm:0}),
  cloudy:Object.freeze({cloud:.73,rain:0,snow:0,fog:.13,storm:0}),
  rain:Object.freeze({cloud:.88,rain:.83,snow:0,fog:.18,storm:0}),
  storm:Object.freeze({cloud:1,rain:1,snow:0,fog:.36,storm:1}),
  snow:Object.freeze({cloud:.78,rain:0,snow:.89,fog:.21,storm:0}),
  fog:Object.freeze({cloud:.38,rain:0,snow:0,fog:.94,storm:0})
 });
 const SEASONS=Object.freeze(['spring','summer','autumn','winter']);
 const MODES=Object.freeze(['manual','auto','season']);
 const QUALITIES=Object.freeze(['lite','balanced','ultra']);
 const TIME_MODES=Object.freeze(['fixed','cycle']);
 const SEASON_WEATHER=Object.freeze({
  spring:['clear','cloudy','rain','fog','rain'],
  summer:['clear','clear','cloudy','rain','storm'],
  autumn:['cloudy','rain','fog','cloudy','storm'],
  winter:['cloudy','snow','snow','fog','clear']
 });
 const defaults=()=>({
  version:VERSION,enabled:false,mode:'manual',preset:'clear',
  season:'summer',quality:'balanced',timeMode:'fixed',timeOfDay:12,
  dayLengthMinutes:20,seasonLengthDays:30,autoSeasons:false,
  intervalSeconds:150,transitionSeconds:9,intensity:.8,
  windSpeed:.35,windDirection:40,sound:false,swayTrees:true
 });
 const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function normalize(raw){
  if(raw==null)return defaults();
  if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new TypeError('Invalid weather');
  if(raw.version!==undefined&&raw.version!==VERSION)
   throw new TypeError('Unknown weather version');
  const d=defaults(),o={};
  for(const key of ['enabled','sound','swayTrees','autoSeasons']){
   const v=has(raw,key)?raw[key]:d[key];
   if(typeof v!=='boolean')throw new TypeError('Invalid weather '+key);
   o[key]=v;
  }
  for(const [name,allowed] of [['mode',MODES],['preset',Object.keys(PRESETS)],
   ['season',SEASONS],['quality',QUALITIES],['timeMode',TIME_MODES]]){
   const v=raw[name]??d[name];
   if(!allowed.includes(v))throw new TypeError('Invalid weather '+name);
   o[name]=v;
  }
  const nums={timeOfDay:[0,24],dayLengthMinutes:[1,240],
   seasonLengthDays:[1,365],intervalSeconds:[5,3600],
   transitionSeconds:[0,120],intensity:[0,1],windSpeed:[0,1],
   windDirection:[0,360]};
  for(const [name,[min,max]] of Object.entries(nums)){
   const v=raw[name]??d[name];
   if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
    throw new TypeError('Invalid weather '+name);
   o[name]=v;
  }
  return {version:VERSION,...o};
 }
 const lerp=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
 const clamp=(a,b,c)=>Math.min(c,Math.max(b,a));
 function forPreset(name,intensity=1){
  const p=PRESETS[name]||PRESETS.clear;
  return {cloud:p.cloud,rain:p.rain*intensity,snow:p.snow*intensity,
   fog:p.fog*intensity,storm:p.storm*intensity};
 }
 class Simulator{
  constructor(settings=null,seed=1337){
   this.settings=normalize(settings);
   this.seed=seed>>>0||1337;this.elapsed=0;this.clock=this.settings.timeOfDay;
   this.dayIndex=0;this.period=0;this.flash=0;this.flashDelay=7;
   this.target=this.settings.preset;this.blend=1;
   this.from=forPreset('clear',this.settings.intensity);
   this.values=forPreset(this.target,this.settings.intensity);
   this.windOffset=0;
  }
  random(){
   this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;
   return this.seed/4294967296;
  }
  pick(){
   const cfg=this.settings;
   const pool=cfg.mode==='season'?SEASON_WEATHER[this.season()]:
    ['clear','cloudy','rain','cloudy','clear','storm','fog','snow'];
   return pool[Math.floor(this.random()*pool.length)];
  }
  season(){
   const cfg=this.settings;
   if(!cfg.autoSeasons)return cfg.season;
   const idx=(SEASONS.indexOf(cfg.season)+
    Math.floor(this.dayIndex/cfg.seasonLengthDays))%4;
   return SEASONS[idx];
  }
  setSettings(config){
   const next=normalize(config);
   const same=this.settings.enabled===next.enabled&&
    this.settings.mode===next.mode&&this.settings.preset===next.preset&&
    this.settings.season===next.season&&
    this.settings.timeMode===next.timeMode;
   this.settings=next;
   if(!same){
    this.elapsed=0;this.period=0;this.target=next.preset;
    this.from={...this.values};this.blend=0;
    this.clock=next.timeOfDay;this.dayIndex=0;
   }
   return this.settings;
  }
  step(dt){
   if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)
    throw new TypeError('Invalid weather tick');
   const cfg=this.settings;
   if(!cfg.enabled){
    this.flash=0;this.values=forPreset('clear',0);
    return this.snapshot(false);
   }
   const time=Math.min(dt,120),oldClock=this.clock;
   if(cfg.timeMode==='cycle'){
    this.clock=(this.clock+time/(cfg.dayLengthMinutes*60)*24)%24;
    this.dayIndex+=Math.floor((oldClock+time/(cfg.dayLengthMinutes*60)*24)/24);
   }
   this.elapsed+=time;
   if(cfg.mode!=='manual'&&this.elapsed>=cfg.intervalSeconds){
    this.elapsed%=cfg.intervalSeconds;
    this.from={...this.values};this.target=this.pick();this.blend=0;
    this.period++;
   }else if(cfg.mode==='manual'&&this.target!==cfg.preset){
    this.from={...this.values};this.target=cfg.preset;this.blend=0;
   }
   this.blend=cfg.transitionSeconds===0?1:
    clamp(this.blend+time/cfg.transitionSeconds,0,1);
   const to=forPreset(this.target,cfg.intensity);
   const out={};
   for(const key of ['cloud','rain','snow','fog','storm'])
    out[key]=lerp(this.from[key]??0,to[key],this.blend);
   this.values=out;
   this.windOffset+=time*cfg.windSpeed;
   let struck=false;
   this.flashDelay-=time;
   if(out.storm>.25&&this.flashDelay<=0){
    this.flashDelay=3+this.random()*11/Math.max(.2,out.storm);
    this.flash=.95+this.random()*.05;struck=true;
   }
   this.flash=Math.max(0,this.flash-time*3);
   return {...this.snapshot(true),lightning:struck};
  }
  snapshot(enabled=this.settings.enabled){
   const cfg=this.settings;
   return {enabled,preset:this.target,season:this.season(),
    timeOfDay:this.clock,quality:cfg.quality,windSpeed:cfg.windSpeed,
    windDirection:cfg.windDirection,windOffset:this.windOffset,
    lightning:false,flash:this.flash,
    cloud:this.values.cloud,rain:this.values.rain,snow:this.values.snow,
    fog:this.values.fog,storm:this.values.storm};
  }
 }
 return Object.freeze({VERSION,PRESETS,SEASONS,MODES,QUALITIES,TIME_MODES,
  SEASON_WEATHER,defaults,normalize,forPreset,Simulator});
});
