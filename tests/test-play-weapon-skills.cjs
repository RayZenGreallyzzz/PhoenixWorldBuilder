'use strict';
const assert=require('node:assert/strict');
global.PhoenixWeapon=require('../app/src/main/assets/engine/core/phoenix-weapon.js');
const Skill=require('../app/src/main/assets/engine/core/phoenix-skills.js');
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
 'btnPhoenixRespawn','phoenixAmmoLine','phoenixAmmoText','phoenixCrosshair',
 'phoenixMpLine','phoenixMpText','status','placementDot',
 'phoenixRangedControls','btnPhoenixRangedAim','btnPhoenixRangedReload',
 'btnPlayerCombatApply','btnPlayerCombatPreset','phoenixPlayerCombatStatus',
 'phoenixPlayerCombatMode','phoenixPlayerCombatHP','phoenixPlayerCombatDamage',
 'phoenixPlayerCombatRange','phoenixPlayerCombatCooldown',
 'phoenixPlayerCombatMagazineSize','phoenixPlayerCombatReserveCapacity',
 'phoenixPlayerCombatReloadDuration'];
const els=Object.fromEntries(ids.map(id=>[id,{
 id,hidden:true,disabled:false,textContent:'',listeners:{},
 addEventListener(n,handler){this.listeners[n]=handler;}}]));
const doc={body:{classList:{add(){},remove(){}}},getElementById:id=>els[id]||null};
const combat=new Combat.Session();
const skills=new Skill.Catalog();
skills.set('player','slot3',{name:'Огонь',icon:'🔥',description:'Дальний урон',
 type:'damage',basePower:80,growth:25,level:2,maxLevel:5,
 manaCost:30,cooldown:6,range:15,animation:'cast'});
const ed={catalog:skills,runtime:null,
 startPlay(){this.runtime=new Skill.Runtime(skills,'player',100)},
 stopPlay(){this.runtime=null},
 resetPlay(){this.startPlay()},
 cast(slot,now,allow){return this.runtime.cast(slot,now,allow)},
 close(){}};
let saves=0,projections=0,unsaved=0;
const editor={
 combat,close(){},setPlaying(on){
  const hero=b?.playBridge?.playerCombat;
  if(hero){
   combat.damage=hero.damage;combat.range=hero.range;
   combat.cooldown=hero.cooldown;combat.playerMaxHp=hero.hp;
  }
  combat.reset(on?[{id:'enemy-1',name:'Медведь',maxHp:160,faction:'enemy'}]:[]);
 },
 findEnemy(range){return {id:'enemy-1',distance:4}},
 damageEnemy(id,amount){return combat.damageMob(id,amount)},
 attackNearest(now){return combat.attack([0,0,0],
  [{id:'enemy-1',position:[1,0,0]}],now)}
};
const player={position:new V(0,0,0),rotation:new V(0,0,0)};
const b={
 mode:'build',tool:'place',keys:new Set(),player,
 camera:{position:new V(1,3,6),fov:60,updateProjectionMatrix(){projections++;}},
 controls:{target:new V(0,1,0),enabled:true,update(){}},
 preview:{root:{visible:true}},previewOutline:{visible:true},
 joystick:{reset(){}},prefabEditor:editor,skillDefinitionEditor:ed,
 skillEditor:{layout:{slots:[{id:'fire',enabled:true}]},setPlaying(){},close(){}},
 setMode(mode){this.mode=mode},
 setAvatarAnimation(){},
 save(){saves++},markProjectDirty(){unsaved++}
};
const bridge=new Bridge(b,Core,doc);b.playBridge=bridge;
assert.equal(bridge.enter(),true);
assert.equal(els.phoenixAmmoLine.hidden,false);
assert.equal(els.phoenixCrosshair.hidden,false);
assert.equal(els.phoenixMpLine.hidden,false);
assert.equal(bridge.weapon.status().ammo,12);
assert.equal(bridge.fire(),true);
assert.equal(bridge.weapon.status().ammo,11);
assert.equal(combat.get('enemy-1').hp,140);
assert.equal(bridge.aim(),true);
assert.equal(b.camera.fov,42);
assert.equal(bridge.reload(),true);
assert.equal(bridge.weapon.status().reloading,true);
assert.equal(bridge.castSkill('slot3'),true);
assert.equal(ed.runtime.status().mp,70);
assert.equal(combat.get('enemy-1').hp,35);
assert.equal(bridge.castSkill('slot3'),false);
assert.equal(ed.runtime.status().mp,70);
assert.equal(els.phoenixMpText.textContent,'70 / 100');
assert.equal(bridge.exit(),true);
assert.equal(b.camera.fov,60);
assert(projections>=2);
assert.equal(ed.runtime,null);
assert.equal(b.mode,'build');
assert.equal(saves,0,'PLAY must not mutate saved Builder project');
// Ranged hero is a real gameplay setting rather than a cosmetic class label.
const Profiles=require('../app/src/main/assets/engine/core/phoenix-player-combat.js');
bridge.showPlayerCombatForm({...Profiles.preset('ranged'),hp:240,damage:33,
 range:45,magazineSize:5,reserveCapacity:10,reloadDuration:2,cooldown:.8});
assert.equal(bridge.applyPlayerCombatForm(),true);
assert.equal(unsaved,1,'Changing hero style marks project dirty only');
assert.equal(saves,0,'Hero settings never force full autosave');
assert.equal(bridge.playerCombat.mode,'ranged');
assert.equal(bridge.enter(),true);
assert.equal(els.phoenixRangedControls.hidden,false,'Ranged controls visible in PLAY');
assert.equal(bridge.weapon.damage,33);
assert.equal(bridge.weapon.range,45);
assert.equal(bridge.weapon.magazineSize,5);
assert.equal(bridge.weapon.reserve,10);
assert.equal(bridge.attack(),true,'Main Attack button must shoot in ranged style');
assert.equal(combat.get('enemy-1').hp,127,'Ranged attack must use configured 33 damage');
assert.equal(bridge.weapon.ammo,4);
assert.equal(bridge.aim(),true,'Ranged hero can aim');
assert.equal(bridge.reload(),true,'Ranged hero can reload');
assert.equal(bridge.exit(),true);
assert.equal(els.phoenixRangedControls.hidden,true,'Ranged controls hidden after PLAY');
// Melee still uses existing combat targeting; old skill HUD shots unchanged.
bridge.showPlayerCombatForm({...Profiles.preset('melee'),damage:55,range:3.5,hp:150});
assert.equal(bridge.applyPlayerCombatForm(),true);
assert.equal(bridge.enter(),true);
assert.equal(els.phoenixRangedControls.hidden,true);
assert.equal(bridge.attack(),true,'Main Attack button uses melee targeting');
assert.equal(combat.get('enemy-1').hp,105,'Melee attack uses configured 55 damage');
assert.equal(combat.getPlayer().maxHp,150,'Hero max HP applies to real combat');
assert.equal(bridge.exit(),true);
assert.equal(saves,0);
console.log('PASS: shooter legacy compatibility, configurable ranged combat, aim/reload, melee targeting, and no autosaves');
