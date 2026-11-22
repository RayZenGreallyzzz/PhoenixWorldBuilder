'use strict';
const assert=require('node:assert/strict');
const RPG=require('../app/src/main/assets/engine/core/phoenix-progression.js');
const Bridge=require('../app/src/main/assets/engine/builder/play-bridge.js');
class Vector{
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
 clone(){return new Vector(this.x,this.y,this.z)}
 copy(p){this.x=p.x;this.y=p.y;this.z=p.z;return this}
 sub(p){this.x-=p.x;this.y-=p.y;this.z-=p.z;return this}
 add(p){this.x+=p.x;this.y+=p.y;this.z+=p.z;return this}
}
const ids={};
for(const id of ['btnPhoenixPlay','btnPhoenixEdit','phoenixPlayHud','phoenixCombatHud',
 'phoenixLevelLine','phoenixCombatNotice','phoenixPlayerHP','phoenixPlayerHPText',
 'phoenixKills']){
 ids[id]={hidden:true,textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn}};
}
const doc={getElementById:id=>ids[id],body:{classList:{add(){},remove(){}}}};
const profile=RPG.preset('assassin');
let starterProfile=profile;
const skill={startPlay(mp,level){this.mp=mp;this.level=level;
 this.runtime={mp,maxMp:mp,level,setLevel(l){this.level=l}}},stopPlay(){this.runtime=null}};
const combat={playerMaxHp:100,playerHp:100,damage:25,cooldown:.65,
 reset(){this.playerHp=this.playerMaxHp;this.playerDead=false;this.kills=0},
 getPlayer(){return {hp:this.playerHp,maxHp:this.playerMaxHp,
  dead:false,kills:this.kills||0}},isPlayerDead(){return false}};
let bridge;
const builder={mode:'build',tool:'pick',projectLoadRunning:false,
 controls:{target:new Vector(0,0,0),enabled:true,update(){}},
 camera:{position:new Vector(0,5,10)},player:{position:new Vector(),rotation:new Vector()},
 keys:new Set(),setMode(m){this.mode=m},
 progressionEditor:{serializePlayer(){return starterProfile}},
 skillDefinitionEditor:skill,skillEditor:{setPlaying(){}},
 prefabEditor:{combat,close(){},setPlaying(playing){
   if(playing){const active=bridge.playerActiveCombat||bridge.playerCombat;
    combat.damage=active.damage;combat.cooldown=active.cooldown;
    combat.playerMaxHp=active.hp;combat.reset()}
  },mobProfile(){return {level:10}}},
 joystick:{reset(){}},setAvatarAnimation(){},canvas:{addEventListener(){}}
};
class World{}
class Modes{constructor(m){this.mode=m}setMode(m){this.mode=m}}
bridge=new Bridge(builder,{PhoenixWorld:World,PhoenixModeController:Modes},doc);
assert.equal(bridge.enter(),true);
assert.equal(bridge.playerRuntimeStats.hp,90);
assert.equal(bridge.playerRuntimeStats.speed,4.2);
assert.equal(bridge.playerRuntimeStats.defense,6);
assert.equal(bridge.playerActiveCombat.damage,29);
assert.equal(combat.playerMaxHp,90);
assert.equal(skill.runtime.maxMp,80);
assert.equal(skill.runtime.level,1);
assert(ids.phoenixLevelLine.textContent.includes('Ур. 1'));
const before=bridge.progressionSession;
bridge.onMobKilled('wolf',{killed:true});
assert.equal(bridge.progressionSession.level,2);
assert.equal(bridge.playerActiveCombat.hp,98);
assert.equal(bridge.playerActiveCombat.damage,32.3);
assert.equal(combat.playerMaxHp,98);
assert.equal(combat.damage,32.3);
assert.equal(skill.runtime.level,2);
assert.equal(ids.phoenixLevelLine.hidden,false);
assert.equal(profile.level,1,'Developer-authored progression cannot mutate during PLAY');
assert.equal(bridge.exit(),true);
assert.equal(bridge.playerRuntimeStats,null);
assert.equal(bridge.enter(),true);
assert.equal(bridge.progressionSession,before,
 'XP may persist across edit/play in the SAME Builder session');
assert.equal(bridge.playerRuntimeStats.level,2);
bridge.exit();
starterProfile=null;
assert.equal(bridge.enter(),true);
assert.equal(bridge.playerRuntimeStats,null);
assert.equal(bridge.playerActiveCombat,null);
assert.equal(combat.playerMaxHp,100,'Old game projects retain original hero HP');
assert.equal(combat.damage,25,'Old game projects retain original damage');
bridge.exit();
console.log('PASS: authored level stats actually apply in PLAY, XP unlocks skills, old projects unchanged');
