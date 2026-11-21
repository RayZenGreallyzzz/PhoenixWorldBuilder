'use strict';
const assert=require('node:assert/strict');
const S=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
const defaultLayout=S.defaultLayout();
assert.equal(S.VERSION,3);
assert.equal(defaultLayout.slots.length,13);
assert.deepEqual(defaultLayout.slots.map(s=>s.id),['attack','heal','slot3','slot4','slot5','ultimate','slot6','slot7','fire','aim','reload','jump','crouch']);
assert.equal(defaultLayout.slots[0].enabled,true);
assert.equal(defaultLayout.slots[1].enabled,true);
assert.equal(defaultLayout.slots[2].enabled,true);
assert.equal(defaultLayout.slots[5].enabled,true);
const customized=S.update(defaultLayout,'attack',{
 icon:'🐺',label:'УДАР',x:80,y:73,size:110,opacity:.7,
 color:'#1234aa',shape:'rounded',enabled:true
});
assert.equal(customized.slots[0].icon,'🐺');
assert.equal(customized.slots[0].label,'УДАР');
assert.equal(customized.slots[0].x,80);
assert.equal(customized.slots[0].shape,'rounded');
assert.equal(defaultLayout.slots[0].icon,'⚔','Defaults must stay unchanged');
assert.deepEqual(S.validate(JSON.parse(JSON.stringify(customized))),customized,
 'JSON round-trip must preserve user customization');
assert.throws(()=>S.update(defaultLayout,'unknown',{x:10}),/Unknown/);
assert.throws(()=>S.update(defaultLayout,'attack',{x:100}),/Invalid x/);
assert.throws(()=>S.update(defaultLayout,'attack',{size:180}),/Invalid size/);
assert.throws(()=>S.update(defaultLayout,'attack',{opacity:0}),/Invalid opacity/);
assert.throws(()=>S.update(defaultLayout,'attack',{color:'red'}),/Invalid skill color/);
assert.throws(()=>S.update(defaultLayout,'attack',{icon:'ABCDEFGHIJK',label:'attack'}),/Invalid skill icon/);
assert.throws(()=>S.validate({version:999,slots:[]}),/Invalid Phoenix/);
const invalid=S.defaultLayout();invalid.slots[1].id='attack';
assert.throws(()=>S.validate(invalid),/duplicate/);
const moba=S.presetLayout('moba');
const classic=S.presetLayout('classic');
assert.equal(moba.slots.length,13);
assert.equal(moba.slots[2].label,'УМЕНИЕ 1');
assert.equal(moba.slots[5].label,'УЛЬТА');
assert(moba.slots[0].x>moba.slots[2].x);
assert.equal(classic.slots[2].enabled,false);
assert.equal(classic.slots[5].enabled,false);
assert.notDeepEqual(moba,classic);
assert.throws(()=>S.presetLayout('not-a-real-game'),/Unknown skill HUD preset/);
const old={version:1,slots:classic.slots.slice(0,4)};
const migrated=S.validate(old);
assert.equal(migrated.version,3);
assert.equal(migrated.slots.length,13);
assert.equal(migrated.slots[0].id,'attack');
assert.equal(migrated.slots[5].id,'ultimate');
assert.deepEqual(migrated.slots.slice(0,4),old.slots,
 'Updating the app should retain existing 0.7 player HUD positions');
assert.deepEqual(S.validate(JSON.parse(JSON.stringify(migrated))),migrated);
for(const layout of [classic,moba,S.presetLayout('mmorpg'),S.presetLayout('shooter')]){
 const enabled=layout.slots.filter(s=>s.enabled);
 for(let i=0;i<enabled.length;i++)for(let j=i+1;j<enabled.length;j++){
   const a=enabled[i],b=enabled[j];
   const dy=Math.abs(a.y-b.y)*8,dx=Math.abs(a.x-b.x)*12.8;
   const distance=Math.hypot(dx,dy);
   assert(distance>=Math.min(a.size,b.size)*.70,
    'HUD buttons overlap excessively: '+a.id+'/'+b.id);
 }
}
const mmo=S.presetLayout('mmorpg');
const shooter=S.presetLayout('shooter');
assert.equal(mmo.slots.length,13);
assert.equal(shooter.slots.length,13);
assert.equal(mmo.slots.filter(s=>s.enabled).length,8);
assert.equal(shooter.slots.filter(s=>s.enabled).length,7);
for(const id of ['fire','aim','reload','jump','crouch']){
 assert.equal(shooter.slots.find(s=>s.id===id).enabled,true,'Shooter must show '+id);
 assert.equal(mmo.slots.find(s=>s.id===id).enabled,false,'MMO must hide '+id);
}
for(const id of ['slot6','slot7','ultimate'])
 assert.equal(mmo.slots.find(s=>s.id===id).enabled,true,'MMO must show skill '+id);
const olderV2={version:2,slots:S.presetLayout('moba').slots.slice(0,6)};
olderV2.slots[0]={...olderV2.slots[0],x:74,y:68,color:'#112233'};
const converted=S.validate(olderV2);
assert.equal(converted.version,3);
assert.equal(converted.slots.length,13);
assert.deepEqual(converted.slots.slice(0,6),olderV2.slots,
 'Upgrading 0.8 must preserve all 6 authored buttons unchanged');
assert.equal(converted.slots.find(s=>s.id==='fire').enabled,false,
 'Shooter placeholder must not pop up in an old MOBA layout');
assert.equal(S.validate(JSON.parse(JSON.stringify(converted))).version,3);
assert.notDeepEqual(mmo,shooter);
const tinyPng='data:image/png;base64,'+
 Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const pictured=S.update(moba,'slot3',{image:tinyPng,x:72});
assert.equal(pictured.slots[2].image,tinyPng);
assert.equal(S.validate(JSON.parse(JSON.stringify(pictured))).slots[2].image,tinyPng);
assert.equal(S.presetLayout('moba').slots[2].image,'',
 'Individual skill icon must not modify the preset itself');
assert.throws(()=>S.update(moba,'slot3',{image:'javascript:alert(1)'}),
 /PNG|WebP|image|embedded/);
console.log('PASS: MOBA / MMORPG / shooter HUD presets, 0.7/0.8 migration and no overlaps');
