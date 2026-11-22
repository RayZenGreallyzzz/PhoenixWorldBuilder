'use strict';
const assert=require('node:assert/strict');
const Inventory=require('../app/src/main/assets/engine/core/phoenix-inventory.js');
globalThis.PhoenixInventory=Inventory;
const Gallery=require('../app/src/main/assets/engine/builder/phoenix-character-gallery.js');
const Prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
class Element{
 constructor(id=''){this.id=id;this.value='';this.textContent='';
  this.hidden=true;this.children=[];this.options=this.children;
  this.style={};this.dataset={};this.listeners={};
  this.classList={add(){},remove(){}};}
 appendChild(child){this.children.push(child);this.options=this.children;return child;}
 replaceChildren(...items){this.children=[...items];this.options=this.children;}
 addEventListener(event,fn){this.listeners[event]=fn;}
}
const ids=['phoenixGalleryPanel','btnPhoenixGallery','btnGalleryClose',
 'btnGalleryRefresh','btnGalleryViewHero','btnGallerySkills','btnGalleryProgression',
 'btnGalleryPrefab','btnGalleryAddItem','btnGalleryCreate',
 'btnPhoenixPlayInventory','phoenixGalleryGrid','phoenixGalleryCanvas',
 'phoenixGalleryName','phoenixGalleryStats','phoenixGalleryItems',
 'phoenixGallerySkills','phoenixGalleryGearStats','phoenixGalleryInfo',
 'phoenixGalleryItemEditor','phoenixGalleryEditingTools',
 'phoenixGalleryCreate','phoenixGalleryModelSearch','phoenixGalleryModelSelect',
 'phoenixGalleryCreateName','phoenixGalleryCreateType','phoenixGalleryItemName',
 'phoenixGalleryItemKind','phoenixGalleryItemSlot','phoenixGalleryItemGlb',
 'phoenixGalleryItemDamage','phoenixGalleryItemDefense','phoenixGalleryItemHp',
 'phoenixGalleryItemMp','phoenixGalleryItemMagicPower','phoenixGalleryItemMagicDefense',
 'phoenixGalleryItemSpeed'];
const el=new Map(ids.map(id=>[id,new Element(id)]));
el.get('phoenixGalleryPanel').hidden=true;
const doc={getElementById:id=>el.get(id)||null,createElement:type=>new Element(type)};
const prefabs=new Prefabs.PhoenixPrefabCatalog();
let dirty=0,selected=null;
const builder={
 avatarAssetId:'glb:player',avatarFileName:'Player.glb',
 avatarClips:[],playBridge:{active:false},
 catalogMeta:new Map([['glb:mage',{name:'Mage Character'}],
  ['glb:dragon',{name:'Dragon Boss'}]]),assets:new Map(),
 skillEditor:{close(){}},skillDefinitionEditor:{close(){},refreshCharacters(){},
  catalog:{entries:()=>({})}},
 progressionEditor:{close(){},refreshTargets(){},playerStats(){return null}},
 prefabEditor:{registry:prefabs,close(){},refresh(){},calculatedStats(id,p){return p.stats}},
 worldEditor:{close(){}},markProjectDirty(){dirty++}
};
const gallery=new Gallery(builder,doc);
builder.galleryEditor=gallery;
assert.equal(gallery.open(),true);
assert.equal(el.get('phoenixGalleryPanel').hidden,false);
assert.equal(el.get('phoenixGalleryGrid').children.length,1,'Player character card must exist');
el.get('phoenixGalleryModelSearch').value='mage';
gallery.renderModelSearch();
assert(el.get('phoenixGalleryModelSelect').options.some(o=>o.value==='glb:mage'));
el.get('phoenixGalleryModelSelect').value='glb:mage';
el.get('phoenixGalleryCreateName').value='Огненный маг';
el.get('phoenixGalleryCreateType').value='hero';
const hero=gallery.createCharacter();
assert.equal(hero,'prefab-1');
assert.equal(prefabs.get(hero).type,'hero');
assert.equal(prefabs.get(hero).assetId,'glb:mage');
assert.equal(gallery.selection,hero);
assert.equal(el.get('phoenixGalleryGrid').children.length,2);
el.get('phoenixGalleryItemName').value='Огненный посох';
el.get('phoenixGalleryItemKind').value='weapon';
el.get('phoenixGalleryItemSlot').value='weapon';
el.get('phoenixGalleryItemGlb').value='';
el.get('phoenixGalleryItemDamage').value='8';
el.get('phoenixGalleryItemDefense').value='0';
el.get('phoenixGalleryItemHp').value='30';
el.get('phoenixGalleryItemMp').value='50';
el.get('phoenixGalleryItemMagicPower').value='75';
el.get('phoenixGalleryItemMagicDefense').value='12';
el.get('phoenixGalleryItemSpeed').value='1.2';
assert.equal(gallery.addItem(),true);
const gear=gallery.inventory.state(hero).items[0];
assert.equal(gear.stats.magicPower,75);
assert.equal(gear.stats.speed,1.2);
gallery.inventory.equip(hero,gear.id);
assert.equal(gallery.inventory.bonuses(hero).hp,30);
assert.equal(gallery.inventory.bonuses(hero).mp,50);
assert.equal(gallery.inventory.bonuses(hero).magicPower,75);
gallery.select('player');
assert.equal(gallery.inventory.state('player').items.length,0,
 'Separate hero should keep separate inventory');
el.get('phoenixGalleryModelSearch').value='dragon';
gallery.renderModelSearch();
el.get('phoenixGalleryModelSelect').value='glb:dragon';
el.get('phoenixGalleryCreateName').value='Дракон';
el.get('phoenixGalleryCreateType').value='boss';
const boss=gallery.createCharacter();
assert.equal(prefabs.get(boss).type,'boss');
assert.equal(prefabs.get(boss).faction,'enemy');
assert.equal(gallery.inventory.state(boss).items.length,0);
const saved=JSON.parse(JSON.stringify(gallery.serialize()));
const other=new Gallery(builder,doc);
other.loadFromProject(saved);
assert.deepEqual(other.serialize(),saved);
assert.equal(other.inventory.bonuses(hero).magicPower,75);
other.close();assert.equal(el.get('phoenixGalleryPanel').hidden,true);
assert(dirty>=3,'Creating gallery prefabs and item should mark Builder world as unsaved');
console.log('PASS: create hero and boss cards from library GLBs; touch-select miniature, isolated inventory, magic bonuses and JSON persistence');
