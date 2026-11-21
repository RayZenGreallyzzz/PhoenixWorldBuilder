'use strict';
const assert=require('node:assert/strict');
const T=require('../app/src/main/assets/js/three.min.js');
const core=require('../app/src/main/assets/engine/core/phoenix-core.js');
const prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
const ai=require('../app/src/main/assets/engine/core/phoenix-ai.js');
const anim=require('../app/src/main/assets/engine/runtime/phoenix-animations.js');
const combat=require('../app/src/main/assets/engine/core/phoenix-combat.js');
global.AvatarFit=require('../app/src/main/assets/js/avatar-fit.js');
global.THREE=T;global.PhoenixCore=core;global.PhoenixPrefabs=prefabs;
global.PhoenixAI=ai;global.PhoenixAnimations=anim;global.PhoenixCombat=combat;
global.window={PhoenixCore:core,PhoenixPrefabs:prefabs,PhoenixAI:ai,PhoenixAnimations:anim,PhoenixCombat:combat};
class Element {
 constructor(id){this.id=id;this.value='';this.textContent='';this.hidden=id==='phoenixPrefabPanel';this.listeners={};this.options=[];}
 addEventListener(name,handler){this.listeners[name]=handler;}
 appendChild(option){this.options.push(option);return option;}
 replaceChildren(...children){this.options=[...children];}
 click(){this.listeners.click?.({target:this});}
}
const names=['phoenixPrefabPanel','btnPhoenixPrefabs','btnPrefabClose',
 'btnPrefabNew','btnPrefabSave','btnPrefabDelete','btnPrefabPlace',
 'btnPrefabCancelPlace','btnPrefabRemoveEntity','phoenixPrefabSaved',
 'phoenixPrefabAsset','phoenixPrefabEntities','phoenixPrefabName',
 'phoenixPrefabType','phoenixPrefabFaction','phoenixPrefabHP',
 'phoenixPrefabDamage','phoenixPrefabSpeed','phoenixPrefabIdle',
 'phoenixPrefabWalk','phoenixPrefabRun','phoenixPrefabAttack','phoenixPrefabHit',
 'phoenixPrefabDeath','phoenixPrefabCast','phoenixPrefabAI','phoenixPrefabPatrolRadius',
 'phoenixPrefabAggroRadius','phoenixPrefabAttackRange','phoenixPrefabCooldown','phoenixPrefabClipList',
 'phoenixPrefabClips','phoenixPrefabCounts','phoenixPrefabStatus',
 'btnPrefabImportGlb','importUniversalModel','status',
 'btnPrefabApplyTransform','btnPrefabSnapGround','phoenixEntityAI',
 'phoenixEntityX','phoenixEntityY','phoenixEntityZ','phoenixEntityYaw',
 'phoenixEntityWaypoints','phoenixWaypointX','phoenixWaypointY',
 'phoenixWaypointZ','btnPrefabWaypointAdd','btnPrefabWaypointTap',
 'btnPrefabWaypointRemove','btnPrefabPreviewAttack'];
const els=Object.fromEntries(names.map(id=>[id,new Element(id)]));
els.phoenixPrefabName.value='Лесной волк';
els.phoenixPrefabType.value='mob';
els.phoenixPrefabFaction.value='enemy';
els.phoenixPrefabHP.value='200';els.phoenixPrefabDamage.value='33';
els.phoenixPrefabSpeed.value='3';els.phoenixPrefabIdle.value='Idle';
els.phoenixPrefabAI.value='patrol';els.phoenixPrefabPatrolRadius.value='2';
els.phoenixPrefabAggroRadius.value='7';els.phoenixPrefabAttackRange.value='1.25';
els.phoenixPrefabCooldown.value='1.8';
global.document={getElementById:id=>els[id]||null,createElement:tag=>new Element(tag)};
const builder={
 scene:new T.Scene(),ground:new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial()),
 player:{position:new T.Vector3(4,0,7)},collisionsEnabled:false,
 camera:new T.PerspectiveCamera(),entries:[{kind:'wall',category:'wall'}],
 catalogMeta:new Map(),assets:new Map(),playBridge:{active:false,gameWorld:new core.PhoenixWorld()},
 preview:{root:{visible:true}},previewOutline:{visible:true},canvas:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},
 projectLoadRunning:false,restoringProject:false,mode:'build',tool:'place',
 setMode(m){this.mode=m;},setTool(t){this.tool=t;this.preview.root.visible=t==='place';this.previewOutline.visible=t==='place';},
 save(){this.saved=(this.saved||0)+1;},
 ensureTemplate:async()=>false,cloneTemplate:()=>null,descriptor:()=>null
};
const Editor=require('../app/src/main/assets/engine/builder/prefab-editor.js');
(async()=>{
 const ed=new Editor(builder);
 assert.equal(ed.hasContent(),false);
 ed.saveDraft();
 assert.equal(ed.registry.list().length,1);
 assert.equal(ed.registry.get('prefab-1').stats.damage,33);
 assert.equal(ed.selectedId,'prefab-1');
 const entity=await ed.createEntity('prefab-1',[5,0,7]);
 assert.equal(entity,'entity-1');
 assert.equal(builder.entries.length,1,'Game entities must not modify construction entries');
 assert.equal(ed.layer.children.length,1);
 assert.equal(ed.world.getComponent(entity,'stats').hp,200);
 assert.equal(ed.world.getComponent(entity,'character').faction,'enemy');
 assert.equal(ed.world.getComponent(entity,'character').ai.mode,'patrol');
 ed.setPlaying(true);ed.update(.15);
 assert(ed.rendered.get(entity).root.position.x>5,
  'Patrol should move without changing saved world transform');
 assert.deepEqual(ed.world.getComponent(entity,'transform').position,[5,0,7]);
 const battle=ed.attackNearest(1);
 assert.equal(battle.ok,true,'Melee should find nearest hostile mob');
 assert.equal(battle.hp,175);
 assert.equal(ed.rendered.get(entity).animation?.state,'hit');
 assert.equal(ed.attackNearest(1.01).reason,'cooldown');
 ed.setPlaying(false);
 assert.equal(ed.combat.get(entity),null,'EDIT must not retain temporary battle HP');
 assert.equal(ed.rendered.get(entity).root.position.x,5,
  'EDIT restores authored NPC position');
 const template=ed.registry.get('prefab-1');
 template.ai.mode='chase';
 ed.registry.update('prefab-1',template);
 const incoming=[];
 builder.playBridge.onPlayerHit=(hit,name)=>incoming.push({hit,name});
 ed.setPlaying(true);
 ed.update(.15);
 assert.equal(ed.combat.getPlayer().hp,67,
  'Hostile NPC must damage player when in attack range');
 assert.equal(incoming.length,1,'PLAY bridge must receive enemy hit event');
 assert.equal(incoming[0].name,'Лесной волк');
 ed.setPlaying(false);
 assert.equal(ed.combat.getPlayer().hp,100,
  'End of PLAY must reset temporary player HP');

 assert.equal(ed.hasContent(),true);
 assert.equal(ed.rendered.size,1);
 // Both the exact placement and routes belong to each ENTITY, not to
 // the shared wolf GLB/prefab. Edits must round-trip through ordinary JSON.
 els.phoenixPrefabEntities.value=entity;ed.selectEntity();
 els.phoenixEntityX.value='5.25';
 els.phoenixEntityY.value='0.5';
 els.phoenixEntityZ.value='7.75';
 els.phoenixEntityYaw.value='90';
 assert(ed.applyEntityTransform());
 assert.deepEqual(ed.world.getComponent(entity,'transform').position,[5.25,.5,7.75]);
 assert(Math.abs(ed.world.getComponent(entity,'transform').yaw-Math.PI/2)<1e-8);
 els.phoenixEntityAI.value='patrol-aggro';
 assert(ed.applyEntityAI());
 els.phoenixWaypointX.value='8';els.phoenixWaypointY.value='.5';
 els.phoenixWaypointZ.value='8';
 assert(ed.addWaypoint());
 els.phoenixWaypointX.value='10';els.phoenixWaypointZ.value='11';
 assert(ed.addWaypoint());
 const authoredAI=ed.world.getComponent(entity,'character').ai;
 assert.equal(authoredAI.mode,'patrol-aggro');
 assert.deepEqual(authoredAI.waypoints,[[8,.5,8],[10,.5,11]]);
 assert.equal(ed.registry.get('prefab-1').ai.mode,'patrol',
  'Editing a mob must not change the shared prefab template');
 const second=await ed.createEntity('prefab-1',[12,0,17]);
 assert.equal(ed.world.getComponent(second,'character').ai.mode,'chase',
  'Fresh mob gets the template AI, not another mob\'s route');
 assert.deepEqual(ed.world.getComponent(second,'character').ai.waypoints,[]);
 els.phoenixPrefabEntities.value=second;
 ed.removeSelectedEntity();
 assert.equal(ed.world.entityIds().length,1);
 els.phoenixPrefabEntities.value=entity;ed.selectEntity();

 const snapshot=ed.serialize();
 assert.equal(snapshot.version,1);
 assert.equal(snapshot.world.entities.length,1);
 assert.equal(snapshot.catalog.prefabs.length,1);
 ed.setPlaying(true);ed.update(.016);
 assert.equal(ed.playing,true);
 ed.setPlaying(false);
 assert.equal(ed.playing,false);
 const saved=builder.saved;
 await ed.loadFromProject(JSON.parse(JSON.stringify(snapshot)));
 assert.equal(ed.layer.children.length,1,'Reload must restore placed mobs');
 assert.equal(ed.world.entityIds().length,1);
 assert.equal(builder.saved,saved,'Opening a project must not autosave over it');
 ed.selectPrefab('prefab-1');
 ed.beginPlacement();
 assert.equal(ed.pendingPlace,'prefab-1');
 assert.equal(builder.preview.root.visible,false);
 ed.findPoint=()=>new T.Vector3(2,0,4);
 const placed=await ed.placeFromEvent({clientX:10,clientY:10});
 assert.equal(placed,true);
 assert.equal(ed.pendingPlace,'');
 assert.equal(builder.preview.root.visible,true);
 assert.equal(ed.world.entityIds().length,2);
 const select=els.phoenixPrefabEntities;
 select.value='entity-2';ed.removeSelectedEntity();
 assert.equal(ed.world.entityIds().length,1);
 assert.equal(ed.layer.children.length,1);
 // Invalid game extension is rejected before changing the existing world.
 const before=ed.serialize();
 await assert.rejects(()=>ed.loadFromProject({version:42}),/Неподдерживаемые/);
 assert.deepEqual(ed.serialize(),before);
 await ed.loadFromProject(null);
 assert.equal(ed.world.entityIds().length,0);
 assert.equal(ed.layer.children.length,0);
 assert.equal(builder.entries.length,1);
 // Regression: many animated GLBs have origin at the waist and Attack
 // tracks move their imported root down. Neither can bury a playable mob.
 builder.ensureTemplate=async()=>true;
 builder.cloneTemplate=()=>{
  const visual=new T.Group();
  visual.name='GLB_ActorRoot';
  const body=new T.Mesh(new T.BoxGeometry(.8,2,.6),
   new T.MeshBasicMaterial());
  body.name='BODY';visual.add(body);
  return visual;
 };
 const attackFrames=new T.VectorKeyframeTrack('.position',
  [0,.4,.8],[0,0,0, 0,-.9,0, 0,-.9,0]);
 builder.assets.set('glb:underground-regression',{
  animations:[new T.AnimationClip('Idle',.8,[]),
   new T.AnimationClip('Attack',.8,[attackFrames])]
 });
 ed.newDraft();
 els.phoenixPrefabAsset.value='glb:underground-regression';
 els.phoenixPrefabAI.value='idle';
 ed.saveDraft();
 const instance=await ed.createEntity('prefab-1',[2,0,3]);
 const model=ed.rendered.get(instance);
 assert(model.visual!==model.root,'Animated GLB must not be world mover');
 assert.equal(model.root.position.y,0,'Authored AI Y stays at world ground');
 assert(Math.abs(model.anchor.position.y-1)<.06,
  'Model centered on hips should be raised so feet land on ground');
 const savedPosition=ed.world.getComponent(instance,'transform').position.slice();
 ed.setPlaying(true);
 assert.equal(model.animation.model,model.visual,
  'GLB animation must not alter the AI mover position');
 model.animation.setState('attack',0);
 for(let i=0;i<9;i++)ed.update(.1);
 assert.equal(model.root.position.y,0,'Attack root motion must not sink NPC mover');
 assert(model.visual.position.y<-.65,'Actual GLB Attack root motion is active');
 assert(Math.abs((model.anchor.position.y+model.visual.position.y)-1)<.24,
  'Live grounding must compensate Attack root motion');
 assert.deepEqual(ed.world.getComponent(instance,'transform').position,savedPosition,
  'Runtime pose correction must never change saved prefab coordinates');
 ed.setPlaying(false);
 assert(Math.abs(model.anchor.position.y-1)<.06,
  'EDIT restores feet-ground alignment after Attack');
 assert.equal(model.root.position.y,0);
 console.log('PASS: Prefab Editor grounds animated GLB and creates/removes mobs, touch placement, PLAY and JSON restore');
})().catch(error=>{console.error(error);process.exitCode=1});
