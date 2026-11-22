'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const Weather=require('../app/src/main/assets/engine/core/phoenix-weather.js');
const Layers=require('../app/src/main/assets/engine/core/phoenix-world-layers.js');
globalThis.PhoenixWeather=Weather;
const d=Weather.defaults();
assert.equal(d.enabled,false,'Legacy scenes must have no weather unless authored');
assert.equal(d.mode,'manual');
assert.equal(d.quality,'balanced');
assert.equal(d.swayTrees,true);
assert.deepEqual(Weather.normalize(null),d);
assert.deepEqual(Weather.normalize(JSON.parse(JSON.stringify(d))),d);
for(const raw of [{preset:'tornado'},{mode:'fake'},{quality:'100000'},
 {intensity:-1},{timeOfDay:26},{windSpeed:3},{windDirection:361},
 {dayLengthMinutes:0},{transitionSeconds:Infinity},{enabled:1},{version:99}])
 assert.throws(()=>Weather.normalize(raw),/weather/i,'Invalid weather setting must be rejected');
const storm=new Weather.Simulator({...d,enabled:true,preset:'storm',
 intensity:1,transitionSeconds:0});
let state=storm.step(.05);
assert.equal(state.preset,'storm');
assert.equal(state.rain,1);
assert.equal(state.cloud,1);
assert.equal(state.storm,1);
let lightning=false;
for(let i=0;i<10;i++){state=storm.step(1);lightning||=state.lightning;}
assert(lightning,'Lightning must visibly flash under a running thunderstorm');
assert(storm.windOffset>0,'Wind accumulates animated motion distance');
const snow=new Weather.Simulator({...d,enabled:true,preset:'snow',
 transitionSeconds:0});
state=snow.step(1);
assert.equal(state.snow,Weather.PRESETS.snow.snow*d.intensity);
assert.equal(state.rain,0);
const rain=new Weather.Simulator({...d,enabled:true,preset:'rain',
 timeOfDay:23,timeMode:'cycle',dayLengthMinutes:1,transitionSeconds:0});
rain.step(60);
assert.equal(rain.dayIndex,1);
assert(Math.abs(rain.clock-23)<.00001);
rain.setSettings({...rain.settings,mode:'season',season:'winter',
 autoSeasons:true,seasonLengthDays:1});
rain.dayIndex=0;
const winterPicks=new Set();
for(let i=0;i<18;i++)winterPicks.add(rain.pick());
assert([...winterPicks].every(p=>Weather.SEASON_WEATHER.winter.includes(p)),
 'Winter weather must only use its seasonal palette');
const manual=new Weather.Simulator({...d,enabled:true,transitionSeconds:10});
manual.step(10);
manual.setSettings({...manual.settings,preset:'fog'});
const mid=manual.step(2.5);
assert(mid.fog>0&&mid.fog<Weather.PRESETS.fog.fog*d.intensity,
 'Fog must transition gradually rather than teleport to full intensity');
manual.setSettings({...manual.settings,enabled:false});
assert.equal(manual.step(.01).enabled,false);
const authored={version:2,objects:[{kind:'glb:tree',position:[0,0,0]}],
 weather:Weather.normalize({...d,enabled:true,mode:'season',season:'winter'}),
 worldCanvas:{width:250,depth:250,tiles:[],heights:[]}};
const unchanged=JSON.stringify(authored);
const map=Layers.mapProject(authored);
assert.deepEqual(map.project.weather,authored.weather,
 'Weather must follow STATIC MAP, not the NPC or player layer');
assert.equal(map.project.phoenixGame,null);
assert.equal(JSON.stringify(authored),unchanged,'Map export must not modify existing scene');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'clean.css'),'utf8');
const app=fs.readFileSync(path.join(root,'js/clean-app.js'),'utf8');
const editorSource=fs.readFileSync(path.join(root,'engine/builder/phoenix-weather-editor.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'engine/runtime/phoenix-weather-runtime.js'),'utf8');
for(const id of ['btnPhoenixWeather','phoenixWeatherPanel','btnWeatherClose','btnWeatherSave',
 'weatherEnabled','weatherMode','weatherQuality','weatherSeason','weatherPreset',
 'weatherTimeMode','weatherTimeOfDay','weatherWindSpeed','weatherWindDirection',
 'weatherSwayTrees','weatherSound','weatherIntensity','weatherTransitionSeconds'])
 assert(html.includes('id="'+id+'"'),'Weather control missing: '+id);
for(const preset of Object.keys(Weather.PRESETS))
 assert(html.includes('id="weatherPreset_'+preset+'"'));
for(const asset of ['engine/core/phoenix-weather.js','engine/runtime/phoenix-weather-runtime.js',
 'engine/builder/phoenix-weather-editor.js'])
 assert(html.includes('src="'+asset+'"'),'Weather script must load before Builder');
assert(css.includes('#phoenixWeatherPanel{position:fixed;z-index:104;'),
 'Mobile weather menu must be visible over existing WebGL');
assert(app.includes('this.weatherEditor=new PhoenixWeatherEditor(this)'));
assert(app.includes('this.weatherEditor?.update(dt);'));
assert(app.includes('weather:this.weatherEditor?.serialize()||null'));
assert(app.includes('this.weatherEditor?.loadFromProject(doc.weather||null)'));
assert(renderer.includes('THREE')||renderer.includes('this.T'));
assert(renderer.includes('new T.Points('),'Rain and snow must use live particles');
assert(renderer.includes('new T.Sprite('),'Clouds and mist must visibly drift');
assert(renderer.includes('this.flashLight.intensity=state.flash'));
assert(renderer.includes('phoenixWindStrength'),'Tree foliage sway must be animated by shader');
assert(!editorSource.includes('this.b.save(')&&!editorSource.includes('this.b.save?.('),
 'Weather settings must not auto-save full projects');
const changed=[],elements=new Map(),types=Weather.defaults();
class Element{
 constructor(id){this.id=id;this.value='';this.checked=false;this.hidden=true;
  this.textContent='';this.listeners={};this.classList={toggle(){}};
  this.setAttribute=()=>{};}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
const document={getElementById:el};
class StubRuntime{
 constructor(){this.current=Weather.defaults();this.last=null;}
 setSettings(x){this.current=Weather.normalize(x)}
 update(dt){this.last=new Weather.Simulator(this.current).step(dt)}
}
globalThis.PhoenixWeatherRuntime=StubRuntime;
const Editor=require('../app/src/main/assets/engine/builder/phoenix-weather-editor.js');
const builder={playBridge:{active:false},markProjectDirty(){changed.push('dirty')},
 prefabEditor:{close(){}},skillDefinitionEditor:{close(){}},progressionEditor:{close(){}},
 galleryEditor:{close(){}},minimapEditor:{close(){}},worldEditor:{close(){}},
 worldLayersEditor:{close(){}},networkEditor:{close(){}}};
const editor=new Editor(builder,document);
assert.equal(editor.open(),true);
assert.equal(el('phoenixWeatherPanel').hidden,false);
el('weatherPreset_snow').listeners.click();
assert.equal(editor.runtime.current.preset,'snow');
assert.equal(editor.runtime.current.enabled,true);
assert.equal(editor.serialize().enabled,false,'Preview cannot silently write project');
assert.equal(changed.length,0,'Changing preview does not persist project');
assert.equal(editor.save(),true);
assert.equal(changed.length,1,'Only explicit save marks project dirty');
assert.equal(editor.serialize().preset,'snow');
editor.close();
assert.equal(el('phoenixWeatherPanel').hidden,true);
assert.equal(editor.runtime.current.preset,'snow');
const roundtrip=JSON.parse(JSON.stringify(editor.serialize()));
editor.loadFromProject(null);
assert.equal(editor.runtime.current.enabled,false,'Old projects load with weather off');
editor.loadFromProject(roundtrip);
assert.deepEqual(editor.serialize(),roundtrip);
console.log('PASS: dynamic weather/lighting/wind model, seasons, day/night, manual project save, map-layer roundtrip and mobile UI');
