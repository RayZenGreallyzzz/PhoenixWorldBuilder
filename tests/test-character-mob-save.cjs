'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Files=require('../app/src/main/assets/js/phoenix-files.js');
const base=path.resolve(__dirname,'../app/src/main/assets');
const code=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
(async()=>{
 const player='glb:avatar:player-1',wolf='glb:mob:wolf-1';
 const bytes=new Map([
  [player,Uint8Array.from([0x67,0x6c,0x54,0x46,1,2,3,4]).buffer],
  [wolf,Uint8Array.from([0x67,0x6c,0x54,0x46,5,6,7,8]).buffer]
 ]);
 const project={version:2,objects:[],avatar:{
  assetId:player,fileName:'Игрок.glb',heightCm:175,
  attackClip:'GreatSword_Attack'
 },phoenixGame:{version:1,catalog:{version:1,nextId:1,prefabs:[{
  id:'prefab-1',assetId:wolf,name:'Wolf'
 }]}}};
 const pack=await Files.packageProject(project,[],[player,wolf,wolf],
  id=>bytes.get(id));
 assert.equal(pack.assets.length,2,
  'Repeated NPC GLB instances must embed the same model only ONCE');
 assert.equal(pack.project.avatar.assetId,player);
 const restored=new Map();
 const out=await Files.unpackProject(pack,async(id,buffer)=>restored.set(id,buffer));
 assert.equal(out.project.avatar.attackClip,'GreatSword_Attack');
 for(const id of [player,wolf]){
  assert.deepEqual([...new Uint8Array(restored.get(id))],
   [...new Uint8Array(bytes.get(id))],
   'Portably restored GLB bytes must remain identical');
 }
 assert(code.includes('avatar:this.avatarAssetId?{'));
 assert(code.includes('await putAsset(id,await file.arrayBuffer())'));
 assert(code.includes('this.restoreAvatarFromProject(doc.avatar||null)'));
 assert(code.includes('const usedMobs=this.prefabEditor?.registry.list()'));
 assert(code.includes('...usedMobs,...(this.avatarAssetId?[this.avatarAssetId]:[])'));
 assert(html.includes('id="avatarAttackClip"'),
  'Mobile editor should allow choosing the exact avatar Attack clip');
 assert(html.includes('id="phoenixPrefabAttackClip"'),
  'Prefab editor should allow choosing the exact mob Attack clip');
 console.log('PASS: player GLB + shared mob GLBs are stored once in portable project and restored byte-identically');
})().catch(err=>{console.error(err);process.exitCode=1});
