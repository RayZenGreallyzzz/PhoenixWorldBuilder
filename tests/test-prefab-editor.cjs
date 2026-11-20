'use strict';
const assert=require('node:assert/strict');
const T=require('../app/src/main/assets/js/three.min.js');
const core=require('../app/src/main/assets/engine/core/phoenix-core.js');
const prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
const ai=require('../app/src/main/assets/engine/core/phoenix-ai.js');
const anim=require('../app/src/main/assets/engine/runtime/phoenix-animations.js');
global.THREE=T;global.PhoenixCore=core;global.PhoenixPrefabs=prefabs;
global.PhoenixAI=ai;global.PhoenixAnimations=anim;
global.window={PhoenixCore:core,PhoenixPrefabs:prefabs,PhoenixAI:ai,PhoenixAnimations:anim};
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
 'btnPrefabImportGlb','importUniversalModel','status'];
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
 ed.setPlaying(false);
 assert.equal(ed.rendered.get(entity).root.position.x,5,
  'EDIT restores authored NPC position');
 assert.equal(ed.hasContent(),true);
 assert.equal(ed.rendered.size,1);
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
 console.log('PASS: Prefab Editor creates/removes mobs, touch placement, PLAY and JSON restore');
})().catch(error=>{console.error(error);process.exitCode=1});
