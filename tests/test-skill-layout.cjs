'use strict';
const assert=require('node:assert/strict');
const S=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
const defaultLayout=S.defaultLayout();
assert.equal(S.VERSION,2);
assert.equal(defaultLayout.slots.length,6);
assert.deepEqual(defaultLayout.slots.map(s=>s.id),['attack','heal','slot3','slot4','slot5','ultimate']);
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
const mobile=S.presetLayout('mobile-legends');
const wild=S.presetLayout('wild-rift');
const classic=S.presetLayout('classic');
assert.equal(mobile.slots.length,6);
assert.equal(wild.slots.length,6);
assert.equal(wild.slots[2].label,'Q');
assert.equal(wild.slots[5].label,'R · УЛЬТА');
assert(mobile.slots[0].x>mobile.slots[2].x);
assert.equal(classic.slots[2].enabled,false);
assert.equal(classic.slots[5].enabled,false);
assert.notDeepEqual(mobile,wild,'Different MOBAs should have distinct templates');
assert.throws(()=>S.presetLayout('not-a-real-game'),/Unknown skill HUD preset/);
const old={version:1,slots:classic.slots.slice(0,4)};
const migrated=S.validate(old);
assert.equal(migrated.version,2);
assert.equal(migrated.slots.length,6);
assert.equal(migrated.slots[0].id,'attack');
assert.equal(migrated.slots[5].id,'ultimate');
assert.deepEqual(migrated.slots.slice(0,4),old.slots,
 'Updating the app should retain existing 0.7 player HUD positions');
assert.deepEqual(S.validate(JSON.parse(JSON.stringify(migrated))),migrated);
for(const layout of [classic,mobile,wild]){
 const enabled=layout.slots.filter(s=>s.enabled);
 for(let i=0;i<enabled.length;i++)for(let j=i+1;j<enabled.length;j++){
   const a=enabled[i],b=enabled[j];
   const dy=Math.abs(a.y-b.y)*8,dx=Math.abs(a.x-b.x)*12.8;
   const distance=Math.hypot(dx,dy);
   assert(distance>=Math.min(a.size,b.size)*.70,
    'MOBA buttons overlap excessively: '+a.id+'/'+b.id);
 }
}
console.log('PASS: MOBA preset layouts, legacy migration, appearance, positions, JSON roundtrip and validation');
