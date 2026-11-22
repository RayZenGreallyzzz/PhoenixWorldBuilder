/* Phoenix Engine portable server selection and guest online-room client.
 * Network state is PLAY-only. No multiplayer avatars become building objects.
 * Server addresses (not passwords) are stored locally and can be switched.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixNetworkEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const Foundation=(typeof globalThis!=='undefined'&&globalThis.PhoenixNetworkFoundation)||
  (typeof require==='function'?require('../core/phoenix-network-foundation.js'):null);
 const STORAGE='phoenix-server-profiles-v1',MAX_PROFILES=Foundation.MAX_PROFILES;
 const defaults=Foundation.defaults,serverUrl=Foundation.endpoint;
 const validConfig=Foundation.normalize;
 class NetworkEditor{
  constructor(builder,doc){
   this.b=builder;this.doc=doc||document;
   this.panel=this.el('phoenixServerPanel');
   this.profiles=[];this.selected='';
   this.socket=null;this.joined=false;this.playerId='';
   this.remote=new Map();this.moveElapsed=0;
   this.session=0;this.lastSent=null;this.serverCapabilities=null;
   this.layer=typeof THREE!=='undefined'?new THREE.Group():null;
   if(this.layer){this.layer.name='phoenix:other-online-players';
    this.layer.visible=false;this.b.scene?.add(this.layer)}
   this.restoreProfiles();this.bind();this.renderProfiles();
  }
  el(id){return this.doc.getElementById(id)}
  status(text){const el=this.el('phoenixServerStatus');if(el)el.textContent=text}
  players(text){const el=this.el('phoenixServerPlayers');if(el)el.textContent=text}
  option(value,text){
   const el=this.doc.createElement('option');el.value=value;el.textContent=text;return el;
  }
  restoreProfiles(){
   try{
    const data=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!data||!Array.isArray(data.profiles)||data.profiles.length>MAX_PROFILES)return;
    // Keep the existing v1 local profiles; corrupt items cannot stop startup.
    const safe=data.profiles.filter(p=>{
     try{Foundation.portable({selected:'',profiles:[p]});return true}
     catch{return false}
    });
    const restored=Foundation.portable({selected:data.selected,profiles:safe});
    this.profiles=restored.profiles;this.selected=restored.selected;
   }catch{/* No stored profiles, use defaults. */}
  }
  persist(){
   try{localStorage.setItem(STORAGE,JSON.stringify({
    selected:this.selected,profiles:this.profiles.slice(0,MAX_PROFILES)}))}
   catch(error){this.status('Не удалось сохранить адрес: '+error.message)}
  }
  renderProfiles(){
   const select=this.el('phoenixServerProfiles');if(!select)return;
   select.replaceChildren(this.option('','— Новое подключение —'));
   for(const p of this.profiles)select.appendChild(this.option(p.id,p.data.name));
   select.value=this.selected;
   this.write(this.profiles.find(p=>p.id===this.selected)?.data||defaults());
  }
  write(c){
   for(const [key,id] of [['name','phoenixServerTitle'],
    ['url','phoenixServerUrl'],['worldId','phoenixServerWorldId'],
    ['nickname','phoenixServerNickname']]){
    const field=this.el(id);if(field)field.value=String(c[key]||'');
   }
   const field=this.el('phoenixServerAutoConnect');
   if(field)field.checked=!!c.autoConnect;
  }
  read(){
   const value=id=>this.el(id)?.value;
   return validConfig({
    name:value('phoenixServerTitle'),url:value('phoenixServerUrl'),
    worldId:value('phoenixServerWorldId'),
    nickname:value('phoenixServerNickname'),
    autoConnect:!!this.el('phoenixServerAutoConnect')?.checked});
  }
  bind(){
   const on=(id,event,action)=>this.el(id)?.addEventListener(event,action);
   on('btnPhoenixServer','click',()=>this.toggle());
   on('btnPhoenixServerClose','click',()=>this.close());
   on('phoenixServerProfiles','change',e=>{
    this.selected=e.target.value;
    this.persist();this.renderProfiles();
    this.status('Выбрано подключение: '+(this.readSafe()?.name||'новое'));
   });
   on('btnPhoenixServerSave','click',()=>this.save());
   on('btnPhoenixServerDelete','click',()=>this.remove());
   on('btnPhoenixServerTest','click',()=>this.test());
   on('btnPhoenixServerExport','click',()=>this.exportWorld());
   on('btnPhoenixServerBackup','click',()=>this.exportProfiles());
   on('btnPhoenixServerImport','click',()=>this.el('phoenixServerImportFile')?.click());
   on('phoenixServerImportFile','change',e=>this.importProfiles(e.target));
  }
  readSafe(){try{return this.read()}catch{return null}}
  open(){
   if(this.b.playBridge?.active)return false;
   this.b.prefabEditor?.close();this.b.skillEditor?.close();
   this.b.skillDefinitionEditor?.close();this.b.progressionEditor?.close();
   this.b.worldEditor?.close?.();
   if(this.panel)this.panel.hidden=false;
   return true;
  }
  close(){if(this.panel)this.panel.hidden=true;return true}
  toggle(){return this.panel?.hidden?this.open():this.close()}
  save(){
   if(this.b.playBridge?.active)return false;
   let data;try{data=this.read()}catch(error){this.status('⚠ '+error.message);return false}
   if(!this.selected){
    if(this.profiles.length>=MAX_PROFILES){
     this.status('Максимум '+MAX_PROFILES+' сохранённых серверов');return false;
    }
    this.selected='server-'+Date.now()+'-'+this.profiles.length;
    this.profiles.push({id:this.selected,data});
   }else{
    const row=this.profiles.find(x=>x.id===this.selected);
    if(row)row.data=data;
    else this.profiles.push({id:this.selected,data});
   }
   this.persist();this.renderProfiles();
   this.status('✅ Подключение сохранено. Сервер можно сменить из списка.');
   return true;
  }
  remove(){
   if(this.b.playBridge?.active||!this.selected)return false;
   this.profiles=this.profiles.filter(p=>p.id!==this.selected);
   this.selected='';this.persist();this.renderProfiles();
   this.status('Подключение удалено только с телефона; сам сервер не затронут.');
   return true;
  }
  async exportProfiles(){
   if(this.b.playBridge?.active)return false;
   try{
    const bundle=Foundation.exportBundle({selected:this.selected,profiles:this.profiles});
    const file=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
    await PhoenixFiles.saveBlob(file,'Phoenix_Server_Connections.json','application/json');
    this.status('📦 Адреса серверов сохранены. Секретов и автоподключения в файле нет.');
    return true;
   }catch(error){this.status('⚠ Ошибка копии: '+error.message);return false}
  }
  async importProfiles(input){
   if(this.b.playBridge?.active)return false;
   const file=input?.files?.[0];if(!file)return false;
   try{
    if(file.size>Foundation.MAX_BYTES)throw Error('Файл больше 64 КБ');
    const parsed=Foundation.importBundle(await file.text());
    const combined=Foundation.merge({selected:this.selected,profiles:this.profiles},parsed);
    this.profiles=combined.profiles;this.selected=combined.selected;
    this.persist();this.renderProfiles();
    this.status('✅ Импортировано подключений: '+parsed.profiles.length+
     '. Автоподключение не включалось.');
    return true;
   }catch(error){this.status('⚠ Ошибка импорта: '+error.message);return false}
   finally{input.value=''}
  }
  showCapabilities(info){
   const label=this.el('phoenixServerCapabilities');
   if(!label)return;
   if(!info?.compatible){
    label.textContent='⚠ Сервер несовместим: требуется протокол Phoenix v1.';
    return;
   }
   label.textContent='✅ Phoenix v'+info.protocol+' · '+info.world+
    ' · Мест: '+(info.maxPlayers||'?')+
    '\\nРаботает: гости, комнаты, позиции, чат, публикация карты.'+
    '\\nВ разработке: регистрация, сохранённые герои, серверный бой, навыки, инвентарь.';
  }
  async test(){
   let cfg;try{cfg=this.read()}catch(e){this.status('⚠ '+e.message);return false}
   const target=serverUrl(cfg.url,cfg.worldId);
   this.status('🔎 Проверяю '+target+' …');
   return await new Promise(resolve=>{
    let ws,finished=false;
    const done=(success,message)=>{
     if(finished)return;finished=true;
     clearTimeout(timer);try{ws?.close()}catch{}
     this.status(message);resolve(success);
    };
    const timer=setTimeout(()=>done(false,'Нет ответа за 7 секунд. Проверь адрес, порт и доступность сети.'),7000);
    try{
     ws=new WebSocket(target);
     ws.onopen=()=>ws.send(JSON.stringify({type:'ping'}));
     ws.onmessage=e=>{
      try{
       const data=JSON.parse(e.data);
       if(data.type==='hello'){
        const info=Foundation.evaluateHello(data);
        this.serverCapabilities=info;this.showCapabilities(info);
        if(!info.compatible)return done(false,info.message);
       }
       if(data.type==='pong'&&data.v===Foundation.PROTOCOL)
        done(true,'✅ Сервер отвечает! Игроков: '+data.players+
         '. Мир: '+data.world?.name);
       if(data.type==='error')done(false,'Ошибка сервера: '+data.code);
      }catch{done(false,'Непонятный ответ сервера')}
     };
     ws.onerror=()=>done(false,'Ошибка подключения. Используй wss:// для интернета.');
     ws.onclose=()=>{if(!finished)done(false,'Сервер закрыл соединение')};
    }catch(error){done(false,'Не удалось подключиться: '+error.message)}
   });
  }
  async exportWorld(){
   if(this.b.playBridge?.active)return false;
   let cfg;try{cfg=this.read()}catch(error){
    this.status('⚠ '+error.message);return false}
   try{
    const revision=Number(this.el('phoenixServerRevision')?.value);
    const title=(this.el('phoenixServerWorldName')?.value||'Phoenix World').trim();
    const p=this.b.player?.position;
    const area=this.b.worldEditor?.state||{};
    const bounds=[Number(area.width)||500,Number(area.depth)||500];
    const pos=p?[p.x,p.y,p.z]:[0,0,0];
    const spawn=Math.abs(pos[0])<=bounds[0]/2&&Math.abs(pos[2])<=bounds[1]/2?
     pos:[0,0,0];
    const exported=PhoenixServerExport.build(this.b.project(),{
     worldId:cfg.worldId,name:title,revision,spawn});
    const blob=new Blob([JSON.stringify(exported,null,2)],{
     type:'application/json'});
    await PhoenixFiles.saveBlob(blob,'PhoenixServer_'+cfg.worldId+
     '_rev'+revision+'.json','application/json');
    this.status('📦 Мир экспортирован: '+exported.objects.length+' строений, '+
     exported.mobs.length+' мобов и '+exported.prefabs.length+
     ' шаблонов. Загрузи JSON на свой сервер с административным ключом.');
    return true;
   }catch(error){
    this.status('Ошибка экспорта сервера: '+error.message);return false;
   }
  }
  async beginPlay(){
   const cfg=this.readSafe();
   if(!cfg?.autoConnect)return false;
   this.disconnect();
   const session=++this.session,uri=serverUrl(cfg.url,cfg.worldId);
   this.status('🌐 Подключаюсь к '+cfg.name+'…');
   let ws;try{ws=new WebSocket(uri)}catch(error){
    this.status('⚠ '+error.message);return false;
   }
   this.socket=ws;
   ws.onopen=()=>{
    if(session!==this.session||!this.b.playBridge?.active){ws.close();return}
    ws.send(JSON.stringify({type:'join',name:cfg.nickname}));
   };
   ws.onmessage=e=>{
    if(session!==this.session||!this.b.playBridge?.active)return;
    let msg;try{msg=JSON.parse(e.data)}catch{return}
    this.message(msg);
   };
   ws.onerror=()=>{if(session===this.session)this.status('⚠ Сервер недоступен')};
   ws.onclose=()=>{
    if(session!==this.session)return;
    this.joined=false;this.playerId='';this.clearRemote();
    this.status('🔴 Нет подключения к Phoenix Server');
   };
   return true;
  }
  message(m){
   if(m?.v!==1||typeof m.type!=='string')return;
   if(m.type==='hello'){
    const info=Foundation.evaluateHello(m);
    this.serverCapabilities=info;this.showCapabilities(info);
    if(!info.compatible){
     this.status('⚠ '+info.message);this.disconnect();return;
    }
    this.status('🟢 Сервер отвечает: '+info.world+
     ' · Phoenix v'+info.protocol+' · Гостевой режим');
    return;
   }
   if(m.type==='joined'){
    this.joined=true;this.playerId=m.playerId;
    this.clearRemote();
    if(this.layer)this.layer.visible=true;
    const self=(m.players||[]).find(p=>p.id===m.playerId);
    if(self&&Array.isArray(self.position)){
     this.b.player?.position?.fromArray?.(self.position);
    }
    for(const p of m.players||[])if(p.id!==m.playerId)this.addRemote(p);
    this.players('👥 Игроков в комнате: '+(m.players?.length||1));
    this.status('🟢 Онлайн: '+(m.world?.name||'мир')+
     ' · Это гостевой тест; аккаунты пока не подключены.');
   }else if(m.type==='player_joined'){
    this.addRemote(m.player);
    this.players('👥 Игроков в комнате: '+(this.remote.size+1));
   }else if(m.type==='player_moved'){
    const entry=this.remote.get(m.playerId);
    if(entry&&Array.isArray(m.position))
     entry.target.fromArray(m.position);
   }else if(m.type==='player_left'){
    this.removeRemote(m.playerId);
    this.players('👥 Игроков в комнате: '+(this.remote.size+1));
   }else if(m.type==='error'){
    this.status('⚠ Сервер: '+String(m.code||'ошибка').slice(0,70));
    if(m.code==='movement-rejected'&&Array.isArray(m.position))
     this.b.player?.position?.fromArray?.(m.position);
   }
  }
  addRemote(p){
   if(!p||typeof p.id!=='string'||!Array.isArray(p.position)||
      this.remote.has(p.id)||!this.layer||typeof THREE==='undefined')return;
   const body=new THREE.Group();body.name='phoenix:remote:'+p.id;
   const geometry=new THREE.CapsuleGeometry(.3,1.1,4,8);
   const material=new THREE.MeshStandardMaterial({color:0x58c7ed,roughness:.85});
   const model=new THREE.Mesh(geometry,material);model.position.y=.85;
   body.add(model);
   // Light, non-GLB proxy for the first networking test. Remote player
   // visuals are NOT copied into construction entries or the saved world.
   const label=document.createElement('canvas');label.width=256;label.height=64;
   const ctx=label.getContext('2d');
   if(ctx){
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#ffffff';ctx.font='bold 24px sans-serif';
    ctx.fillText(String(p.name||'Игрок').slice(0,24),128,32);
    const map=new THREE.CanvasTexture(label);
    const mat=new THREE.SpriteMaterial({map,transparent:true,depthTest:false});
    const text=new THREE.Sprite(mat);text.position.y=2.1;
    text.scale.set(2.8,.7,1);body.add(text);
   }
   body.position.fromArray(p.position);this.layer.add(body);
   this.remote.set(p.id,{root:body,target:new THREE.Vector3(...p.position)});
  }
  removeRemote(id){
   const item=this.remote.get(id);if(!item)return;
   item.root.removeFromParent();
   item.root.traverse(child=>{
    child.geometry?.dispose?.();
    child.material?.map?.dispose?.();
    child.material?.dispose?.();
   });
   this.remote.delete(id);
  }
  clearRemote(){for(const id of [...this.remote.keys()])this.removeRemote(id)}
  update(dt){
   if(!this.b.playBridge?.active||!this.joined)return;
   this.moveElapsed+=dt;
   if(this.moveElapsed>=.12&&this.socket?.readyState===1){
    this.moveElapsed=0;
    const p=this.b.player?.position;
    if(p){
     const next=[p.x,p.y,p.z].map(n=>Math.round(n*100)/100);
     if(!this.lastSent||next.some((v,i)=>v!==this.lastSent[i])){
      this.socket.send(JSON.stringify({type:'move',position:next}));
      this.lastSent=next;
     }
    }
   }
   for(const item of this.remote.values())
    item.root.position.lerp(item.target,Math.min(1,dt*12));
  }
  disconnect(){
   ++this.session;this.joined=false;this.playerId='';this.lastSent=null;
   this.moveElapsed=0;
   if(this.socket){try{this.socket.close()}catch{}this.socket=null}
   this.clearRemote();
   if(this.layer)this.layer.visible=false;
   this.players('Игроков в комнате: —');
  }
 }
 // Allow offline unit tests to check endpoint policy without a WebView.
 NetworkEditor.serverUrl=serverUrl;
 NetworkEditor.validConfig=validConfig;
 return NetworkEditor;
});
