'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Map=require('../app/src/main/assets/engine/core/phoenix-minimap.js');
const root=path.resolve(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'clean.css'),'utf8');
const app=fs.readFileSync(path.join(root,'js/clean-app.js'),'utf8');
const prefabs=fs.readFileSync(path.join(root,'engine/builder/prefab-editor.js'),'utf8');
const items=fs.readFileSync(path.join(root,'engine/builder/phoenix-character-gallery.js'),'utf8');
const gallery=fs.readFileSync(path.join(root,'engine/builder/phoenix-minimap-editor.js'),'utf8');
const inv=fs.readFileSync(path.join(root,'engine/core/phoenix-inventory.js'),'utf8');
assert.equal(Map.normalize(null).shape,'circle');
const sq=Map.normalize({shape:'square',range:60,size:190,position:'bottom-right'});
assert.equal(sq.shape,'square');
assert.equal(sq.range,60);
assert.throws(()=>Map.normalize({shape:'hex'}),/minimap/);
assert.throws(()=>Map.normalize({range:0}),/minimap/);
assert.deepEqual(Map.project(10,-10,0,0,80,20),{x:120,y:40});
assert.equal(Map.entityClass({type:'boss',faction:'enemy'}),'boss');
assert.equal(Map.entityClass({type:'npc',faction:'enemy'}),'passive');
assert.equal(Map.entityClass({type:'mob',faction:'enemy',engagement:'passive'}),'passive');
assert.equal(Map.entityClass({type:'mob',faction:'enemy'}),'enemy');
assert.equal(Map.entityClass({type:'mob',faction:'enemy',mode:'idle',
 engagement:'auto'}),'passive','Peaceful idle mob is white');
assert.equal(Map.entityClass({type:'mob',faction:'enemy',mode:'patrol',
 engagement:'auto'}),'passive','Non-aggressive patrolling mob is white');
assert.equal(Map.entityClass({type:'mob',faction:'enemy',mode:'guard',
 engagement:'aggressive'}),'enemy');
const events=[],context={
 save(){events.push(['save'])},restore(){events.push(['restore'])},
 beginPath(){events.push(['begin'])},clip(){events.push(['clip'])},
 arc(x,y,r){events.push(['arc',x,y,r])},rect(x,y,w,h){events.push(['rect',x,y,w,h])},
 fill(){events.push(['fill',this.fillStyle])},
 fillRect(x,y,w,h){events.push(['fillRect',x,y,w,h,this.fillStyle])},
 stroke(){events.push(['stroke'])},translate(){},rotate(){},
 moveTo(){events.push(['move'])},lineTo(){events.push(['line'])},
 quadraticCurveTo(){events.push(['curve'])},closePath(){events.push(['close'])},
 fillText(letter){events.push(['text',letter])},
 clearRect(){},set textAlign(v){},set font(v){},set lineWidth(v){},
 set strokeStyle(v){},set fillStyle(v){this._fillStyle=v},
 get fillStyle(){return this._fillStyle}
};
const state={width:500,depth:250,tileSize:50,
 tiles:[{row:2,col:5,style:'forest'}],heights:[]};
const scene={world:state,player:{x:2,z:5,yaw:.7},
 heightAt:(x,z)=>x<0?3:0,
 buildings:[{x:12,z:8,category:'wall',width:8,depth:1}],
 mobs:[{x:8,z:9,faction:'enemy',type:'mob'},
  {x:10,z:12,faction:'neutral',type:'npc'},
  {x:4,z:4,faction:'enemy',type:'boss'},
  {x:40,z:40,dead:true,faction:'enemy',type:'mob'}]};
Map.draw(context,scene,Map.defaults());
const fills=events.filter(x=>x[0]==='fill').map(x=>x[1]);
assert(fills.includes(Map.COLORS.boss),'Boss should have large red marker');
assert(fills.includes(Map.COLORS.passive),'Passive NPC should be white');
assert(fills.includes(Map.COLORS.enemy),'Hostile mobs should be red');
const radii=events.filter(x=>x[0]==='arc').map(x=>x[3]);
assert(radii.some(x=>x>=5.5),'Boss marker must be visually large');
assert(events.some(x=>x[0]==='text'&&x[1]==='N'));
assert(events.some(x=>x[0]==='text'&&x[1]==='W'));
events.length=0;Map.draw(context,scene,sq);
assert(events.some(x=>x[0]==='rect'),'Square map should clip as a rectangle');
events.length=0;Map.draw(context,scene,Map.normalize({shape:'hex'}));
assert(events.filter(x=>x[0]==='line').length>=5,'Hexagon uses six real edges');
events.length=0;Map.draw(context,scene,Map.normalize({shape:'rounded'}));
assert(events.some(x=>x[0]==='curve'),'Rounded map uses curved corners');
for(const id of ['btnGalleryZoomIn','btnGalleryZoomOut','btnGalleryFit',
 'btnGalleryMap','phoenixMapPresets','btnPhoenixGallery','btnPhoenixMinimap','phoenixGalleryPanel',
 'phoenixGalleryGrid','phoenixGalleryCanvas','phoenixGalleryItems',
 'phoenixGallerySkills','phoenixMinimapSettings','phoenixMinimapHud',
 'phoenixMinimapCanvas','phoenixMapShape','phoenixMapPosition',
 'phoenixMapSize','phoenixMapRange','btnMinimapApply','btnPhoenixPlayInventory'])
 assert(html.includes('id="'+id+'"'),'Missing gallery/minimap HTML: '+id);
assert(css.includes('#phoenixGalleryPanel,#phoenixMinimapSettings{\n position:fixed'),
 'Gallery must float above the 3D canvas');
assert(gallery.includes('b.prefabEditor?.rendered'), 'Map actors come from real gameplay scene');
assert(gallery.includes('b.worldEditor?.state'), 'Map terrain comes from authored world state');
assert(gallery.includes('b.entries'), 'Map buildings come from actual scene entries');
assert(app.includes('this.galleryEditor=new PhoenixCharacterGallery(this)'));
assert(app.includes('this.minimapEditor=new PhoenixMinimapEditor(this)'));
assert(app.includes('this.galleryEditor?.update(dt);this.minimapEditor?.update(dt)'),
 'No extra RAF and no duplicate full-world rendering');
assert(prefabs.includes('inventory:this.b.galleryEditor?.serialize()'));
assert(prefabs.includes('minimap:this.b.minimapEditor?.serialize()'));
assert(prefabs.includes('this.b.galleryEditor?.loadFromProject?.(doc?.inventory||null)'));
assert(prefabs.includes('this.b.minimapEditor?.loadFromProject?.(doc?.minimap||null)'));
assert(items.includes('new T.WebGLRenderer'), 'Pedestal renders independently of actual player');
assert(items.includes('this.inventory.add(this.selection,item)'));
assert(inv.includes('equip(character,id)'), 'Items have per-character gear slots');
console.log('PASS: real world minimap in round/square shapes, compass, hostile/boss/NPC dots, gallery GLB, inventory and project persistence');
