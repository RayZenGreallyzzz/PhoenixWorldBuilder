/* Phoenix Engine — optional no-code RPG progression laboratory.
 * Reads/saves character profiles independently of GLB, skills and building.
 * Only the top-level Builder Save persists the authored project to Android.
 */
(function(root,factory){
 'use strict';const result=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=result;
 if(root)root.PhoenixProgressionEditor=result;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const LABELS=Object.freeze({
  hp:'❤️ HP',mp:'🔵 MP',
  damage:'⚔ Физ. урон',magicPower:'🔮 Магическая сила',
  defense:'🛡 Защита',magicDefense:'✨ Маг. защита',
  speed:'🏃 Скорость движения',attackSpeed:'⚡ Атак/сек',
  critChance:'🎯 Шанс крита (0–0.95)',critMultiplier:'💥 Множитель крита',
  accuracy:'👁 Точность (%)',dodge:'🌀 Уклонение (%)',
  armorPen:'🗡 Пробитие брони',magicPen:'⚡ Пробитие маг. защиты'
 });
 class Editor{
  constructor(builder,documentRef){
   this.b=builder;this.doc=documentRef||document;
   this.panel=this.el('phoenixProgressionEditor');
   this.player=null;
   this.fields=new Map();
   if(!this.panel)return;
   this.initFields();this.bind();this.refreshTargets();this.loadTarget();
  }
  el(id){return this.doc.getElementById(id);}
  option(value,title){
   const node=this.doc.createElement('option');
   node.value=value;node.textContent=title;return node;
  }
  notice(message){
   const el=this.el('progressionStatus');if(el)el.textContent=message;
  }
  initFields(){
   const root=this.el('progressionStatsFields');
   if(!root)return;
   root.replaceChildren();
   for(const key of PhoenixProgression.KEYS){
    const row=this.doc.createElement('div');row.className='phoenixProgressionStat';
    const title=this.doc.createElement('b');title.textContent=LABELS[key]||key;
    row.appendChild(title);
    const controls={};
    for(const [field,label] of [['base','База (ур. 1)'],
     ['growth','За уровень'],['quadratic','Ускорение × ур²']]){
     const wrap=this.doc.createElement('label');
     wrap.textContent=label;
     const input=this.doc.createElement('input');
     input.type='number';input.step='any';input.inputMode='decimal';
     input.min=field==='base'?String(PhoenixProgression.STATS[key].min):'0';
     input.max=field==='base'?String(PhoenixProgression.STATS[key].max):
      field==='growth'?'10000':'100';
     input.setAttribute('aria-label',(LABELS[key]||key)+' · '+label);
     input.dataset.progressionStat=key;
     input.dataset.progressionField=field;
     wrap.appendChild(input);row.appendChild(wrap);controls[field]=input;
    }
    root.appendChild(row);this.fields.set(key,controls);
   }
  }
  bind(){
   const on=(id,event,action)=>this.el(id)?.addEventListener(event,action);
   on('btnPhoenixProgression','click',()=>this.toggle());
   on('btnProgressionClose','click',()=>this.close());
   on('btnProgressionPreset','click',()=>this.applyPreset());
   on('btnProgressionPreview','click',()=>this.preview());
   on('btnProgressionSave','click',()=>this.save());
   on('btnProgressionClear','click',()=>this.clear());
   on('progressionTarget','change',()=>this.loadTarget());
   for(const id of ['progressionDamageType','progressionDefender'])
    on(id,'change',()=>this.preview());
  }
  refreshTargets(){
   const select=this.el('progressionTarget');if(!select)return;
   const previous=select.value||'player';
   select.replaceChildren(this.option('player','🧍 Игрок / мой герой'));
   for(const prefab of this.b.prefabEditor?.registry.list()||[])
    select.appendChild(this.option(prefab.id,
     (prefab.type==='npc'?'🧑 ':'🐺 ')+prefab.name));
   select.value=[...select.options].some(o=>o.value===previous)?previous:'player';
  }
  currentTarget(){return this.el('progressionTarget')?.value||'player';}
  existing(target=this.currentTarget()){
   return target==='player'?this.player:
    this.b.prefabEditor?.registry.get(target)?.progression||null;
  }
  open(){
   if(this.b.playBridge?.active||!this.panel)return false;
   this.b.prefabEditor?.close();
   this.b.skillEditor?.close();
   this.b.skillDefinitionEditor?.close();
   this.b.worldEditor?.close?.();
   this.refreshTargets();this.loadTarget();
   this.panel.hidden=false;return true;
  }
  close(){if(this.panel)this.panel.hidden=true;return true;}
  toggle(){return this.panel?.hidden?this.open():this.close();}
  loadTarget(){
   const target=this.currentTarget(),saved=this.existing(target);
   let profile;
   try{profile=PhoenixProgression.normalize(saved||
     PhoenixProgression.preset('warrior'))}
   catch(error){
    this.notice('⚠ Профиль повреждён, загружен черновик: '+error.message);
    profile=PhoenixProgression.preset('warrior');
   }
   this.write(profile);
   this.notice(saved?'✅ Профиль уже создан. Можно менять цифры и смотреть уровни.':
    'Профиль ещё не создан. Экспериментируй: в проект запишется только после «Применить».');
   this.preview();
  }
  write(profile){
   if(!this.panel)return;
   const p=PhoenixProgression.normalize(profile);
   for(const [id,value] of [
    ['progressionArchetype',p.archetype],['progressionTags',p.tags.join(',')],
    ['progressionLevel',p.level],['progressionMaxLevel',p.maxLevel],
    ['progressionXpMultiplier',p.xpMultiplier]]){
    const el=this.el(id);if(el)el.value=String(value);
   }
   for(const key of PhoenixProgression.KEYS){
    const inputs=this.fields.get(key);
    if(!inputs)continue;
    for(const field of ['base','growth','quadratic'])
     inputs[field].value=String(p[field][key]);
   }
  }
  read(){
   const text=id=>this.el(id)?.value;
   const data={
    version:PhoenixProgression.VERSION,
    archetype:text('progressionArchetype')||'warrior',
    tags:(text('progressionTags')||'').split(',').map(s=>s.trim().toLowerCase())
     .filter(Boolean),
    level:Number(text('progressionLevel')),
    maxLevel:Number(text('progressionMaxLevel')),
    xpMultiplier:Number(text('progressionXpMultiplier')),
    base:{},growth:{},quadratic:{}
   };
   for(const key of PhoenixProgression.KEYS){
    const row=this.fields.get(key);
    for(const name of ['base','growth','quadratic']){
     const input=row?.[name];
     if(!input||!input.value.trim())throw new Error('Заполни '+(LABELS[key]||key)+': '+name);
     data[name][key]=Number(input.value);
    }
   }
   return PhoenixProgression.normalize(data);
  }
  applyPreset(){
   if(this.b.playBridge?.active)return false;
   const archetype=this.el('progressionArchetype')?.value||'warrior';
   try{
    this.write(PhoenixProgression.preset(archetype));
    this.preview();
    this.notice('✨ Параметры '+PhoenixProgression.ARCHETYPES[archetype].title+
     ' применены только к черновику. Теперь можно изменить любые цифры.');
    return true;
   }catch(error){this.notice('Ошибка шаблона: '+error.message);return false}
  }
  preview(){
   const output=this.el('progressionPreview');if(!output)return false;
   let p;
   try{p=this.read()}catch(error){
    output.textContent='⚠ Ошибка параметров: '+error.message;return false;
   }
   const kind=this.el('progressionDamageType')?.value||'physical';
   const comparison=this.el('progressionDefender')?.value||'same';
   const sample=PhoenixProgression.compare(p);
   const lines=['Формула: база + прирост × (ур−1) + ускорение × (ур−1)²',
    'Ур. | HP | MP | Урон | Магия | Защита | Скорость | DPS* | XP→след.'];
   for(const row of sample){
    // The target is either an equal-level warrior or the same fixed level-1
    // warrior with 50 armor, so results are reproducible and easy to balance.
    const enemy=PhoenixProgression.atLevel(PhoenixProgression.preset('warrior'),
     comparison==='same'?Math.min(150,row.level):1);
    if(comparison==='fixed'){enemy.defense=50;enemy.magicDefense=50;}
    const hit=PhoenixProgression.damage(row,enemy,{type:kind});
    const show=n=>Number(n).toFixed(Number.isInteger(n)?0:1);
    lines.push([row.level,show(row.hp),show(row.mp),show(row.damage),
     show(row.magicPower),show(row.defense),show(row.speed),
     show(hit.dps),row.xpToNext].join(' | '));
   }
   lines.push('* DPS — математическое ожидание с учётом точности, крита и брони.');
   lines.push('В PLAY HP, базовый урон, скорость и защита берутся из профиля;');
   lines.push('симуляция вероятностей критов/уклонений пока служит балансировке.');
   output.textContent=lines.join('\n');return true;
  }
  save(){
   if(this.b.playBridge?.active)return false;
   let profile;
   try{
    profile=this.read();
    const target=this.currentTarget();
    if(target==='player')this.player=profile;
    else{
     const p=this.b.prefabEditor?.registry.get(target);
     if(!p)throw new Error('Сначала создай шаблон моба/NPC');
     this.b.prefabEditor.registry.update(target,{...p,progression:profile});
    }
    this.b.markProjectDirty?.();
    this.notice('✅ Формула записана для '+(target==='player'?'героя':target)+
     '. Никакие GLB и навыки не удалены. Для записи на Android нажми верхнюю 💾 Сохранить.');
    return true;
   }catch(error){this.notice('Ошибка профиля: '+error.message);return false;}
  }
  clear(){
   if(this.b.playBridge?.active)return false;
   const target=this.currentTarget();
   if(target==='player')this.player=null;
   else{
    const prefab=this.b.prefabEditor?.registry.get(target);
    if(!prefab)return false;
    this.b.prefabEditor.registry.update(target,{...prefab,progression:null});
   }
   this.b.markProjectDirty?.();this.loadTarget();
   this.notice('↺ Убрана формула прогрессии, исходные фиксированные характеристики сохранены. Нажми верхнюю 💾 Сохранить.');
   return true;
  }
  serializePlayer(){return this.player?PhoenixProgression.normalize(this.player):null;}
  loadPlayer(raw){
   this.player=raw?PhoenixProgression.normalize(raw):null;
   // A different world can share the same class formula but must never
   // inherit the previous world's temporary PLAY experience.
   if(this.b.playBridge){
    this.b.playBridge.progressionSession=null;
    this.b.playBridge.progressionSignature='';
    this.b.playBridge.playerRuntimeStats=null;
    this.b.playBridge.playerActiveCombat=null;
   }
   if(this.panel){this.refreshTargets();this.loadTarget()}
  }
  playerStats(){
   return this.player?PhoenixProgression.atLevel(this.player,this.player.level):null;
  }
  playerCombat(base){
   const stats=this.playerStats();
   if(!stats)return null;
   return {...base,hp:Math.round(stats.hp),damage:stats.damage,
    cooldown:Math.max(.06,Math.min(10,1/stats.attackSpeed))};
  }
 }
 return Editor;
});
