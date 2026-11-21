/* Cloudflare Durable Objects adapter for the same portable PhoenixRoom core.
 * Runs multiplayer rooms at the edge. Do not store admin secrets in Android.
 * No account registration, persistent characters or authoritative combat yet.
 */
import {DurableObject} from 'cloudflare:workers';
import {PhoenixRoom} from '../shared/room.mjs';
import {blankWorld,validateWorld} from '../shared/world.mjs';
import {validRoom} from '../shared/protocol.mjs';
const respond=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const safeEq=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string')return false;
 let different=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)
  different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return different===0;
};
async function forward(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')
  return respond({ok:true,service:'Phoenix Server',
   protocol:1,mode:'cloudflare-durable-objects'});
 const match=url.pathname.match(/^\/(ws|admin\/world)\/([a-z][a-z0-9-]{0,39})$/);
 if(!match||!validRoom(match[2]))return respond({error:'Unknown route'},404);
 const id=match[2],admin=match[1]!=='ws';
 if(admin){
  const secret=env.PHOENIX_ADMIN_TOKEN;
  if(typeof secret!=='string'||secret.length<24||
     !safeEq(request.headers.get('authorization'),'Bearer '+secret))
   return respond({error:'Admin token required'},403);
 }
 const stub=env.PHOENIX_ROOMS.get(env.PHOENIX_ROOMS.idFromName(id));
 const headers=new Headers(request.headers);
 headers.set('X-Phoenix-World-Id',id);
 return stub.fetch(new Request(request,{headers}));
}
export default {fetch:forward};

export class PhoenixRoomObject extends DurableObject{
 constructor(ctx,env){
  super(ctx,env);
  this.room=null;
  ctx.blockConcurrencyWhile(async()=>{
   const existing=await ctx.storage.get('world');
   const first=ctx.getWebSockets()?.[0];
   const label=first?.deserializeAttachment?.()?.worldId||'main';
   this.room=new PhoenixRoom({
    world:existing?validateWorld(existing):blankWorld(label),
    maxPlayers:Number(env.PHOENIX_MAX_PLAYERS||16),
    nextId:()=>crypto.randomUUID()});
   for(const ws of ctx.getWebSockets()){
    const meta=ws.deserializeAttachment?.();
    if(meta?.worldId===this.room.world.worldId)
     this.room.attachRestored(ws,meta);
   }
  });
 }
 async fetch(request){
  const id=request.headers.get('X-Phoenix-World-Id')||'main';
  if(!validRoom(id))return respond({error:'Invalid world ID'},400);
  if(this.room.world.worldId!==id){
   // Persist the room ID even for guest-only rooms. On hibernation Cloudflare
   // reconstructs the object and existing connections from stored metadata.
   if(this.room.count())return respond({error:'Wrong room'},409);
   const existing=await this.ctx.storage.get('world');
   if(existing&&existing.worldId!==id)
    return respond({error:'Stored world ID mismatch'},409);
   const created=blankWorld(id);
   await this.ctx.storage.put('world',created);
   this.room=new PhoenixRoom({world:created,
    maxPlayers:Number(this.env.PHOENIX_MAX_PLAYERS||16),
    nextId:()=>crypto.randomUUID()});
  }
  const url=new URL(request.url);
  if(url.pathname.startsWith('/ws/')){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
    return respond({error:'WebSocket upgrade required'},426);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);
   this.ctx.acceptWebSocket(server);
   this.room.welcome(server);
   return new Response(null,{status:101,webSocket:client});
  }
  if(url.pathname.startsWith('/admin/world/')){
   if(request.method==='GET')return respond(this.room.world);
   if(request.method!=='PUT')return respond({error:'Method not allowed'},405);
   if(this.room.count())return respond({error:'Disconnect players first'},409);
   try{
    if(Number(request.headers.get('content-length')||0)>4_200_000)
     return respond({error:'Manifest too large'},413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>4_200_000)
     return respond({error:'Manifest too large'},413);
    const world=validateWorld(JSON.parse(raw));
    if(world.worldId!==id)return respond({error:'World ID mismatch'},400);
    if(world.revision<this.room.world.revision)
     return respond({error:'World revision cannot decrease'},409);
    // Commit the persistent revision before exposing it to any new joiner.
    await this.ctx.storage.put('world',world);
    this.room.replaceWorld(world);
    return respond({ok:true,world:this.room.worldInfo()});
   }catch(error){return respond({error:error.message||'Invalid world'},400)}
  }
  return respond({error:'Not found'},404);
 }
 webSocketMessage(ws,message){
  this.room.handle(ws,message);
  const entry=this.room.get(ws);
  if(entry)ws.serializeAttachment({worldId:this.room.world.worldId,
   id:entry.id,name:entry.name,position:entry.position.slice()});
 }
 webSocketClose(ws,code,reason){
  this.room.leave(ws);
  try{
   if(code>=1000&&code<5000&&![1004,1005,1006,1015].includes(code))
    ws.close(code,reason);
   else ws.close();
  }catch{/* Already closed. */}
 }
 webSocketError(ws){this.room.leave(ws)}
}
