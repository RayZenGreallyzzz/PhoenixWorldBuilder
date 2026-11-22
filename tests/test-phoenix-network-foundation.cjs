'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main/assets');
const Network=require('../app/src/main/assets/engine/core/phoenix-network-foundation.js');
const Editor=require('../app/src/main/assets/engine/builder/phoenix-network-editor.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const browser=fs.readFileSync(path.join(root,'engine/builder/phoenix-network-editor.js'),'utf8');
assert.equal(Network.FORMAT,'phoenix-server-connections');
assert.equal(Network.PROTOCOL,1);
assert.equal(Network.endpoint('ws://192.168.1.45:8787','fantasy'),'ws://192.168.1.45:8787/ws/fantasy');
assert.equal(Network.endpoint('ws://100.101.20.30:8787','fantasy'),'ws://100.101.20.30:8787/ws/fantasy');
assert.equal(Network.endpoint('wss://game.example.com','fantasy'),'wss://game.example.com/ws/fantasy');
assert.throws(()=>Network.endpoint('ws://game.example.com','fantasy'),/wss/);
assert.throws(()=>Network.endpoint('wss://user:password@game.example.com','fantasy'),/логина/);
assert.throws(()=>Network.endpoint('wss://game.example.com','../fantasy'),/ID мира/);
assert.equal(Editor.serverUrl('wss://game.example.com','main'),
 'wss://game.example.com/ws/main','Existing connection API remains stable');
const primary={id:'server-101-0',data:{name:'Компьютер',
 url:'ws://192.168.1.45:8787',worldId:'fantasy',nickname:'Asura',autoConnect:true}};
const cloud={id:'server-102-1',data:{name:'Cloudflare',
 url:'wss://fantasy.example.com',worldId:'fantasy',nickname:'Asura',autoConnect:false}};
const original={selected:primary.id,profiles:[primary,cloud]};
const backup=Network.exportBundle(original);
assert.equal(backup.profiles.length,2);
assert.equal(backup.selected,primary.id);
assert.equal(backup.profiles[0].data.autoConnect,false,
 'Imported backup cannot force an automatic connection');
assert(!JSON.stringify(backup).includes('privateKey'));
const restored=Network.importBundle(JSON.stringify(backup));
assert.deepEqual(restored.profiles,backup.profiles);
assert.equal(restored.profiles[1].data.url,'wss://fantasy.example.com');
const oldDevice={selected:primary.id,profiles:[primary]};
const merged=Network.merge(oldDevice,restored);
assert.equal(merged.profiles.length,2,'New cloud target is added to local computer');
assert.equal(merged.profiles[0].data.autoConnect,true,
 'Existing local opt-in survives importing a new server');
assert.equal(merged.selected,primary.id,'No silent server switch after import');
const duplicate=Network.merge(merged,restored);
assert.equal(duplicate.profiles.length,2,'Same server cannot duplicate profile');
const conflict=Network.merge(oldDevice,Network.exportBundle({selected:cloud.id,profiles:[
 {id:primary.id,data:{...cloud.data,name:'Другой сервер'}}]}));
assert.equal(conflict.profiles.length,2);
assert.notEqual(conflict.profiles[1].id,primary.id,
 'Colliding IDs must not overwrite the original server');
assert.throws(()=>Network.importBundle(JSON.stringify({
 ...backup,profiles:[{id:'bad',data:{...primary.data,url:'ws://evil.example'}}]})),/wss/);
assert.throws(()=>Network.importBundle(JSON.stringify({
 ...backup,adminToken:'my-secret',password:'supersecret'})),/секреты/);
assert.throws(()=>Network.importBundle('x'.repeat(64001)),/большой/);
assert.throws(()=>Network.importBundle('{}'),/формат/);
const hello=Network.evaluateHello({
 v:1,type:'hello',protocol:1,world:{name:'Phoenix Fantasy'},
 maxPlayers:16,capabilities:{guest:true,sharedPositions:true,chat:true,worldJson:true}
});
assert(hello.compatible);
assert.equal(hello.world,'Phoenix Fantasy');
assert(hello.pending.includes('accountRegistration'));
assert(hello.pending.includes('serverCombat'));
assert(!Network.evaluateHello({v:2,type:'hello',protocol:2}).compatible);
for(const id of ['btnPhoenixServerBackup','btnPhoenixServerImport',
 'phoenixServerImportFile','phoenixServerCapabilities'])
 assert(html.includes('id="'+id+'"'),'Missing Builder UI control: '+id);
assert(html.indexOf('engine/core/phoenix-network-foundation.js')<
 html.indexOf('engine/builder/phoenix-network-editor.js'));
assert(browser.includes('Foundation.merge('),'Imported profiles must merge rather than overwrite');
assert(browser.includes('this.persist();this.renderProfiles()'),'Imported profiles must be saved locally');
assert(browser.includes('this.serverCapabilities=info'),'Compatibility diagnostics must be wired to server hello');
console.log('PASS: portable offline→LAN→Cloudflare server profiles, privacy, backups, v1 compatibility, no silent auto-connect');
