/* Phoenix Engine portable networking foundation.
 * Public server addresses only. No credentials, saved heroes or admin tokens
 * belong in Builder connection profiles or world exports.
 * Same protocol endpoint format for PC, VPS, Tunnel and Cloudflare.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixNetworkFoundation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FORMAT='phoenix-server-connections',VERSION=1,PROTOCOL=1;
 const MAX_PROFILES=20,MAX_BYTES=64000;
 const ID=/^[a-z][a-z0-9-]{0,39}$/;
 const PROFILE_ID=/^[a-zA-Z0-9-]{1,70}$/;
 const defaults=()=>({name:'Мой сервер',url:'ws://127.0.0.1:8787',
  worldId:'main',nickname:'Разработчик',autoConnect:false});
 const localHost=host=>host==='localhost'||host==='127.0.0.1'||
  host==='::1'||host==='[::1]'||
  /^192\.168\.\d+\.\d+$/.test(host)||/^10\.\d+\.\d+\.\d+$/.test(host)||
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)||
  /^169\.254\.\d+\.\d+$/.test(host)||
  /^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host);
 function endpoint(input,worldId){
  if(!ID.test(worldId))throw Error('ID мира: строчные латинские буквы, цифры и тире');
  let url;try{url=new URL(input)}catch{throw Error('Неверный адрес сервера')}
  if(!['ws:','wss:'].includes(url.protocol)||!url.hostname||
     url.username||url.password||url.search||url.hash)
   throw Error('Нужен адрес ws:// или wss:// без логина и пароля');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol==='ws:'&&!localHost(host))
   throw Error('Для публичного сервера используй защищённый адрес wss://');
  // No path from a copied URL can override the target world's socket.
  url.pathname='/ws/'+worldId;return url.href;
 }
 function normalize(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw Error('Неверные настройки сервера');
  const data={name:String(raw.name||'').trim(),url:String(raw.url||'').trim(),
   worldId:String(raw.worldId||'').trim(),
   nickname:String(raw.nickname||'').trim(),
   autoConnect:raw.autoConnect===true};
  if(!data.name||data.name.length>50)
   throw Error('Название подключения: до 50 символов');
  if(!data.nickname||data.nickname.length>32||/[\x00-\x1f<>]/.test(data.nickname))
   throw Error('Ник: 1–32 символа');
  endpoint(data.url,data.worldId);
  return data;
 }
 function portable(input){
  const items=input?.profiles;
  if(!Array.isArray(items)||items.length>MAX_PROFILES)
   throw Error('Неверное число подключений');
  const used=new Set(),profiles=[];
  for(const row of items){
   if(!row||!PROFILE_ID.test(row.id)||used.has(row.id))
    throw Error('Повреждён ID подключения');
   used.add(row.id);
   profiles.push({id:row.id,data:normalize(row.data)});
  }
  const selected=profiles.some(p=>p.id===input.selected)?input.selected:'';
  return {format:FORMAT,version:VERSION,selected,profiles};
 }
 function exportBundle(source){
  const safe=portable(source);
  // Never export an automatic network action to another installation.
  return {...safe,exportedBy:'Phoenix Engine',
   profiles:safe.profiles.map(p=>({id:p.id,
    data:{...p.data,autoConnect:false}}))};
 }
 function importBundle(raw){
  const text=typeof raw==='string'?raw:JSON.stringify(raw);
  if(new TextEncoder().encode(text).length>MAX_BYTES)
   throw Error('Файл подключений слишком большой');
  let value;try{value=JSON.parse(text)}catch{throw Error('Неверный JSON подключений')}
  if(!value||value.format!==FORMAT||value.version!==VERSION)
   throw Error('Неподдерживаемый формат серверных подключений');
  // Explicitly reject accidental secrets in backups, even unused extra keys.
  if(/"(?:(?:admin|access|refresh)[_-]?(?:token|secret)|password|api[_-]?key|private[_-]?key)"\s*:/i.test(text))
   throw Error('Файл содержит секреты. Удали их перед импортом');
  return exportBundle(portable(value));
 }
 function merge(current,incoming){
  const ours=portable(current),theirs=importBundle(incoming);
  const combined=ours.profiles.map(p=>({id:p.id,data:{...p.data}}));
  for(const item of theirs.profiles){
   // Identical profiles are deduplicated without silently overwriting
   // existing local servers or their explicit auto-connect preference.
   const same=combined.find(p=>p.data.url===item.data.url&&
    p.data.worldId===item.data.worldId&&p.data.nickname===item.data.nickname);
   if(same)continue;
   if(combined.length>=MAX_PROFILES)throw Error('Максимум 20 серверов');
   let id=item.id,n=1;
   while(combined.some(p=>p.id===id)){
    id=('import-'+n+'-'+item.id).slice(0,70);n++;
   }
   combined.push({id,data:item.data});
  }
  return {format:FORMAT,version:VERSION,selected:ours.selected,profiles:combined};
 }
 const features=Object.freeze({protocol:PROTOCOL,guest:true,chat:true,
  sharedPositions:true,accountRegistration:false,persistentCharacters:false,
  serverCombat:false,inventory:false,skillSync:false,worldJson:true});
 function evaluateHello(msg){
  if(!msg||msg.type!=='hello'||msg.v!==PROTOCOL||
     msg.protocol!==PROTOCOL)
   return {compatible:false,message:'Версия сетевого протокола не совпадает'};
  const caps=msg.capabilities&&typeof msg.capabilities==='object'?
   msg.capabilities:{guest:true,sharedPositions:true};
  const missing=['accountRegistration','persistentCharacters','serverCombat',
   'inventory','skillSync'].filter(k=>caps[k]!==true);
  return {compatible:true,world:msg.world?.name||'Phoenix World',
   protocol:PROTOCOL,maxPlayers:Number(msg.maxPlayers)||0,
   capabilities:{...features,...caps},pending:missing};
 }
 return Object.freeze({FORMAT,VERSION,PROTOCOL,MAX_PROFILES,MAX_BYTES,
  defaults,endpoint,normalize,portable,exportBundle,importBundle,merge,
  evaluateHello,features});
});
