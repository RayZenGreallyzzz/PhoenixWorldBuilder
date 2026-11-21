'use strict';
const assert=require('node:assert/strict');
const layout=require('../app/src/main/assets/engine/core/phoenix-world-layout.js');
assert.equal(layout.MAX_METERS,5000);
assert.equal(layout.MAX_TILES,10000);
assert.equal(layout.HEIGHT_STEP,5);
const standard=layout.plain();
assert.deepEqual([standard.width,standard.depth,standard.tileSize],[500,500,50]);
assert.equal(standard.heights.length,0);
assert.equal(layout.legacy().width,128);
for(const n of [50,100,250,500,1000,5000]){
 assert.equal(layout.settings({width:n,depth:n}).width,n);
}
assert.throws(()=>layout.settings({width:5001,depth:50}),/5000/);
assert.throws(()=>layout.settings({width:0,depth:50}),/10/);
const custom=layout.settings({width:375,depth:625,tileSize:75});
assert.deepEqual(custom,{width:375,depth:625,tileSize:75});
const tiled=layout.paint(standard,0,0,'grass');
assert.equal(tiled.tiles.length,1);
assert.equal(layout.paint(tiled,0,0,'snow').tiles.length,1);
assert.equal(layout.paint(tiled,0,0,'snow').tiles[0].style,'snow');
assert.equal(layout.erase(tiled,0,0).tiles.length,0);
assert.throws(()=>layout.paint(standard,300,0,'grass'),/границ/);
assert.equal(layout.rect(custom,4,0).width,75);
assert.equal(layout.rect(custom,5,0),null);
assert.equal(layout.cellAt(standard,250,0),null);
// Raise a rounded hill: centre > outskirts, no touch to the original state.
const hill=layout.sculpt(standard,0,0,{
 mode:'raise',radius:30,strength:20,seconds:.2
});
assert(hill.heights.length>0);
assert(hill.heights.length<250);
assert.equal(standard.heights.length,0);
const centre=layout.heightAt(hill,0,0);
assert(centre>3.9&&centre<=4);
const slope=layout.heightAt(hill,15,0);
assert(slope>0&&slope<centre);
assert.equal(layout.heightAt(hill,80,80),0);
const raised=layout.sculpt(hill,0,0,{
 mode:'raise',radius:30,strength:20,seconds:.2
});
assert(layout.heightAt(raised,0,0)>centre);
const lowered=layout.sculpt(raised,0,0,{
 mode:'lower',radius:30,strength:20,seconds:.2
});
assert(Math.abs(layout.heightAt(lowered,0,0)-centre)<.02);
// Negative ground must remain negative in the save; no invisible 0m plane.
const depression=layout.sculpt(standard,0,0,{
 mode:'lower',radius:30,strength:20,seconds:.2
});
assert(layout.heightAt(depression,0,0)<-3.9);
assert.deepEqual(layout.validate(JSON.parse(JSON.stringify(depression))),depression);
assert.throws(()=>layout.sculpt(standard,0,0,{radius:200}),/радиус/);
assert.throws(()=>layout.sculpt(standard,0,0,{mode:'explode'}),/режим/);
assert.throws(()=>layout.sculpt(standard,300,0,{mode:'raise'}),/границ/);
assert.throws(()=>layout.validate({...standard,heights:[[10,10,3],[10,10,2]]}),/вершина/);
assert.throws(()=>layout.validate({...standard,heights:[[10,10,Infinity]]}),/вершина/);
assert.throws(()=>layout.validate({...standard,heights:[[10,10,1800]]}),/вершина/);
assert.throws(()=>layout.resize(hill,{width:600}),/рельеф/);
assert.throws(()=>layout.resize(tiled,{width:600}),/ландшафт/);
assert.equal(layout.resize(standard,{width:5000,depth:5000,tileSize:50}).width,5000);
// Smooth a narrow elevated centre towards its neighbours; should NOT raise
// the neighbouring points by the new height of the centre within one pass.
const sharp=layout.validate({...standard,heights:[[50,50,20]]});
const soft=layout.sculpt(sharp,0,0,{
 mode:'smooth',radius:15,strength:20,seconds:.2
});
assert(layout.heightAt(soft,0,0)<20);
assert(layout.heightAt(soft,0,0)>0);
assert(Math.abs(layout.heightAt(soft,0,0)-20)>0.1);
console.log('PASS: kilometre world presets, sparse height brush raise/lower/smooth, valleys, save migration and limits');
