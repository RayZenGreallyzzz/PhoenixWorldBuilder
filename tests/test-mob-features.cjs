'use strict';
const assert=require('node:assert/strict');
const Mob=require('../app/src/main/assets/engine/core/phoenix-mob-features.js');
const Prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
const Combat=require('../app/src/main/assets/engine/core/phoenix-combat.js');
const Skills=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const T=require('../app/src/main/assets/js/three.min.js');
const VFX=require('../app/src/main/assets/engine/runtime/phoenix-vfx.js');
assert.deepEqual(Mob.respawn(null),{enabled:false,delay:30});
assert.deepEqual(Mob.respawn({enabled:true,delay:7}),{enabled:true,delay:7});
assert.throws(()=>Mob.respawn({enabled:true,delay:0}),/respawn delay/);
assert.throws(()=>Mob.respawn({enabled:true,delay:3601}),/respawn delay/);
assert.throws(()=>Mob.respawn({enabled:true,delay:NaN}),/respawn delay/);
const settings=Prefabs.normalize({name:'Страж леса',type:'mob',faction:'enemy',
 stats:{hp:220,damage:32,speed:3,level:12,defense:45},
 respawn:{enabled:true,delay:3},attackEffect:'magic'});
assert.equal(settings.stats.level,12);
assert.equal(settings.stats.defense,45);
assert.equal(settings.respawn.delay,3);
assert.equal(settings.attackEffect,'magic');
assert.equal(Prefabs.normalize({name:'Legacy'}).respawn.enabled,false);
assert.throws(()=>Prefabs.normalize({name:'Invalid',stats:{level:0}}),/level/);
assert.throws(()=>Prefabs.normalize({name:'Invalid',stats:{defense:-1}}),/defense/);
const combat=new Combat.Session();combat.reset([{
 id:'enemy-1',maxHp:220,faction:'enemy',name:'Страж леса'
}]);
const skill={name:'Лесной удар',icon:'🌳',type:'damage',level:2,
 basePower:20,growth:10,manaCost:5,cooldown:2,range:7,
 effect:{preset:'ring',color:'#ccff55',size:2,duration:.4}};
const catalog=new Skills.Catalog();
catalog.set('prefab-1','slot3',skill);
assert.equal(catalog.get('prefab-1','slot3').effect.preset,'ring');
const profile=Mob.profile(settings,combat.get('enemy-1'),
 catalog.entries('prefab-1'),'Король волков');
assert.equal(profile.name,'Король волков');
assert.equal(profile.level,12);
assert.equal(profile.defense,45);
assert.equal(profile.hp,220);
assert.equal(profile.skills[0].name,'Лесной удар');
assert.equal(profile.skills[0].cooldown,2);
const retry=new Mob.Respawner();
assert.equal(retry.mark('enemy-1',{enabled:true,delay:3}),true);
assert.equal(retry.remaining('enemy-1'),3);
assert.deepEqual(retry.tick(.5),[]);
assert.equal(retry.remaining('enemy-1'),2.5);
let done=[];for(let i=0;i<5;i++)done.push(...retry.tick(.5));
assert.deepEqual(done,['enemy-1']);
assert.equal(retry.remaining('enemy-1'),null);
assert.equal(retry.mark('enemy-1',{enabled:false}),false);
assert.equal(retry.remaining('enemy-1'),null);
combat.damageMob('enemy-1',220);
assert.equal(combat.isDead('enemy-1'),true);
assert.equal(combat.respawnMob('enemy-1'),true);
assert.equal(combat.get('enemy-1').hp,220);
assert.equal(combat.respawnMob('enemy-1'),false);
combat.damageMob('enemy-1',100);
const healed=combat.healMob('enemy-1',20);
assert.equal(healed.hp,140);
assert.equal(healed.healed,20);
assert(Math.abs(Mob.angularDelta(3.13,-3.13))<.05,
 'Mob yaw should take shortest rotation across +/-pi');
const targetYaw=Mob.face({x:0,z:0},{x:3,z:0});
assert(Math.abs(targetYaw-Math.PI/2)<.001);
const mid=Mob.turn(0,targetYaw,.02,8);
assert(mid>0&&mid<targetYaw,'Yaw interpolation must not snap 90 degrees at once');
assert.throws(()=>VFX.normalize({preset:'ring',size:999}),/effect/);
assert.equal(VFX.normalize({preset:'heal'},'heal').preset,'heal');
const scene=new T.Scene();
const fx=new VFX.SceneFX(scene,T);
assert.equal(fx.spawn({preset:'none'},{x:0,y:0,z:0}),false);
for(let i=0;i<50;i++)fx.spawn({preset:'spark'},new T.Vector3(i,0,0));
assert.equal(fx.items.length,30,'Android VFX must cap simultaneous meshes');
fx.update(.1);fx.update(.1);fx.update(.1);fx.update(.1);fx.update(.1);fx.update(.1);
assert(fx.items.length<30,'Temporary VFX must expire automatically');
fx.dispose();
assert.equal(fx.items.length,0);
assert.equal(scene.children.includes(fx.group),false);
console.log('PASS: NPC nickname/stats, 3s respawn, defense/heal, facing and Android-bounded VFX');
