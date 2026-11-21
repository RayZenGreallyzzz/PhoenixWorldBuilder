/* Phoenix Skill HUD Editor 1.1 — MOBA-style visual control layout and PNG/WebP picker.
 * Independent of 3D objects and renderer; project JSON + local preferences.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixSkillEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const BUTTONS={
  attack:'btnPhoenixAttack',heal:'btnPhoenixHeal',
  slot3:'btnPhoenixSlot3',slot4:'btnPhoenixSlot4',
  slot5:'btnPhoenixSlot5',ultimate:'btnPhoenixUltimate',
  slot6:'btnPhoenixSlot6',slot7:'btnPhoenixSlot7',
  fire:'btnPhoenixFire',aim:'btnPhoenixAim',reload:'btnPhoenixReload',
  jump:'btnPhoenixJump',crouch:'btnPhoenixCrouch'
 };
 class PhoenixSkillEditor{
  constructor(builder,doc){
   if(!builder||!globalThis.PhoenixSkillLayout)
    throw new Error('Skill HUD schema and Builder required');
   this.builder=builder;this.doc=doc||document;this.schema=globalThis.PhoenixSkillLayout;
   this.layer=this.get('phoenixSkillLayer');
   this.panel=this.get('phoenixSkillEditor');
   this.select=this.get('phoenixSkillSelect');
   if(!this.layer||!this.panel||!this.select)
    throw new Error('Missing Skill HUD editor UI');
   this.buttons={};this.drag=null;this.editing=false;this.playing=false;
   this.imageRequestToken=0;
   this.layout=this.restoreLocal();
   for(const id of this.schema.IDS){
    const btn=this.get(BUTTONS[id]);
    if(!btn)throw new Error('Missing skill button '+id);
    this.buttons[id]=btn;
    btn.addEventListener('pointerdown',e=>this.dragStart(id,e));
    btn.addEventListener('pointermove',e=>this.dragMove(id,e));
    for(const type of ['pointerup','pointercancel','lostpointercapture'])
     btn.addEventListener(type,e=>this.dragEnd(id,e));
   }
   this.buttons.heal.addEventListener('click',()=>{
    if(this.playing&&!this.editing)this.builder.playBridge?.heal();
   });
   for(const id of ['slot3','slot4','slot5','ultimate','slot6','slot7','fire','aim','reload','jump','crouch']){
    this.buttons[id].addEventListener('click',()=>{
     if(!this.playing||this.editing)return;
     const bridge=this.builder.playBridge;
     if(id==='fire')return bridge?.fire?.();
     if(id==='aim')return bridge?.aim?.();
     if(id==='reload')return bridge?.reload?.();
     if(['slot3','slot4','slot5','slot6','slot7','ultimate'].includes(id))
      return bridge?.castSkill?.(id);
     const msg=this.get('phoenixCombatNotice');
     if(msg)msg.textContent='🎮 Прыжок и приседание пока в разработке.';
    });
   }
   this.get('btnPhoenixSkills')?.addEventListener('click',()=>this.toggle());
   this.get('btnSkillClose')?.addEventListener('click',()=>this.close());
   this.get('btnSkillSave')?.addEventListener('click',()=>this.save());
   this.get('btnSkillReset')?.addEventListener('click',()=>this.reset());
   const imageInput=this.get('phoenixSkillImageFile');
   this.get('btnSkillImagePick')?.addEventListener('click',()=>{
    if(imageInput){imageInput.value='';imageInput.click();}
   });
   imageInput?.addEventListener('change',()=>{
    if(imageInput.files?.[0])this.importImage(imageInput.files[0]);
   });
   this.get('btnSkillImageRemove')?.addEventListener('click',()=>this.removeImage());
   this.get('btnSkillApplyPreset')?.addEventListener('click',()=>this.applyPreset(
    this.get('phoenixSkillPreset').value));
   this.select.addEventListener('change',()=>this.loadForm());
   for(const id of ['phoenixSkillIcon','phoenixSkillLabel','phoenixSkillSize',
    'phoenixSkillColor','phoenixSkillShape','phoenixSkillOpacity','phoenixSkillEnabled']){
    const input=this.get(id);
    input?.addEventListener('input',()=>this.updateFromForm());
    input?.addEventListener('change',()=>this.updateFromForm());
   }
   this.select.value='attack';
   this.loadForm();this.render();
  }
  get(id){return this.doc.getElementById(id)}
  restoreLocal(){
   try {
    const stored=localStorage.getItem('phoenix-engine-skill-hud-v1');
    if(stored)return this.schema.validate(JSON.parse(stored));
   }catch(e){console.warn('Skill HUD: resetting invalid local layout',e)}
   return this.schema.defaultLayout();
  }
  current(){return this.layout.slots.find(s=>s.id===this.select.value)||this.layout.slots[0]}
  loadForm(){
   const s=this.current();
   const values={
    phoenixSkillIcon:s.icon,phoenixSkillLabel:s.label,
    phoenixSkillSize:String(s.size),phoenixSkillColor:s.color,
    phoenixSkillShape:s.shape,phoenixSkillOpacity:String(Math.round(s.opacity*100))
   };
   for(const [key,value] of Object.entries(values))this.get(key).value=value;
   this.get('phoenixSkillEnabled').checked=s.enabled;
   const preview=this.get('phoenixSkillImagePreview');
   if(preview){preview.hidden=!s.image;preview.src=s.image||'';}
   this.describe();
  }
  describe(message){
   const node=this.get('phoenixSkillFeedback');
   if(!node)return;
   const id=this.current().id;
   const functionality={
    attack:'⚔ Рабочая атака, связана с боевой системой.',
    heal:'💚 Рабочее лечение: +30 HP, перезарядка 12 секунд.',
    slot3:'✨ Резервная кнопка — пока без игрового действия.',
    slot4:'🌀 Резервная кнопка — пока без игрового действия.',
    slot5:'🌟 Резервная кнопка — пока без игрового действия.',
    ultimate:'🔥 Ульта пока не подключена к игровой механике.',
    slot6:'💠 Резервный слот MMO: навык назначим в Skill Editor.',
    slot7:'🌙 Резервный слот MMO: навык назначим в Skill Editor.',
    fire:'🔫 Кнопка стрельбы для будущей системы оружия. Сейчас не стреляет.',
    aim:'🎯 Прицеливание будет добавлено с механикой оружия.',
    reload:'🔄 Перезарядка появится с системой оружия и боезапаса.',
    jump:'⬆️ Прыжок — пока кнопка интерфейса, без действия.',
    crouch:'🧎 Присесть — пока кнопка интерфейса, без действия.'
   };
   node.textContent=message||'Перетаскивай кнопку пальцем. '+functionality[id];
  }
  async importImage(file){
   const slot=this.current().id,token=++this.imageRequestToken;
   try{
    const image=await globalThis.PhoenixSkillImages.fromFile(file,this.doc);
    if(token!==this.imageRequestToken||slot!==this.current().id)return false;
    this.layout=this.schema.update(this.layout,slot,{image,enabled:true});
    this.loadForm();this.render();
    this.describe('🖼 Картинка загружена. Нажми «Сохранить раскладку».');
    return true;
   }catch(error){this.describe('Не удалось загрузить PNG/WebP: '+error.message);return false;}
  }
  removeImage(){
   this.imageRequestToken++;
   this.layout=this.schema.update(this.layout,this.current().id,{image:''});
   this.loadForm();this.render();
   this.describe('Картинка удалена. Нажми «Сохранить раскладку».');
  }
  updateFromForm(){
   const id=this.current().id;
   const changed={
    icon:this.get('phoenixSkillIcon').value,
    label:this.get('phoenixSkillLabel').value,
    size:Number(this.get('phoenixSkillSize').value),
    color:this.get('phoenixSkillColor').value,
    shape:this.get('phoenixSkillShape').value,
    opacity:Number(this.get('phoenixSkillOpacity').value)/100,
    enabled:this.get('phoenixSkillEnabled').checked
   };
   try{
    this.layout=this.schema.update(this.layout,id,changed);
    this.render();this.describe();
   }catch(error){this.describe('Проверь данные: '+error.message)}
  }
  open(){
   if(this.builder.playBridge?.active)return false;
   this.builder.prefabEditor?.close();this.builder.skillDefinitionEditor?.close();
   this.editing=true;this.panel.hidden=false;
   this.doc.body.classList.add('phoenixSkillEditing');
   this.layer.hidden=false;
   this.loadForm();this.render();return true;
  }
  close(){
   if(!this.editing)return false;
   this.drag=null;this.editing=false;this.panel.hidden=true;
   this.doc.body.classList.remove('phoenixSkillEditing');
   this.render();return true;
  }
  toggle(){return this.editing?this.close():this.open()}
  setPlaying(value){
   this.playing=!!value;
   if(this.playing)this.close();
   this.render();
  }
  dragStart(id,event){
   if(!this.editing)return;
   event.preventDefault();
   this.select.value=id;this.loadForm();
   this.drag={id,pointerId:event.pointerId};
   this.buttons[id].setPointerCapture?.(event.pointerId);
  }
  dragMove(id,event){
   if(!this.editing||this.drag?.id!==id||this.drag.pointerId!==event.pointerId)return;
   event.preventDefault();
   const width=Math.max(1,window.innerWidth),height=Math.max(1,window.innerHeight);
   const s=this.layout.slots.find(s=>s.id===id);
   const marginX=Math.max(5,s.size/2/width*100);
   const marginY=Math.max(8,s.size/2/height*100);
   const x=Math.max(marginX,Math.min(100-marginX,event.clientX/width*100));
   const y=Math.max(marginY,Math.min(100-marginY,event.clientY/height*100));
   this.layout=this.schema.update(this.layout,id,{x,y});
   this.render();
  }
  dragEnd(id,event){
   if(this.drag?.id!==id||this.drag.pointerId!==event.pointerId)return;
   this.drag=null;
   this.describe('Положение изменено. Нажми «Сохранить раскладку».');
  }
  render(){
   this.layer.hidden=!(this.editing||this.playing);
   for(const s of this.layout.slots){
    const button=this.buttons[s.id];
    button.hidden=!(s.enabled||(this.editing&&this.select.value===s.id));
    button.style.left=s.x+'%';
    button.style.top=s.y+'%';
    button.style.width=s.size+'px';
    button.style.height=s.size+'px';
    button.style.opacity=String(s.opacity);
    button.style.backgroundColor=s.color;
    button.style.borderRadius=s.shape==='circle'?'50%':'18px';
    button.classList.toggle('phoenixSkillDisabled',!s.enabled);
    button.classList.toggle('phoenixSkillSelected',this.editing&&this.select.value===s.id);
    button.setAttribute('aria-label',s.label+' — '+s.id);
    const icon=this.doc.createElement(s.image?'img':'span');
    if(s.image){
     icon.className='phoenixSkillPicture';
     icon.src=s.image;
     icon.alt='';
     icon.draggable=false;
    }else{
     icon.className='phoenixSkillIcon';icon.textContent=s.icon;
    }
    const label=this.doc.createElement('small');
    label.className='phoenixSkillCaption';label.textContent=s.label;
    button.replaceChildren(icon,label);
   }
  }
  serialize(){return this.schema.validate(this.layout)}
  loadFromProject(raw){
   if(raw!==null&&raw!==undefined){
    try{this.layout=this.schema.validate(raw)}
    catch(error){
     console.warn('Invalid skill HUD in project, using device preferences',error);
     this.layout=this.restoreLocal();
    }
   }else this.layout=this.restoreLocal();
   this.loadForm();this.render();
  }
  save(){
   this.updateFromForm();
   const data=this.serialize();
   try{localStorage.setItem('phoenix-engine-skill-hud-v1',JSON.stringify(data))}
   catch(error){console.warn('Cannot save skill preferences locally',error)}
   this.builder.save?.();
   this.describe('✅ Раскладка сохранена в настройках и проекте.');
   return data;
  }
  applyPreset(name){
   // Only changes the HUD layout; saving remains explicit and user-controlled.
   // Layout preset changes button positions but never destroys imported icons.
   const existingImages=new Map(this.layout.slots.map(s=>[s.id,s.image]));
   this.layout=this.schema.presetLayout(name);
   this.layout.slots=this.layout.slots.map(s=>({
    ...s,image:existingImages.get(s.id)||''
   }));
   this.loadForm();this.render();
   this.describe('✅ Раскладка '+(
    name==='moba'?'MOBA':name==='mmorpg'?'MMORPG':
    name==='shooter'?'Шутер':'Классическая'
   )+' применена. Подстрой пальцем и нажми «Сохранить раскладку».');
   return this.serialize();
  }
  reset(){
   this.layout=this.schema.presetLayout('classic');this.loadForm();this.render();
   this.save();
   this.describe('↻ Восстановлена раскладка по умолчанию.');
  }
 }
 return PhoenixSkillEditor;
});
