'use strict';
const assert=require('node:assert/strict');
const Skills=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const Layout=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
const imagePNG='data:image/png;base64,'+
 Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
global.PhoenixSkills=Skills;
class Element{
 constructor(id){this.id=id;this.value='';this.textContent='';this.hidden=true;this.options=[];this.listeners={};}
 addEventListener(n,fn){this.listeners[n]=fn;}
 replaceChildren(...nodes){this.options=nodes;}
 appendChild(node){this.options.push(node)}
}
const ids=['phoenixSkillDefinitions','btnPhoenixSkillDefs','btnSkillDefClose',
 'btnSkillDefSave','btnSkillDefDelete','btnSkillDefLevelUp',
 'skillDefCharacter','skillDefSlot','skillDefName','skillDefDescription','skillDefIcon',
 'skillDefType','skillDefLevel','skillDefMaxLevel','skillDefBasePower','skillDefGrowth',
 'skillDefManaCost','skillDefCooldown','skillDefRange','skillDefAnimation',
 'skillDefPreview','skillDefMessage','skillDefImageFile','skillDefImagePreview',
 'btnSkillDefImagePick','btnSkillDefImageRemove'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
elements.skillDefSlot.value='slot3';
const doc={getElementById:id=>elements[id]||null,createElement:tag=>new Element(tag)};
let saved=0,dirty=0;
const p={id:'prefab-1',name:'Медведь',type:'mob'};
let redraws=0;
const builder={playBridge:{active:false},
 skillEditor:{close(){},schema:Layout,layout:Layout.defaultLayout(),
  render(){redraws++}},
 prefabEditor:{close(){},registry:{list(){return [p]},get(id){return id===p.id?p:null}}},
 save(){saved++},markProjectDirty(){dirty++}};
const Editor=require('../app/src/main/assets/engine/builder/skill-definition-editor.js');
const ed=new Editor(builder,doc);
assert.equal(ed.open(),true);
assert.equal(elements.phoenixSkillDefinitions.hidden,false);
elements.skillDefName.value='Огненный шар';
elements.skillDefDescription.value='Урон на расстоянии';
elements.skillDefIcon.value='🔥';
elements.skillDefType.value='damage';
elements.skillDefMaxLevel.value='5';
elements.skillDefLevel.value='2';
elements.skillDefBasePower.value='80';
elements.skillDefGrowth.value='25';
elements.skillDefManaCost.value='30';
elements.skillDefCooldown.value='6';
elements.skillDefRange.value='12';
elements.skillDefAnimation.value='cast';
ed.imageDraft=imagePNG;ed.previewImage();
assert.equal(ed.save(),true);
assert.equal(saved,0,'Saving skill settings must not write full project');
assert.equal(dirty,1,'Skill edit should mark unsaved project');
assert.equal(ed.catalog.get('player','slot3').basePower,80);
assert.equal(ed.catalog.get('player','slot3').level,2);
assert.equal(ed.catalog.get('player','slot3').iconImage,imagePNG);
assert.equal(builder.skillEditor.layout.slots[2].image,imagePNG,
 'Saving player skill must put PNG on actual HUD button');
assert(redraws>0,'HUD should be refreshed after assigning player skill image');
assert.equal(elements.skillDefPreview.textContent,'Сила на уровне 2: 105');
elements.skillDefCharacter.value='prefab-1';
elements.skillDefSlot.value='ultimate';
ed.loadForm();
elements.skillDefName.value='Рёв';
elements.skillDefDescription.value='Сила медведя';
assert.equal(ed.save(),true);
assert.equal(saved,0,'Skill changes only persist on manual project save');
assert.equal(dirty,2);
assert.equal(ed.catalog.get('prefab-1','ultimate').name,'Рёв');
assert.equal(ed.catalog.get('prefab-1','ultimate').iconImage,'',
 'NPC skill image stays independent of the player HUD');
const json=ed.serialize();
const other=new Editor(builder,doc);other.loadFromProject(JSON.parse(JSON.stringify(json)));
assert.deepEqual(other.serialize(),json);
other.startPlay();
assert.equal(other.panel.hidden,true);
assert.equal(other.runtime.cast('slot3',1,()=>true).power,105);
assert.equal(other.runtime.status(1).mp,70);
assert.equal(other.runtime.cast('slot3',2).reason,'cooldown');
other.resetPlay();assert.equal(other.runtime.status(2).mp,100);
other.stopPlay();assert.equal(other.runtime,null);
other.loadFromProject(null);
assert.equal(other.catalog.characters().length,0);
assert.equal(other.open(),true);
assert.equal(other.catalog.get('player','slot3'),null);
console.log('PASS: per-character PNG skill image, player HUD sync, NPC isolation, MP and level scaling');
