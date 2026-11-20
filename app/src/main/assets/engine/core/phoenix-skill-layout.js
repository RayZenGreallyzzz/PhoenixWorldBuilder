/* Phoenix Engine 0.9 — portable MOBA, MMO and Shooter HUD layouts.
 * v1 (four-slot) / v2 (six-slot) migrate to v3 without losing authored positions.
 * No rendering, DOM or platform dependencies.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkillLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=3,LEGACY_VERSION=1;
 const IDS=Object.freeze(['attack','heal','slot3','slot4','slot5','ultimate',
  'slot6','slot7','fire','aim','reload','jump','crouch']);
 const base=[
  {id:'attack',icon:'⚔',label:'АТАКА',x:89,y:83,size:82,color:'#a63929',opacity:1,shape:'circle',enabled:true},
  {id:'heal',icon:'💚',label:'ЛЕЧЕНИЕ',x:76,y:86,size:68,color:'#17805b',opacity:1,shape:'circle',enabled:true},
  {id:'slot3',icon:'✨',label:'УМЕНИЕ 1',x:77,y:69,size:62,color:'#524ca2',opacity:.9,shape:'circle',enabled:false},
  {id:'slot4',icon:'🌀',label:'УМЕНИЕ 2',x:89,y:65,size:62,color:'#345e93',opacity:.9,shape:'circle',enabled:false},
  {id:'slot5',icon:'🌟',label:'УМЕНИЕ 3',x:90,y:54,size:62,color:'#6954a2',opacity:.9,shape:'circle',enabled:false},
  {id:'ultimate',icon:'🔥',label:'УЛЬТА',x:94,y:50,size:70,color:'#986322',opacity:1,shape:'circle',enabled:false},
  {id:'slot6',icon:'💠',label:'СКИЛЛ 6',x:75,y:57,size:56,color:'#315f8c',opacity:.95,shape:'rounded',enabled:false},
  {id:'slot7',icon:'🌙',label:'СКИЛЛ 7',x:66,y:57,size:56,color:'#5b4a91',opacity:.95,shape:'rounded',enabled:false},
  {id:'fire',icon:'🔫',label:'ОГОНЬ',x:89,y:82,size:90,color:'#a73626',opacity:1,shape:'circle',enabled:false},
  {id:'aim',icon:'🎯',label:'ПРИЦЕЛ',x:76,y:76,size:64,color:'#40566b',opacity:1,shape:'circle',enabled:false},
  {id:'reload',icon:'🔄',label:'ПЕРЕЗАРЯД',x:89,y:64,size:58,color:'#4c7390',opacity:1,shape:'circle',enabled:false},
  {id:'jump',icon:'⬆️',label:'ПРЫЖОК',x:75,y:61,size:58,color:'#478567',opacity:1,shape:'circle',enabled:false},
  {id:'crouch',icon:'🧎',label:'ПРИСЕСТЬ',x:76,y:91,size:52,color:'#526c6d',opacity:1,shape:'circle',enabled:false}
 ];
 const copy=value=>JSON.parse(JSON.stringify(value));
 const style=(id,changes)=>({...base.find(item=>item.id===id),...changes});
 const extend=()=>IDS.slice(6).map(id=>style(id,{}));
 const configure=changes=>IDS.map(id=>style(id,changes[id]||{}));
 function presetLayout(preset='mobile-legends'){
  const presets={
   'classic':base.map(copy),
   'mobile-legends':[
    style('attack',{x:90,y:84,size:86}),
    style('heal',{x:69,y:89,size:52}),
    style('slot3',{x:76,y:77,size:64,label:'СКИЛЛ 1',enabled:true}),
    style('slot4',{x:83,y:67,size:64,label:'СКИЛЛ 2',enabled:true}),
    style('slot5',{x:90,y:64,size:64,label:'СКИЛЛ 3',enabled:false}),
    style('ultimate',{x:82,y:54,size:72,enabled:true}),
    ...extend()
   ],
   'wild-rift':[
    style('attack',{x:90,y:84,size:82}),
    style('heal',{x:70,y:91,size:50}),
    style('slot3',{x:76,y:77,size:60,label:'Q',enabled:true}),
    style('slot4',{x:83,y:69,size:60,label:'W',enabled:true}),
    style('slot5',{x:90,y:65,size:60,label:'E',enabled:true}),
    style('ultimate',{x:82,y:54,size:70,label:'R · УЛЬТА',enabled:true}),
    ...extend()
   ],
   'mmorpg':configure({
    attack:{x:91,y:85,size:68,label:'АТАКА'},
    heal:{x:58,y:87,size:54,label:'ХИЛ'},
    slot3:{x:65,y:78,size:56,label:'НАВЫК 1',enabled:true},
    slot4:{x:71,y:78,size:56,label:'НАВЫК 2',enabled:true},
    slot5:{x:77,y:78,size:56,label:'НАВЫК 3',enabled:true},
    slot6:{x:83,y:78,size:56,label:'НАВЫК 4',enabled:true},
    slot7:{x:89,y:68,size:56,label:'НАВЫК 5',enabled:true},
    ultimate:{x:83,y:59,size:70,label:'УЛЬТА',enabled:true}
   }),
   'shooter':configure({
    attack:{x:67,y:88,size:52,label:'БЛИЖНИЙ БОЙ'},
    heal:{x:61,y:70,size:50,label:'АПТЕЧКА'},
    fire:{x:89,y:83,size:90,label:'ОГОНЬ',enabled:true},
    aim:{x:76,y:76,size:64,label:'ПРИЦЕЛ',enabled:true},
    reload:{x:89,y:64,size:58,label:'ПЕРЕЗАРЯД',enabled:true},
    jump:{x:75,y:61,size:58,label:'ПРЫЖОК',enabled:true},
    crouch:{x:76,y:91,size:52,label:'ПРИСЕСТЬ',enabled:true}
   })
  };
  if(!Object.prototype.hasOwnProperty.call(presets,preset))
   throw new TypeError('Unknown skill HUD preset: '+preset);
  return {version:VERSION,slots:copy(presets[preset])};
 }
 function number(n,min,max,label){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)
   throw new TypeError('Invalid '+label);
  return n;
 }
 function validateSlot(slot,id){
  if(!slot||typeof slot!=='object'||Array.isArray(slot)||slot.id!==id)
   throw new TypeError('Invalid skill slot '+id);
  if(typeof slot.icon!=='string'||!slot.icon.trim()||[...slot.icon].length>8)
   throw new TypeError('Invalid skill icon '+id);
  if(typeof slot.label!=='string'||!slot.label.trim()||[...slot.label].length>16)
   throw new TypeError('Invalid skill label '+id);
  if(!/^#[0-9a-fA-F]{6}$/.test(slot.color))
   throw new TypeError('Invalid skill color '+id);
  if(slot.shape!=='circle'&&slot.shape!=='rounded')
   throw new TypeError('Invalid skill shape '+id);
  if(typeof slot.enabled!=='boolean')throw new TypeError('Invalid enabled flag '+id);
  return {id,icon:slot.icon.trim(),label:slot.label.trim(),
   x:number(slot.x,5,95,'x'),y:number(slot.y,8,95,'y'),
   size:number(slot.size,48,120,'size'),color:slot.color,
   opacity:number(slot.opacity,.45,1,'opacity'),shape:slot.shape,
   enabled:slot.enabled};
 }
 function validate(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.slots))
   throw new TypeError('Invalid Phoenix Skill HUD layout');
  const legacy=raw.version===LEGACY_VERSION||raw.version===2;
  if(!legacy&&raw.version!==VERSION)throw new TypeError('Invalid Phoenix Skill HUD layout');
  const required=raw.version===LEGACY_VERSION?IDS.slice(0,4):
   raw.version===2?IDS.slice(0,6):IDS;
  if(raw.slots.length!==required.length)throw new TypeError('Invalid Phoenix Skill HUD layout');
  const found=new Map();
  for(const slot of raw.slots){
   if(!slot||!required.includes(slot.id)||found.has(slot.id))
    throw new TypeError('Invalid or duplicate skill slot');
   found.set(slot.id,validateSlot(slot,slot.id));
  }
  if(required.some(id=>!found.has(id)))throw new TypeError('Missing skill slot');
  if(legacy)for(const id of IDS)
   if(!found.has(id))found.set(id,validateSlot(base.find(s=>s.id===id),id));
  return {version:VERSION,slots:IDS.map(id=>found.get(id))};
 }
 function defaultLayout(){return presetLayout('mobile-legends');}
 function update(layout,id,changes){
  if(!IDS.includes(id))throw new TypeError('Unknown skill slot');
  const safe=validate(layout);
  safe.slots=safe.slots.map(s=>s.id===id?validateSlot({...s,...changes},id):s);
  return safe;
 }
 return Object.freeze({VERSION,LEGACY_VERSION,IDS,presetLayout,defaultLayout,validate,update});
});
