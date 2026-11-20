'use strict';
const assert=require('node:assert/strict');
const Core=require('../app/src/main/assets/engine/core/phoenix-core.js');
const Combat=require('../app/src/main/assets/engine/core/phoenix-combat.js');
const Bridge=require('../app/src/main/assets/engine/builder/play-bridge.js');
class V{
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 clone(){return new V(this.x,this.y,this.z);}
 copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
}
const ids=['btnPhoenixPlay','btnPhoenixEdit','phoenixPlayHud','phoenixCombatHud',
 'btnPhoenixAttack','phoenixCombatHP','phoenixCombatTarget','phoenixCombatNotice',
 'phoenixPlayerHP','phoenixPlayerHPText','phoenixKills','phoenixDeathNotice',
 'btnPhoenixRespawn','status','placementDot'];
const el=Object.fromEntries(ids.map(id=>[id,{
 id,hidden:true,disabled:false,textContent:'',listeners:{},className:'',
 addEventListener(name,fn){this.listeners[name]=fn;}
}]));
const names=new Set();
const doc={
 body:{classList:{add:n=>names.add(n),remove:n=>names.delete(n)}},
 getElementById:id=>el[id]||null
};
const combat=new Combat.Session({playerHp:100});
const events={dies:0,animations:0,saves:0};
const construction=[{id:'wall-1'}];
const b={
 mode:'build',tool:'place',keys:new Set(),entries:construction,
 player:{position:new V(1,0,2),rotation:new V(0,0,0)},
 camera:{position:new V(7,3,7)},
 controls:{target:new V(1,1,2),enabled:true,update(){}},
 preview:{root:{visible:true}},previewOutline:{visible:true},
 joystick:{reset(){}},
 setMode(next){this.mode=next},
 setAvatarAnimation(){events.animations++},
 playDeathAnimation(){events.dies++},
 prefabEditor:{
  combat,close(){},setPlaying(yes){
   combat.reset(yes?[{id:'wolf',name:'Волк',maxHp:80,faction:'enemy'}]:[]);
  },
  attackNearest(now){return combat.attack(b.player.positionArray||[1,0,2],
   [{id:'wolf',position:[2,0,2]}],now)}
 },
 save(){events.saves++;}
};
const initialPos=b.player.position.clone();
const initialCamera=b.camera.position.clone();
const initialTarget=b.controls.target.clone();
const bridge=new Bridge(b,Core,doc);
assert.equal(bridge.enter(),true);
assert.equal(el.phoenixPlayerHPText.textContent,'100 / 100 HP');
assert.equal(el.phoenixDeathNotice.hidden,true);
assert.equal(el.btnPhoenixRespawn.hidden,true);
assert.equal(bridge.attack(),true,'Player can attack while alive');
assert.equal(el.phoenixKills.textContent,'☠ Побеждено: 0');
b.player.position.add(new V(6,0,5));
b.camera.position.add(new V(6,0,5));
b.controls.target.add(new V(6,0,5));
let hit=combat.damagePlayer('wolf',35);
bridge.onPlayerHit(hit,'Волк');
assert.equal(el.phoenixPlayerHP.value,65);
assert.equal(el.phoenixPlayerHPText.textContent,'65 / 100 HP');
assert.equal(el.phoenixDeathNotice.hidden,true);
hit=combat.damagePlayer('wolf',100);
bridge.onPlayerHit(hit,'Волк');
assert.equal(combat.isPlayerDead(),true);
assert.equal(el.phoenixPlayerHP.value,0);
assert.equal(el.phoenixDeathNotice.hidden,false);
assert.equal(el.btnPhoenixRespawn.hidden,false);
assert.equal(el.btnPhoenixAttack.disabled,true);
assert.equal(events.dies,1);
assert.equal(bridge.attack(),false,'Dead player may not attack');
assert.equal(el.btnPhoenixRespawn.listeners.click(),true);
assert.equal(combat.getPlayer().hp,100);
assert.equal(el.phoenixPlayerHP.value,100);
assert.equal(el.phoenixDeathNotice.hidden,true);
assert.equal(el.btnPhoenixRespawn.hidden,true);
assert.equal(el.btnPhoenixAttack.disabled,false);
assert.deepEqual(b.player.position,initialPos);
assert.deepEqual(b.camera.position,initialCamera);
assert.deepEqual(b.controls.target,initialTarget);
assert.equal(b.entries,construction);
assert.equal(events.saves,0,'Respawn must never save/mutate building JSON');
assert.equal(bridge.exit(),true);
assert.equal(b.mode,'build');
assert.equal(el.phoenixCombatHud.hidden,true);
assert.equal(b.entries,construction);
assert.equal(events.saves,0);
console.log('PASS: mobile player HP, mob retaliation, death, respawn and untouched Builder state');
