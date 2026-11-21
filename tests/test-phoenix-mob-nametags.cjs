'use strict';
const assert=require('node:assert/strict');
const T=require('../app/src/main/assets/js/three.min.js');
const Core=require('../app/src/main/assets/engine/core/phoenix-core.js');
const Bridge=require('../app/src/main/assets/engine/builder/play-bridge.js');
global.THREE=T;
global.AvatarFit=require('../app/src/main/assets/js/avatar-fit.js');
const draws=[];
const ctx={
 clearRect(){draws.push('clear')},
 fillRect(){throw Error('Nickname must have no solid background')},
 strokeRect(){throw Error('Nickname must have no border')},
 strokeText(name){draws.push('stroke:'+name)},
 fillText(name){draws.push('text:'+name+':'+this.fillStyle)}
};
const el={hidden:false,addEventListener(){}};
const doc={
 getElementById:id=>['btnPhoenixPlay','btnPhoenixEdit','phoenixPlayHud'].includes(id)?el:null,
 createElement:tag=>{assert.equal(tag,'canvas');return {width:512,height:128,getContext:()=>ctx}}
};
const root=new T.Group(),visual=new T.Group();
visual.add(new T.Mesh(new T.BoxGeometry(.8,2,.8),new T.MeshBasicMaterial()));
visual.position.y=1.05;
root.add(visual);root.position.set(0,7,0);root.updateMatrixWorld(true);
let dead=false;
const rendered=new Map([['entity-1',{root,visual}]]);
const builder={player:{position:new T.Vector3(999,7,999)},prefabEditor:{
 rendered,mobProfile:()=>({name:'Асура',nameColor:'#e344ff'}),
 combat:{isDead:()=>dead}
}};
const bridge=new Bridge(builder,Core,doc);
bridge.active=true;
bridge.createMobTags();
const tag=bridge.mobTags.get('entity-1');
assert(tag,'Mob nickname sprite must exist');
assert.equal(tag.visible,true,'Nickname must never disappear because of distance');
assert(tag.position.y>2,'Nickname must be anchored above visible GLB head');
assert(draws.includes('text:Асура:#e344ff'),'Custom color must be used as actual font fill');
assert(draws.includes('stroke:Асура'),'Readable shadow outline without a panel');
assert.equal(tag.material.depthTest,false,'Terrain must not hide nicknames');
dead=true;bridge.refreshMobTags();
assert.equal(tag.visible,false,'Dead mob name may be hidden');
dead=false;root.visible=false;bridge.refreshMobTags();
assert.equal(tag.visible,false,'Hidden model should not retain floating name');
root.visible=true;bridge.refreshMobTags();
assert.equal(tag.visible,true,'Revived mob name must return');
bridge.clearMobTags();
assert.equal(bridge.mobTags.size,0);
assert.equal(bridge.mobTagTextures.size,0);
delete global.THREE;delete global.AvatarFit;
console.log('PASS: names have no frame, keep chosen color, stay above GLB heads and do not distance-fade');
