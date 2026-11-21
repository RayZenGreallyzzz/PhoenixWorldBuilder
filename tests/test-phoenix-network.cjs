'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main');
const Network=require('../app/src/main/assets/engine/builder/phoenix-network-editor.js');
const Export=require('../app/src/main/assets/engine/core/phoenix-server-export.js');
const html=fs.readFileSync(path.join(root,'assets/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/js/clean-app.js'),'utf8');
const bridge=fs.readFileSync(path.join(root,'assets/engine/builder/play-bridge.js'),'utf8');
const manifest=fs.readFileSync(path.join(root,'AndroidManifest.xml'),'utf8');
assert.equal(Network.serverUrl('wss://game.example.com','main'),
 'wss://game.example.com/ws/main');
assert.equal(Network.serverUrl('ws://192.168.1.20:8787','world-2'),
 'ws://192.168.1.20:8787/ws/world-2');
assert.throws(()=>Network.serverUrl('ws://example.com','main'),/wss/);
assert.throws(()=>Network.serverUrl('http://example.com','main'),/ws/);
assert.throws(()=>Network.serverUrl('wss://me:secret@example.com','main'),/ws/);
assert.throws(()=>Network.serverUrl('wss://example.com','../hack'),/ID/);
assert.equal(Network.validConfig({name:'My PC',url:'ws://10.0.0.4:8787',
 worldId:'main',nickname:'Asura',autoConnect:true}).autoConnect,true);
const project={version:2,worldCanvas:{width:500,depth:500},objects:[
 {kind:'wall',category:'wall',position:[1,0,1]},
 {kind:'hidden-wall',category:'wall',position:[2,0,2],hidden:true}],
 phoenixGame:{
  catalog:{prefabs:[{id:'prefab-1',name:'Asura',type:'mob',stats:{level:1,hp:100}}]},
  world:{entities:[{id:'entity-1',name:'Asura',
   components:{prefab:{id:'prefab-1'},transform:{position:[4,0,5],yaw:0}}}]},
  skills:{characters:[{id:'prefab-1',
   slots:{slot3:{name:'Fireball',iconImage:'data:image/png;base64,SECRET'}}}]}
 }};
const data=Export.build(project,{worldId:'fantasy-1',name:'Fantasy World',revision:3});
assert.equal(data.format,'phoenix-server-world');
assert.equal(data.version,1);
assert.equal(data.objects.length,1);
assert.equal(data.mobs.length,1);
assert.equal(data.prefabs.length,1);
assert.equal(data.skills.length,1);
assert(!JSON.stringify(data).includes('SECRET'),'Do not embed large PNG icons');
assert(!JSON.stringify(data).includes('hidden-wall'),'Hidden construction is not published');
assert.throws(()=>Export.build(project,{worldId:'..'}),/world ID/);
for(const id of ['btnPhoenixServer','phoenixServerPanel','phoenixServerProfiles',
 'phoenixServerUrl','phoenixServerWorldId','btnPhoenixServerTest',
 'btnPhoenixServerExport','phoenixServerAutoConnect'])
 assert(html.includes('id="'+id+'"'),'Missing visible server control '+id);
assert(html.includes('engine/core/phoenix-server-export.js'));
assert(html.includes('engine/builder/phoenix-network-editor.js'));
assert(app.includes('this.networkEditor=new PhoenixNetworkEditor(this)'));
assert(bridge.includes('b.networkEditor?.beginPlay?.()'),
 'Online join must be explicitly part of PLAY lifecycle');
assert(bridge.includes('b.networkEditor?.disconnect?.()'),
 'PLAY exit must disconnect online guest safely');
assert(manifest.includes('android.permission.INTERNET'),
 'Real Android networking requires INTERNET permission');
assert(manifest.includes('android:usesCleartextTraffic="true"'),
 'Self-hosted ws:// LAN requires Android cleartext opt-in');
console.log('PASS: portable server URL profiles, world export, game runtime opt-in and Android LAN permission');
