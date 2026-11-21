import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage,validRoom,checkWorldPosition} from '../shared/protocol.mjs';
import {PhoenixRoom} from '../shared/room.mjs';
import {blankWorld,validateWorld} from '../shared/world.mjs';

class Peer{
 constructor(){this.messages=[];this.readyState=1;this.closed=false}
 send(data){this.messages.push(JSON.parse(data))}
 close(){this.closed=true;this.readyState=3}
 last(type){return this.messages.filter(m=>m.type===type).at(-1)}
}
test('protocol strictly rejects arbitrary client XP, attack, items, oversized and malformed input',()=>{
 assert.deepEqual(parseMessage('{"type":"join","name":" Asura "}'),{type:'join',name:'Asura'});
 assert.deepEqual(parseMessage('{"type":"move","position":[1,2,3]}'),
  {type:'move',position:[1,2,3]});
 assert.throws(()=>parseMessage('{"type":"damage","amount":999999}'),/Unsupported/);
 assert.throws(()=>parseMessage('{"type":"xp","amount":500}'),/Unsupported/);
 assert.throws(()=>parseMessage('{"type":"inventory","item":"legendary"}'),/Unsupported/);
 assert.throws(()=>parseMessage('{"type":"move","position":[1,"2",3]}'),/position/);
 assert.throws(()=>parseMessage('{"type":"move","position":[1e80,0,0]}'),/position/);
 assert.throws(()=>parseMessage('A'.repeat(2050)),/size/);
 assert(!validRoom('../outside'));
 assert(checkWorldPosition([2,0,2],blankWorld()));
 assert(!checkWorldPosition([5000,0,0],blankWorld()));
});
test('portable world keeps scene and spawn within known bounds',()=>{
 const world=blankWorld('fantasy-1');
 assert.equal(world.worldId,'fantasy-1');
 assert.equal(validateWorld(world).revision,1);
 assert.throws(()=>validateWorld({...world,spawn:[4000,0,0]}),/spawn/);
 assert.throws(()=>validateWorld({...world,worldId:'../hack'}),/worldId/);
 assert.throws(()=>validateWorld({...world,bounds:{width:6000,depth:10}}),/bounds/);
});
test('two guests join shared world, move, and never modify Builder construction',()=>{
 let clock=1000,n=0;
 const room=new PhoenixRoom({world:blankWorld('main'),
  now:()=>clock,nextId:()=>String(++n),maxPlayers:2});
 const a=new Peer(),b=new Peer(),c=new Peer();
 room.welcome(a);assert.equal(a.last('hello').protocol,1);
 assert(room.handle(a,JSON.stringify({type:'join',name:'Archer'})));
 clock+=100;
 assert(room.handle(b,JSON.stringify({type:'join',name:'Mage'})));
 assert.equal(a.last('player_joined').player.id,'2');
 assert.equal(b.last('joined').players.length,2);
 assert.equal(room.count(),2);
 room.handle(c,JSON.stringify({type:'join',name:'Extra'}));
 assert.equal(c.last('error').code,'room-full');
 assert(c.closed);
 assert(!room.handle(a,JSON.stringify({type:'attack',amount:999})));
 assert.equal(a.last('error').code,'invalid-message');
 clock+=200;
 assert(room.handle(a,JSON.stringify({type:'move',position:[1,0,0]})));
 assert.deepEqual(b.last('player_moved').position,[1,0,0]);
 clock+=200;
 assert(!room.handle(a,JSON.stringify({type:'move',position:[250,0,250]})));
 assert.equal(a.last('error').code,'movement-rejected');
 assert.deepEqual(room.get(a).position,[1,0,0]);
 assert.throws(()=>room.replaceWorld(blankWorld('main')),/players connected/);
 assert(room.leave(a));
 assert.equal(b.last('player_left').playerId,'1');
 room.leave(b);
 assert.equal(room.count(),0);
 const world={...blankWorld('main'),revision:2,
  name:'My world'};
 assert.equal(room.replaceWorld(world).revision,2);
 assert.throws(()=>room.replaceWorld(blankWorld('main')),/older revision/);
});
