/* Phoenix Engine 0.7: pure JSON-configurable touch skill HUD layout.
 * No document, WebGL, platform or localStorage dependency in the schema.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkillLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1;
 const IDS=Object.freeze(['attack','heal','slot3','slot4']);
 const defaults=[
  {id:'attack',icon:'⚔',label:'АТАКА',x:89,y:83,size:82,
   color:'#a63929',opacity:1,shape:'circle',enabled:true},
  {id:'heal',icon:'💚',label:'ЛЕЧЕНИЕ',x:76,y:86,size:68,
   color:'#17805b',opacity:1,shape:'circle',enabled:true},
  {id:'slot3',icon:'✨',label:'СКИЛЛ 3',x:77,y:69,size:62,
   color:'#524ca2',opacity:.9,shape:'rounded',enabled:false},
  {id:'slot4',icon:'🛡',label:'СКИЛЛ 4',x:89,y:65,size:62,
   color:'#345e93',opacity:.9,shape:'rounded',enabled:false}
 ];
 const copy=v=>JSON.parse(JSON.stringify(v));
 function validNumber(n,min,max,name){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)
   throw new TypeError('Invalid '+name);
  return n;
 }
 function validateSlot(slot,id){
  if(!slot||typeof slot!=='object'||Array.isArray(slot)||slot.id!==id)
   throw new TypeError('Invalid skill slot '+id);
  if(typeof slot.icon!=='string'||!slot.icon.trim()||[...slot.icon].length>8)
   throw new TypeError('Invalid skill icon '+id);
  if(typeof slot.label!=='string'||!slot.label.trim()||
    [...slot.label].length>16)throw new TypeError('Invalid skill label '+id);
  if(!/^#[0-9a-fA-F]{6}$/.test(slot.color))
   throw new TypeError('Invalid skill color '+id);
  if(slot.shape!=='circle'&&slot.shape!=='rounded')
   throw new TypeError('Invalid skill shape '+id);
  if(typeof slot.enabled!=='boolean')
   throw new TypeError('Invalid enabled flag '+id);
  return {
   id,icon:slot.icon.trim(),label:slot.label.trim(),
   x:validNumber(slot.x,5,95,'x'),y:validNumber(slot.y,8,95,'y'),
   size:validNumber(slot.size,48,120,'size'),
   color:slot.color,opacity:validNumber(slot.opacity,.45,1,'opacity'),
   shape:slot.shape,enabled:slot.enabled
  };
 }
 function validate(snapshot){
  if(!snapshot||snapshot.version!==VERSION||!Array.isArray(snapshot.slots)||
     snapshot.slots.length!==IDS.length)
   throw new TypeError('Invalid Phoenix Skill HUD layout');
  const ids=new Set();
  for(const slot of snapshot.slots){
   if(!IDS.includes(slot?.id)||ids.has(slot.id))
    throw new TypeError('Invalid or duplicate skill slot');
   ids.add(slot.id);
  }
  return {version:VERSION,slots:IDS.map(id=>
   validateSlot(snapshot.slots.find(s=>s.id===id),id))};
 }
 function defaultLayout(){return copy({version:VERSION,slots:defaults});}
 function update(layout,id,changes){
  if(!IDS.includes(id))throw new TypeError('Unknown skill slot');
  const base=validate(layout);
  base.slots=base.slots.map(s=>s.id===id?validateSlot({...s,...changes},id):s);
  return base;
 }
 return Object.freeze({VERSION,IDS,defaultLayout,validate,update});
});
