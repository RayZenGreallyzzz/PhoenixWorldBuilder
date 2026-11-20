'use strict';
const assert=require('node:assert/strict');
const S=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
const defaultLayout=S.defaultLayout();
assert.equal(S.VERSION,1);
assert.equal(defaultLayout.slots.length,4);
assert.deepEqual(defaultLayout.slots.map(s=>s.id),['attack','heal','slot3','slot4']);
assert.equal(defaultLayout.slots[0].enabled,true);
assert.equal(defaultLayout.slots[1].enabled,true);
assert.equal(defaultLayout.slots[2].enabled,false);
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
assert.throws(()=>S.update(defaultLayout,'attack',{icon:'<img>',label:'attack'}),/Invalid skill icon/);
assert.throws(()=>S.validate({version:999,slots:[]}),/Invalid Phoenix/);
const invalid=S.defaultLayout();invalid.slots[1].id='attack';
assert.throws(()=>S.validate(invalid),/duplicate/);
console.log('PASS: skill HUD layout, appearance, positions, JSON roundtrip and validation');
