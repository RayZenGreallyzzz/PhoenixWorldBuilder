/* Phoenix Server authoritative lobby/position prototype.
 * Provider-independent: WebSockets are passed as peer objects with send().
 * No trust in client-reported XP, combat damage, stats or item ownership.
 */
import {VERSION,encode,parseMessage,checkWorldPosition} from './protocol.mjs';
import {validateWorld,blankWorld} from './world.mjs';
export class PhoenixRoom{
 constructor({world=blankWorld(),maxPlayers=16,now=()=>Date.now(),
  nextId=()=>globalThis.crypto.randomUUID()}={}){
  this.world=validateWorld(world);
  if(!Number.isInteger(maxPlayers)||maxPlayers<1||maxPlayers>64)
   throw new TypeError('Invalid maxPlayers');
  this.maxPlayers=maxPlayers;this.now=now;this.nextId=nextId;
  this.players=new Map();
 }
 worldInfo(){const {worldId,name,revision,bounds,spawn}=this.world;
  return {worldId,name,revision,bounds,spawn};}
 snapshot(){return [...this.players.values()].map(({id,name,position})=>
  ({id,name,position:position.slice()}));}
 count(){return this.players.size}
 send(peer,msg){try{if(peer.readyState===1)peer.send(encode(msg))}
  catch{/* Disconnect is handled by transport close event. */}}
 broadcast(msg,except){for(const peer of this.players.keys())
  if(peer!==except)this.send(peer,msg)}
 welcome(peer){this.send(peer,{type:'hello',protocol:VERSION,
  world:this.worldInfo(),maxPlayers:this.maxPlayers,guestOnly:true})}
 get(peer){return this.players.get(peer)||null}
 attachRestored(peer,metadata){
  if(!metadata||typeof metadata.id!=='string'||metadata.id.length>70||
     typeof metadata.name!=='string'||metadata.name.length>32||
     !checkWorldPosition(metadata.position,this.world))return false;
  this.players.set(peer,{id:metadata.id,name:metadata.name,
   position:metadata.position.slice(),lastMoveMs:this.now(),
   lastChatMs:0,joinedAt:this.now()});
  return true;
 }
 handle(peer,data){
  let message;try{message=parseMessage(data)}
  catch(err){this.send(peer,{type:'error',code:'invalid-message'});return false}
  let player=this.players.get(peer);
  if(message.type==='ping'){
   this.send(peer,{type:'pong',players:this.count(),
    world:this.worldInfo()});return true;
  }
  if(message.type==='join'){
   if(player){this.send(peer,{type:'error',code:'already-joined'});return false}
   if(this.count()>=this.maxPlayers){
    this.send(peer,{type:'error',code:'room-full'});peer.close?.(1008,'Room full');
    return false;
   }
   const id=this.nextId(),start=this.world.spawn.slice();
   player={id,name:message.name,position:start,lastMoveMs:this.now(),
    lastChatMs:0,joinedAt:this.now()};
   this.players.set(peer,player);
   this.send(peer,{type:'joined',playerId:id,players:this.snapshot(),
    world:this.worldInfo()});
   this.broadcast({type:'player_joined',player:{id,name:player.name,
    position:start.slice()}},peer);
   return true;
  }
  if(!player){this.send(peer,{type:'error',code:'join-first'});return false}
  if(message.type==='move'){
   const next=message.position;
   if(!checkWorldPosition(next,this.world)){
    this.send(peer,{type:'error',code:'outside-world'});return false;
   }
   const now=this.now(),elapsed=Math.min(1.0,
    Math.max(0,(now-player.lastMoveMs)/1000));
   const dx=next[0]-player.position[0],dy=next[1]-player.position[1],
    dz=next[2]-player.position[2];
   const distance=Math.hypot(dx,dz);
   // Prototype movement validation; later server-side physics must use the
   // exported collision map and trusted movement state.
   if(distance>2+8*elapsed||Math.abs(dy)>3+8*elapsed){
    this.send(peer,{type:'error',code:'movement-rejected',
     position:player.position.slice()});return false;
   }
   // Cap updates for mobile connections and prevent unbounded broadcasts.
   if(now-player.lastMoveMs<70)return true;
   player.position=next.slice();player.lastMoveMs=now;
   this.broadcast({type:'player_moved',playerId:player.id,
    position:next.slice()},peer);
   return true;
  }
  if(message.type==='chat'){
   const now=this.now();
   if(now-player.lastChatMs<800){
    this.send(peer,{type:'error',code:'chat-rate-limit'});return false;
   }
   player.lastChatMs=now;
   this.broadcast({type:'chat',playerId:player.id,name:player.name,
    text:message.text});
   this.send(peer,{type:'chat',playerId:player.id,name:player.name,
    text:message.text});return true;
  }
  return false;
 }
 leave(peer){
  const player=this.players.get(peer);
  if(!player)return false;
  this.players.delete(peer);
  this.broadcast({type:'player_left',playerId:player.id});
  return true;
 }
 replaceWorld(world){
  if(this.players.size)throw new Error('Cannot replace world with players connected');
  const validated=validateWorld(world);
  if(validated.worldId!==this.world.worldId)
   throw new Error('World ID must match the destination room');
  if(validated.revision<this.world.revision)
   throw new Error('Cannot replace a newer world with an older revision');
  this.world=validated;return this.worldInfo();
 }
}
