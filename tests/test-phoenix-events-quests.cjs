'use strict';
const assert=require('node:assert/strict');
const Events=require('../app/src/main/assets/engine/core/phoenix-events.js');
const Quests=require('../app/src/main/assets/engine/core/phoenix-quests.js');
const hub=new Events.Hub();
const seen=[];
const stop=hub.subscribe('mob.killed',e=>seen.push(e));
assert.equal(hub.emit({id:'evt-1',type:'mob.killed',actorId:'player1',data:{target:'wolf'}}),1);
assert.equal(seen.length,1);assert.equal(seen[0].data.target,'wolf');
assert.throws(()=>Events.event({id:'bad',type:'mob.killed',actorId:'player1',data:{target:Infinity}}),/Invalid event data/);
assert.throws(()=>Events.event({id:'bad',type:'x',actorId:'player1',data:{amount:()=>0}}),/Invalid event data/);
stop();assert.equal(hub.emit({id:'evt-2',type:'mob.killed',actorId:'player1'}),0);
const catalog=new Quests.Catalog();
catalog.set({id:'wolves',title:'Охота на волков',requirements:{minLevel:5},
 goals:[{id:'kill',event:'mob.killed',target:'wolf',count:5},
 {id:'skins',event:'item.collected',target:'wolf_skin',count:3}],
 rewards:[{type:'currency',id:'gold',amount:500},{type:'xp',id:'xp',amount:100}]});
catalog.set({id:'return',title:'Поговори с охотником',prerequisites:['wolves'],
 goals:[{id:'talk',event:'npc.talked',target:'hunter',count:1}],rewards:[]});
assert.equal(catalog.get('wolves').goals[0].count,5);
assert.throws(()=>catalog.set({id:'evil',title:'Bad',
 goals:[{id:'g',event:'code.run',target:'x',count:1}]}),/Unsupported/);
const alice=new Quests.Session(catalog,'alice'),bob=new Quests.Session(catalog,'bob');
assert.equal(alice.accept('wolves',{level:4}),false);
assert.equal(alice.accept('wolves',{level:5}),true);
assert.equal(bob.accept('wolves',{level:5}),true);
assert.equal(alice.accept('return',{level:5}),false);
for(let i=0;i<5;i++){
 const event={id:'a-kill-'+i,type:'mob.killed',actorId:'alice',data:{target:'wolf'}};
 assert.equal(alice.process(event).length,1);
 assert.equal(alice.process(event).length,0,'duplicate event never counts twice');
 assert.equal(bob.process(event).length,0,'other actor never progresses');
}
assert.equal(alice.get('wolves').progress.kill,5);
assert.equal(alice.claim('wolves'),null,'cannot claim incomplete quest');
for(let i=0;i<3;i++)
 alice.process({id:'skin-'+i,type:'item.collected',actorId:'alice',data:{target:'wolf_skin'}});
assert.equal(alice.get('wolves').status,'ready');
const loaded=new Quests.Session(catalog,'alice');
loaded.load(JSON.parse(JSON.stringify(alice.serialize())));
assert.equal(loaded.process({id:'skin-1',type:'item.collected',actorId:'alice',data:{target:'wolf_skin'}}).length,0);
const payout=loaded.claim('wolves');
assert.equal(payout.claimId,'alice:wolves');
assert.deepEqual(payout.rewards,[{type:'currency',id:'gold',amount:500},{type:'xp',id:'xp',amount:100}]);
assert.equal(loaded.claim('wolves'),null,'duplicate quest claim blocked');
assert.equal(loaded.accept('return'),true);
loaded.process({id:'talk-1',type:'npc.talked',actorId:'alice',data:{target:'hunter'}});
assert.equal(loaded.get('return').status,'ready');
assert.equal(bob.get('wolves').progress.kill,0);
assert.throws(()=>loaded.load({...loaded.serialize(),
 rows:[{questId:'wolves',status:'claimed',progress:{kill:0,skins:0}}]}),/Inconsistent/);
assert.equal(loaded.get('wolves').status,'claimed','invalid load does not replace state');
const copy=new Quests.Catalog();copy.load(catalog.serialize());
assert.equal(copy.list().length,2);
console.log('PASS: Phoenix Events + Quests: goals, player isolation, dedupe, prerequisites, reward claims, snapshots');
