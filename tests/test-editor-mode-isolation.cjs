'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main/assets');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('js/clean-app.js');
const npc=read('engine/builder/prefab-editor.js');
const terrain=read('engine/builder/phoenix-world-editor.js');
// A shared canvas begins without any construction object at all.
assert(!app.includes("this.setMode('build');this.selectKind('wall');"),
 'Startup must never create a default wall preview');
assert(app.includes("this.setMode('build');this.setTool('pick');"),
 'Startup must begin in neutral select mode');
assert(app.includes("tool:this.tool,kind:this.preview?.kind||''"),
 'Undo/Redo must not reactivate the old default wall from lastPlacementKind');
assert(app.includes('this.selected=null;this.disposePreview();this.setTool(\'pick\');'),
 'Opening project must not silently recreate a default wall');
assert(app.includes("if(mode!=='build'&&this.tool==='place')this.setTool('pick');"),
 'Character/drone modes must disarm the building placement tool');
assert(npc.includes("if(this.b.tool==='place')this.b.setTool('pick');"),
 'Opening NPC editor must disarm construction');
assert(terrain.includes("if(this.b.tool==='place')this.b.setTool('pick');"),
 'Opening landscape editor must disarm construction');
assert(npc.includes("this.b.setMode('build');this.b.setTool('pick');"),
 'Touch-to-place mobs and waypoint taps must not select wall tool');
assert(app.includes("if(this.mode!=='build'||this.worldEditor?.painting)return;"),
 'Landscaping and character touches must not select building entries');
assert(app.includes("if(this.mode!=='build'||this.tool!=='place')return false;"),
 'Construction commit must be gated by explicit building placement tool');
const guard=app.match(/\n place\(\)\{\n([\s\S]*?)\n  if\(!this\.preview\)return;/);
assert(guard,'Builder place guard must exist');
const warnings=[];
const check=new Function('notify','return function(){'+guard[1]+'\n return true;}')(
 v=>warnings.push(v));
const appState={mode:'build',tool:'pick',prefabEditor:{panel:{hidden:true},
 pendingPlace:'',pendingWaypointId:''}};
assert.equal(check.call(appState),false,'Selecting is not building');
appState.tool='place';appState.mode='character';
assert.equal(check.call(appState),false,'Character mode cannot build');
appState.mode='drone';
assert.equal(check.call(appState),false,'Drone camera cannot build');
appState.mode='build';appState.prefabEditor.pendingWaypointId='mob-1';
assert.equal(check.call(appState),false,'NPC waypoint cannot build');
appState.prefabEditor.pendingWaypointId='';
assert.equal(check.call(appState),true,'Explicit building remains available');
console.log('PASS: neutral start, one shared canvas, exclusive building tool and no NPC/terrain wall leakage');
