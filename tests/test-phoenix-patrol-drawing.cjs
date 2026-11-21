'use strict';
const assert=require('node:assert/strict');
const Path=require('../app/src/main/assets/engine/core/phoenix-patrol-path.js');
const AI=require('../app/src/main/assets/engine/core/phoenix-ai.js');
const Prefabs=require('../app/src/main/assets/engine/core/phoenix-prefabs.js');
const fs=require('node:fs'),path=require('node:path');
const assets=path.join(__dirname,'../app/src/main/assets');
const code=fs.readFileSync(path.join(assets,'engine/builder/prefab-editor.js'),'utf8');
const app=fs.readFileSync(path.join(assets,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
// Circles and winding touch paths stay curves instead of a rectangle or straight line.
const circle=Array.from({length:150},(_,i)=>[
 12*Math.cos(i*2*Math.PI/150),0,12*Math.sin(i*2*Math.PI/150)]);
const copy=circle.map(p=>p.slice());
const drawn=Path.fromStroke(circle);
assert(drawn.length>8&&drawn.length<=Path.MAX_POINTS,
 'Freehand circle needs enough points to preserve the curvature');
assert(drawn.some(p=>p[0]<-11)&&drawn.some(p=>p[0]>11));
assert(drawn.some(p=>p[2]<-11)&&drawn.some(p=>p[2]>11));
assert.deepEqual(circle,copy,'Stroke simplification cannot mutate touch points');
const raw=Array.from({length:3600},(_,i)=>[
 50*Math.cos(i/35),0,50*Math.sin(i/35)]);
const longRoute=Path.fromStroke(raw);
assert(longRoute.length<=256,'Long phone strokes must be compact for Android');
assert.throws(()=>Path.fromStroke([...raw,...raw]),/finger route/);
const zig=Path.fromStroke([[0,0,0],[1,0,0],[2,0,0],[2,0,5],[4,0,5]]);
assert(zig.some(p=>p[0]===2&&p[2]===0),'Right angle must not be flattened');
const stop=Path.stopsFromMarkers(drawn,[{position:drawn[4],
 seconds:2.5,animation:'clip:Sword_Attack_RM'}]);
assert.equal(stop.length,1);
assert.equal(stop[0].seconds,2.5);
assert.equal(stop[0].animation,'clip:Sword_Attack_RM');
assert.throws(()=>Path.normalizeStops(drawn,[{index:2,seconds:-1,animation:'idle'}]),/seconds/);
assert.throws(()=>Path.normalizeStops(drawn,[{index:2,seconds:3,animation:'bad'}]),/animation/);
assert.throws(()=>Path.validatePoints(Array.from({length:257},()=>[0,0,0])),/waypoints/);
// Stop timers pause the NPC, play its exact GLB clip, then continue the path.
const profile={mode:'patrol',waypoints:[[0,0,0],[6,0,0]],
 routeMode:'drawn',stops:[{index:0,seconds:2,animation:'clip:Sword_Attack_RM'}]};
const frozen=AI.tick(AI.initial([0,0,0]),[0,0,0],[30,0,30],
 profile,{speed:2},.1);
assert.deepEqual(frozen.move,[0,0,0]);
assert.equal(frozen.routeClip,'Sword_Attack_RM');
assert(frozen.state.stopLeft>=1.9);
const waiting=AI.tick(frozen.state,[0,0,0],[30,0,30],
 profile,{speed:2},.5);
assert.equal(waiting.state.point,0);
assert.deepEqual(waiting.move,[0,0,0]);
const resumed=AI.tick(waiting.state,[0,0,0],[30,0,30],
 profile,{speed:2},1.5);
assert.equal(resumed.state.point,1);
const walked=AI.tick(resumed.state,[0,0,0],[30,0,30],
 profile,{speed:2},.1);
assert(walked.move[0]>0,'After the stop the mob walks to next waypoint');
const saved=Prefabs.normalize({name:'Asura',ai:profile});
assert.equal(saved.ai.routeMode,'drawn');
assert.equal(saved.ai.stops[0].animation,'clip:Sword_Attack_RM');
const again=Prefabs.normalize(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(again.ai.stops,saved.ai.stops);
const old=Prefabs.normalize({name:'Legacy mob',ai:{mode:'patrol',waypoints:[[1,0,3]]}});
assert.deepEqual(old.ai.stops,[],'Old point patrols remain supported');
assert.equal(old.ai.routeMode,'points');
// Drawing is an NPC action, never a construction module.
for(const id of ['btnPhoenixRouteDraw','btnPhoenixRouteStops','phoenixRouteDock',
 'btnPhoenixRouteSave','btnPhoenixRouteCancel','btnPhoenixRouteStopTool'])
 assert(html.includes('id="'+id+'"'),'Missing route editor element '+id);
assert(code.includes('this.b.controls.enabled=false'),
 'Camera must freeze while tracing a touch path');
assert(code.includes('this.b.controls.enabled=draft.previousEnabled'),
 'Camera must unlock on save or cancel');
assert(code.includes("routeMode:draft.mode==='draw'?'drawn'"),
 'Route mode must persist per individual mob');
assert(app.includes("if(this.playBridge?.active||this.prefabEditor?.routeDraft)return"),
 'Builder must yield canvas clicks while route is active');
console.log('PASS: touch circles, 256 point cap, custom GLB stop clips, AI waits and restarts, old routes, camera lock and no construction');
