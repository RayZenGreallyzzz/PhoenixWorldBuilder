/* Phoenix Engine 2.1 inventory core: authored items/equipment per character.
 * No dependence on GLB, DOM, renderer, server or application preferences.
 * Store is part of project JSON; future server saves use an independent snapshot.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixInventory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,MAX_ITEMS=80,MAX_CHARACTERS=301;
 const SLOTS=Object.freeze(['weapon','offhand','head','chest','legs','feet','ring','amulet']);
 const KINDS=Object.freeze(['weapon','armor','accessory','consumable','material']);
 const STAT_KEYS=Object.freeze(['damage','defense','hp','mp','magicPower','magicDefense','speed']);
 const VALID_ID=/^(player|prefab-[1-9]\d*)$/;
 const ITEM_ID=/^item-[1-9]\d*$/;
 const copy=v=>JSON.parse(JSON.stringify(v));
 function num(v,min,max,name){
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
   throw new TypeError('Invalid item '+name);
  return v;
 }
 function item(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new TypeError('Invalid inventory item');
  const name=String(raw.name||'').trim();
  if(!name||name.length>80||/[<>\x00-\x1f]/.test(name))
   throw new TypeError('Invalid item name');
  const kind=raw.kind||'material';
  if(!KINDS.includes(kind))throw new TypeError('Invalid item kind');
  const slot=raw.slot||'';
  if(slot&&!SLOTS.includes(slot))throw new TypeError('Invalid equipment slot');
  const assetId=raw.assetId||'';
  if(typeof assetId!=='string'||assetId.length>160||
    (assetId&&!assetId.startsWith('glb:')))
   throw new TypeError('Invalid equipment GLB ID');
  const stats={};
  for(const key of STAT_KEYS)stats[key]=num(raw.stats?.[key]??0,0,
   key==='speed'?25:1000000,key);
  return {name,kind,slot,assetId,stats};
 }
 function validateRows(rows){
  if(!rows||typeof rows!=='object'||Array.isArray(rows))
   throw new TypeError('Invalid inventory state');
  if(!Number.isSafeInteger(rows.nextId)||rows.nextId<0||rows.nextId>1000000||
     !Array.isArray(rows.items)||rows.items.length>MAX_ITEMS)
   throw new TypeError('Invalid inventory item list');
  const used=new Set(),items=[];
  for(const raw of rows.items){
   if(!raw||!ITEM_ID.test(raw.id)||Number(raw.id.slice(5))>rows.nextId||
      used.has(raw.id))throw new TypeError('Invalid item ID');
   used.add(raw.id);items.push({id:raw.id,...item(raw)});
  }
  const rawGear=rows.equipped||{};
  if(!rawGear||typeof rawGear!=='object'||Array.isArray(rawGear)||
     Object.keys(rawGear).some(k=>!SLOTS.includes(k)))
   throw new TypeError('Invalid equipment list');
  const equipped={};const itemIds=new Set();
  for(const [slot,id] of Object.entries(rawGear)){
   const target=items.find(i=>i.id===id);
   if(!target||target.slot!==slot||itemIds.has(id))
    throw new TypeError('Invalid equipped item');
   equipped[slot]=id;itemIds.add(id);
  }
  return {nextId:rows.nextId,items,equipped};
 }
 class Store{
  constructor(){this.characters=new Map();}
  charactersList(){return [...this.characters.keys()];}
  state(character){
   if(!VALID_ID.test(character))throw new TypeError('Invalid character ID');
   if(!this.characters.has(character))return {nextId:0,items:[],equipped:{}};
   return copy(this.characters.get(character));
  }
  put(character,rows){
   if(!VALID_ID.test(character))throw new TypeError('Invalid character ID');
   if(!this.characters.has(character)&&this.characters.size>=MAX_CHARACTERS)
    throw new RangeError('Too many character inventories');
   this.characters.set(character,validateRows(rows));
   return this.state(character);
  }
  add(character,data){
   const rows=this.state(character);
   if(rows.items.length>=MAX_ITEMS)throw new RangeError('Inventory full');
   const id='item-'+(++rows.nextId);
   rows.items.push({id,...item(data)});
   this.put(character,rows);return id;
  }
  equip(character,id){
   const rows=this.state(character),found=rows.items.find(x=>x.id===id);
   if(!found||!found.slot)throw new TypeError('Item cannot be equipped');
   rows.equipped[found.slot]=id;
   this.put(character,rows);return this.state(character).equipped;
  }
  unequip(character,slot){
   if(!SLOTS.includes(slot))throw new TypeError('Invalid equipment slot');
   const rows=this.state(character);delete rows.equipped[slot];
   this.put(character,rows);return true;
  }
  remove(character,id){
   const rows=this.state(character);
   const len=rows.items.length;
   rows.items=rows.items.filter(x=>x.id!==id);
   if(rows.items.length===len)return false;
   for(const slot of SLOTS)
    if(rows.equipped[slot]===id)delete rows.equipped[slot];
   this.put(character,rows);return true;
  }
  removeCharacter(character){return this.characters.delete(character);}
  equipped(character){
   const state=this.state(character);
   return Object.fromEntries(Object.entries(state.equipped).map(([slot,id])=>[
    slot,state.items.find(item=>item.id===id)
   ]).filter(([,item])=>item));
  }
  bonuses(character){
   const out=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
   for(const item of Object.values(this.equipped(character)))
    for(const k of STAT_KEYS)out[k]+=item.stats[k];
   return out;
  }
  serialize(){return {version:VERSION,characters:[...this.characters.entries()]
   .map(([id,data])=>({id,...copy(data)}))};}
  load(raw){
   if(raw==null){this.characters.clear();return;}
   if(!raw||raw.version!==VERSION||!Array.isArray(raw.characters)||
      raw.characters.length>MAX_CHARACTERS)
    throw new TypeError('Invalid inventory save');
   const next=new Store();
   for(const row of raw.characters){
    if(!row||!VALID_ID.test(row.id)||next.characters.has(row.id))
     throw new TypeError('Invalid inventory character');
    next.put(row.id,{nextId:row.nextId,items:row.items,equipped:row.equipped});
   }
   this.characters=next.characters;
  }
 }
 return Object.freeze({VERSION,MAX_ITEMS,MAX_CHARACTERS,SLOTS,KINDS,
  STAT_KEYS,item,Store});
});
