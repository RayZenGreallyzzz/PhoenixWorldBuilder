/* Phoenix Engine 1.1 — per-character skill authoring with PNG/WebP icons.
 * No raw JavaScript from form fields. Persistent definitions are separate from
 * temporary PLAY mana, cooldown and damage.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkillDefinitionEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class PhoenixSkillDefinitionEditor{
  constructor(builder,doc){
   if(!globalThis.PhoenixSkills)throw new Error('Phoenix Skills module missing');
   this.b=builder;this.doc=doc||document;
   this.catalog=new PhoenixSkills.Catalog();
   this.runtime=null;
   this.imageDraft='';this.imageRequestToken=0;
   this.panel=this.el('phoenixSkillDefinitions');
   if(!this.panel)throw new Error('Skill definition UI missing');
   this.bind();this.refreshCharacters();this.loadForm();
  }
  el(id){return this.doc.getElementById(id);}
  status(value){
   const n=this.el('skillDefMessage');if(n)n.textContent=value;
  }
  option(value,label){
   const node=this.doc.createElement('option');
   node.value=value;node.textContent=label;return node;
  }
  bind(){
   this.el('btnPhoenixSkillDefs')?.addEventListener('click',()=>this.toggle());
   this.el('btnSkillDefClose')?.addEventListener('click',()=>this.close());
   this.el('btnSkillDefSave')?.addEventListener('click',()=>this.save());
   this.el('btnSkillDefDelete')?.addEventListener('click',()=>this.remove());
   this.el('btnSkillDefLevelUp')?.addEventListener('click',()=>this.levelUp());
   const imageInput=this.el('skillDefImageFile');
   this.el('btnSkillDefImagePick')?.addEventListener('click',()=>{
    if(imageInput){imageInput.value='';imageInput.click();}
   });
   imageInput?.addEventListener('change',()=>{
    if(imageInput.files?.[0])this.importImage(imageInput.files[0]);
   });
   this.el('btnSkillDefImageRemove')?.addEventListener('click',()=>this.removeImage());
   this.el('skillDefCharacter')?.addEventListener('change',()=>this.loadForm());
   this.el('skillDefSlot')?.addEventListener('change',()=>this.loadForm());
   for(const id of ['skillDefLevel','skillDefBasePower','skillDefGrowth'])
    this.el(id)?.addEventListener('input',()=>this.preview());
  }
  refreshCharacters(){
   const select=this.el('skillDefCharacter');
   if(!select)return;
   const previous=select.value||'player';
   select.replaceChildren(this.option('player','🧍 Игрок / мой герой'));
   for(const p of this.b.prefabEditor?.registry.list()||[])
    select.appendChild(this.option(p.id,(p.type==='npc'?'🧑 ':'🐺 ')+p.name));
   select.value=[...select.options].some(o=>o.value===previous)?previous:'player';
  }
  selected(){return {character:this.el('skillDefCharacter').value||'player',
   slot:this.el('skillDefSlot').value||'slot3'};}
  blank(){
   return {name:'Новый навык',description:'',icon:'✨',iconImage:'',type:'damage',
    basePower:30,growth:10,level:1,maxLevel:5,manaCost:15,
    cooldown:5,range:8,animation:'cast',
    effect:{preset:'impact',color:'#ffce65',size:1,duration:.5}};
  }
  read(){
   const get=id=>this.el('skillDef'+id)?.value;
   return {
    name:get('Name'),description:get('Description'),icon:get('Icon'),
    iconImage:this.imageDraft,
    type:get('Type'),level:Number(get('Level')),maxLevel:Number(get('MaxLevel')),
    basePower:Number(get('BasePower')),growth:Number(get('Growth')),
    manaCost:Number(get('ManaCost')),cooldown:Number(get('Cooldown')),
    range:Number(get('Range')),animation:get('Animation'),
    effect:{
     preset:get('FxPreset')||(get('Type')==='heal'?'heal':'impact'),
     color:get('FxColor')||'#ffce65',
     size:Number(get('FxSize')??1),duration:Number(get('FxDuration')??.5)}
   };
  }
  write(data){
   const s=data||this.blank();
   const keys={
    Name:s.name,Description:s.description,Icon:s.icon,Type:s.type,
    Level:s.level,MaxLevel:s.maxLevel,BasePower:s.basePower,
    Growth:s.growth,ManaCost:s.manaCost,Cooldown:s.cooldown,
    Range:s.range,Animation:s.animation,
    FxPreset:s.effect?.preset||(s.type==='heal'?'heal':'impact'),
    FxColor:s.effect?.color||'#ffce65',
    FxSize:s.effect?.size??1,
    FxDuration:s.effect?.duration??.5
   };
   for(const [key,value] of Object.entries(keys)){
    const field=this.el('skillDef'+key);
    if(field)field.value=String(value);
   }
   this.imageRequestToken++;
   this.imageDraft=s.iconImage||'';
   this.previewImage();this.preview();
  }
  previewImage(){
   const preview=this.el('skillDefImagePreview');
   if(preview){preview.hidden=!this.imageDraft;preview.src=this.imageDraft||'';}
  }
  async importImage(file){
   const selected=this.selected(),token=++this.imageRequestToken;
   try{
    const image=await globalThis.PhoenixSkillImages.fromFile(file,this.doc);
    const current=this.selected();
    if(token!==this.imageRequestToken||selected.character!==current.character||
       selected.slot!==current.slot)return false;
    this.imageDraft=image;this.previewImage();
    this.status('🖼 PNG/WebP загружен. Нажми «Сохранить навык».');
    return true;
   }catch(error){this.status('Ошибка картинки: '+error.message);return false;}
  }
  removeImage(){
   this.imageRequestToken++;this.imageDraft='';this.previewImage();
   this.status('Картинка убрана. Нажми «Сохранить навык».');
  }
  loadForm(){
   const {character,slot}=this.selected();
   const saved=this.catalog.get(character,slot);
   this.write(saved);
   this.status(saved?
    '✅ Навык этого персонажа и слота загружен.':
    'Создай навык, затем сохрани. В PLAY скиллы работают у игрока и мобов с эффектами.');
  }
  preview(){
   const el=this.el('skillDefPreview');
   if(!el)return;
   const base=Number(this.el('skillDefBasePower')?.value)||0;
   const growth=Number(this.el('skillDefGrowth')?.value)||0;
   const level=Number(this.el('skillDefLevel')?.value)||1;
   el.textContent='Сила на уровне '+level+': '+
    Math.max(0,base+Math.max(0,level-1)*growth);
  }
  open(){
   if(this.b.playBridge?.active)return false;
   this.b.skillEditor?.close();this.b.prefabEditor?.close();
   this.refreshCharacters();this.panel.hidden=false;
   this.loadForm();return true;
  }
  close(){this.panel.hidden=true;return true;}
  toggle(){return this.panel.hidden?this.open():this.close();}
  save(){
   if(this.b.playBridge?.active)return false;
   try{
    const {character,slot}=this.selected();
    if(character!=='player'&&!this.b.prefabEditor?.registry.get(character))
     throw new Error('Сначала сохрани персонажа в Prefab Editor.');
    const validated=this.catalog.set(character,slot,this.read());
    // Use this hero's authored skill icon on the mobile skill button.
    // Do not alter location, size or other personally arranged HUD settings.
    if(character==='player'&&this.b.skillEditor?.layout){
     const ui=this.b.skillEditor;
     ui.layout=ui.schema.update(ui.layout,slot,{
      icon:validated.icon,image:validated.iconImage,
      label:[...validated.name].slice(0,16).join(''),enabled:true
     });
     ui.render();
    }
    this.write(validated);
    this.b.markProjectDirty?.();
    this.status('✅ Навык настроен: '+validated.name+
     '. Сила: '+PhoenixSkills.power(validated)+
     '. Для записи проекта нажми верхнюю 💾 Сохранить.');
    return true;
   }catch(err){this.status('Ошибка навыка: '+err.message);return false;}
  }
  remove(){
   if(this.b.playBridge?.active)return false;
   const {character,slot}=this.selected();
   const result=this.catalog.remove(character,slot);
   if(result){this.write(null);this.b.markProjectDirty?.();}
   this.status(result?'Навык удалён из слота.':'Слот пуст.');return result;
  }
  levelUp(){
   if(this.b.playBridge?.active)return false;
   const s=this.read();
   if(s.level>=s.maxLevel){this.status('Достигнут максимальный уровень.');return false;}
   this.el('skillDefLevel').value=String(s.level+1);
   this.preview();
   this.status('Уровень повышен. Нажми «Сохранить навык».');
   return true;
  }
  serialize(){return this.catalog.serialize();}
  loadFromProject(raw){
   const next=new PhoenixSkills.Catalog();
   if(raw!==undefined&&raw!==null)next.load(raw);
   this.catalog=next;this.refreshCharacters();this.loadForm();
  }
  startPlay(){
   this.runtime=new PhoenixSkills.Runtime(this.catalog,'player',100);
   this.close();
  }
  stopPlay(){this.runtime=null;}
  resetPlay(){this.startPlay();}
  cast(slot,time,canApply){
   if(!this.runtime)return {ok:false,reason:'edit'};
   return this.runtime.cast(slot,time,canApply);
  }
 }
 return PhoenixSkillDefinitionEditor;
});
