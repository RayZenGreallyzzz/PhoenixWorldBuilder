/* Phoenix Engine 2.1 minimap presentation; read-only world renderer.
 * The same map and settings work in Builder preview and standalone PLAY.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixMinimapEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class Editor{
  constructor(builder,doc){
   this.b=builder;this.doc=doc||document;
   this.settings=PhoenixMinimap.defaults();
   this.panel=this.el('phoenixMinimapSettings');
   this.box=this.el('phoenixMinimapHud');
   this.canvas=this.el('phoenixMinimapCanvas');
   this.context=this.canvas?.getContext('2d')||null;
   this.active=false;this.elapsed=0;this.manualVisible=true;
   this.presets=Object.freeze({
    rpg:{shape:'circle',position:'top-left',size:175,range:160},
    mmo:{shape:'square',position:'top-right',size:190,range:250},
    cyber:{shape:'hex',position:'bottom-right',size:180,range:130},
    shooter:{shape:'rounded',position:'top-left',size:165,range:80}
   });
   this.bind();this.updateLayout();this.syncForm();
  }
  el(id){return this.doc.getElementById(id)}
  bind(){
   this.el('btnPhoenixMinimap')?.addEventListener('click',()=>this.toggle());
   this.el('btnMinimapClose')?.addEventListener('click',()=>this.close());
   this.el('btnMinimapApply')?.addEventListener('click',()=>this.save());
   for(const btn of this.doc.querySelectorAll?.('[data-map-preset]')||[])
    btn.addEventListener('click',()=>this.applyPreset(btn.dataset.mapPreset));
   this.el('btnMinimapPreview')?.addEventListener('click',()=>{
    this.manualVisible=!this.manualVisible;this.updateLayout();
   });
   this.el('btnPhoenixPlayMap')?.addEventListener('click',()=>{
    this.manualVisible=!this.manualVisible;this.updateLayout();
   });
   for(const name of ['Shape','Position','Size','Range','ShowTerrain',
    'ShowBuildings','ShowCompass']){
    const input=this.el('phoenixMap'+name);
    input?.addEventListener('change',()=>{
     // Preview can be changed before saving; project remains unchanged
     // until the developer explicitly presses Apply.
     try{
      const proposed=this.readForm();
      this.updateLayout(proposed);this.render(proposed);
      this.selectPreset(null);
     }catch(error){this.status(error.message)}
    });
   }
  }
  selectPreset(id){
   for(const btn of this.doc.querySelectorAll?.('[data-map-preset]')||[]){
    const active=!!id&&btn.dataset.mapPreset===id;
    btn.setAttribute('aria-pressed',active?'true':'false');
    btn.classList.toggle('selected',active);
   }
  }
  applyPreset(id){
   if(this.b.playBridge?.active)return false;
   const preset=this.presets[id];if(!preset)return false;
   for(const [key,val] of Object.entries(preset)){
    const selector='phoenixMap'+key[0].toUpperCase()+key.slice(1);
    const input=this.el(selector);if(input)input.value=String(val);
   }
   try{
    const p=this.readForm();
    this.manualVisible=true;this.updateLayout(p);this.render(p);
    this.selectPreset(id);
    this.status('✅ Шаблон '+id.toUpperCase()+
     ' выбран: '+p.shape+', '+p.range+
     ' м. Нажми «💾 Сохранить карту», чтобы записать в проект.');
    return true;
   }catch(error){this.status('⚠ '+error.message);return false}
  }
  status(message){const e=this.el('phoenixMinimapStatus');if(e)e.textContent=message}
  open(){
   if(this.b.playBridge?.active)return false;
   this.b.prefabEditor?.close?.();this.b.skillDefinitionEditor?.close?.();
   this.b.progressionEditor?.close?.();this.b.galleryEditor?.close?.();
   this.b.worldEditor?.close?.();
   this.panel.hidden=false;this.manualVisible=true;
   this.syncForm();this.updateLayout();this.render();
   return true;
  }
  close(){this.panel.hidden=true;this.updateLayout();return true}
  toggle(){return this.panel.hidden?this.open():this.close()}
  readForm(){
   return PhoenixMinimap.normalize({shape:this.el('phoenixMapShape').value,
    position:this.el('phoenixMapPosition').value,
    size:Number(this.el('phoenixMapSize').value),
    range:Number(this.el('phoenixMapRange').value),
    showTerrain:this.el('phoenixMapShowTerrain').checked,
    showBuildings:this.el('phoenixMapShowBuildings').checked,
    showCompass:this.el('phoenixMapShowCompass').checked});
  }
  syncForm(){
   const p=this.settings;for(const [k,value] of Object.entries({
    Shape:p.shape,Position:p.position,Size:p.size,Range:p.range
   })){const e=this.el('phoenixMap'+k);if(e)e.value=String(value)}
   for(const [k,value] of Object.entries({
    ShowTerrain:p.showTerrain,ShowBuildings:p.showBuildings,
    ShowCompass:p.showCompass
   })){const e=this.el('phoenixMap'+k);if(e)e.checked=value}
   const matching=Object.entries(this.presets).find(([,v])=>
    Object.entries(v).every(([k,value])=>p[k]===value));
   this.selectPreset(matching?.[0]||null);
  }
  save(){
   if(this.b.playBridge?.active)return false;
   try{
    this.settings=this.readForm();this.b.markProjectDirty?.();
    this.syncForm();this.updateLayout();this.render();
    this.status('✅ Мини-карта сохранена в проект. Нажми верхнюю 💾 Сохранить.');
    return true;
   }catch(error){this.status('⚠ '+error.message);return false}
  }
  updateLayout(p=this.settings){
   if(!this.box||!this.canvas)return;
   const visible=this.manualVisible&&(this.b.playBridge?.active||
    (this.panel&&!this.panel.hidden));
   this.box.hidden=!visible;
   const s=p.size;
   this.box.style.width=s+'px';this.box.style.height=s+'px';
   this.box.dataset.position=p.position;
   this.box.dataset.shape=p.shape;
   if(this.canvas.width!==s||this.canvas.height!==s){
    this.canvas.width=s;this.canvas.height=s;
   }
  }
  snapshot(){
   const b=this.b,world=b.worldEditor?.state||{width:128,depth:128,tiles:[]};
   const player=b.player?.position||{x:0,z:0};
   const objects=[];
   for(const entry of (b.entries||[])){
    const pos=entry.root?.position;
    if(!pos)continue;
    const raw=entry.sizeCm;
    const w=raw?.x??raw?.width;
    const d=raw?.z??raw?.depth;
    objects.push({x:pos.x,z:pos.z,hidden:!!entry.hidden,
     category:entry.category||'',width:Number(w)>0?Number(w)/100:2,
     depth:Number(d)>0?Number(d)/100:2});
   }
   const mobs=[];
   for(const [id,render] of b.prefabEditor?.rendered||[]){
    const m=b.prefabEditor.combat?.get?.(id);
    const c=b.prefabEditor.world.getComponent(id,'character')||{};
    const preset=b.prefabEditor.registry.get(
     b.prefabEditor.world.getComponent(id,'prefab')?.id);
    mobs.push({id,x:render.root.position.x,z:render.root.position.z,
     type:preset?.type||c.type||'mob',faction:c.faction||preset?.faction||'enemy',
     engagement:c.ai?.engagement||preset?.ai?.engagement||'auto',
     mode:c.ai?.mode||preset?.ai?.mode||'idle',
     provoked:(render.aiState?.provoked||0)>0,
     boss:preset?.type==='boss',dead:!!m?.dead});
   }
   // Avoid sampling outside the original terrain extents.
   const height=b.worldEditor?.heightAt?.bind(b.worldEditor);
   return {world,player:{x:player.x,z:player.z,
    yaw:b.player?.rotation?.y||0},heightAt:height,buildings:objects,mobs};
  }
  render(p=this.settings){
   if(!this.context||!this.box||this.box.hidden)return;
   const normalized=PhoenixMinimap.normalize(p);
   this.updateLayout(normalized);
   PhoenixMinimap.draw(this.context,this.snapshot(),normalized);
  }
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   const preview=!!this.panel&&!this.panel.hidden;
   const playing=!!this.b.playBridge?.active;
   if(!playing&&!preview){if(this.box&&!this.box.hidden)this.updateLayout();return}
   if(this.box?.hidden)this.updateLayout();
   this.elapsed+=Math.min(.1,dt);
   if(this.elapsed<.22)return;
   this.elapsed=0;
   try{this.render(preview?this.readForm():this.settings)}
   catch(error){this.status('⚠ Карта: '+error.message)}
  }
  serialize(){return PhoenixMinimap.normalize(this.settings)}
  loadFromProject(raw){
   try{this.settings=PhoenixMinimap.normalize(raw)}
   catch(error){console.warn('Invalid minimap project',error);
    this.settings=PhoenixMinimap.defaults()}
   this.manualVisible=true;this.syncForm();this.updateLayout();
  }
 }
 return Editor;
});
