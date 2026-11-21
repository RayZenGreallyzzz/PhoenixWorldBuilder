'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
const THREE=global.THREE=require(path.join(base,'js/three.min.js'));
global.PhoenixTerrainSplat=require(path.join(base,'engine/core/phoenix-terrain-splat.js'));
global.PhoenixWorldLayout=require(path.join(base,'engine/core/phoenix-world-layout.js'));
const WorldEditor=require(path.join(base,'engine/builder/phoenix-world-editor.js'));
const History=require(path.join(base,'js/editor-history.js'));
const Collision=require(path.join(base,'js/character-collision.js'));
class Element{
 constructor(id){
  this.id=id;this.value='';this.hidden=id==='phoenixWorldPanel';
  this.handlers={};this.textContent='';this.disabled=false;
  this.classList={toggle(){},add(){},remove(){}};
 }
 addEventListener(name,fn){this.handlers[name]=fn}
 setAttribute(name,value){this[name]=value}
 click(){this.handlers.click?.({target:this,preventDefault(){}})}
}
const ids=[
 'phoenixWorldPanel','btnPhoenixWorld','btnWorldClose','btnWorldGrid',
 'btnWorldApply','btnWorldOverview','btnWorldPaint','btnWorldErase',
 'btnWorldStopPaint','btnWorldClear','btnWorldFill',
 'worldCanvasPreset','worldTilePreset','worldTileStyle',
 'worldCanvasWidth','worldCanvasDepth','worldTileCustom',
 'worldCanvasInfo','worldPaintStatus','worldCanvasStatus',
 'btnWorldRaise','btnWorldLower','btnWorldSmooth','btnWorldClearHeights',
 'worldTextureChosen','btnWorldTexturePaint','btnWorldTextureErase',
 'btnWorldOpenTextures','btnWorldImportTexture','worldTextureScale',
 'worldTextureScaleValue','worldTextureOpacity','worldTextureOpacityValue',
 'worldTextureSoftness','worldTextureSoftnessValue','textureCategoryFilter',
 'worldTextureRadius','worldTextureRadiusValue',
 'importLandscapeTexture',
 'worldBrushRadius','worldBrushPower','worldBrushRadiusValue',
 'worldBrushPowerValue','smartCategoryFilter','btnCatalogLandscape'
];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
elements.worldBrushRadius.value='25';
elements.worldBrushPower.value='20';
elements.worldCanvasWidth.value='500';
elements.worldCanvasDepth.value='500';
elements.worldTileCustom.value='50';
elements.worldTileStyle.value='grass';
elements.worldTextureScale.value='4';
elements.worldTextureOpacity.value='100';
elements.worldTextureSoftness.value='65';
elements.worldTextureRadius.value='10';
const canvas={captured:new Set(),setPointerCapture(id){this.captured.add(id)},
 hasPointerCapture(id){return this.captured.has(id)},
 releasePointerCapture(id){this.captured.delete(id)}};
const doc={getElementById:id=>elements[id]||null,createElement(tag){
 assert.equal(tag,'canvas');
 const canvas={width:0,height:0};
 const ctx={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},
  putImageData(data){canvas.lastData=data.data}};
 canvas.getContext=()=>ctx;
 return canvas;
}};
global.window={addEventListener(){},confirm(){return true}};
const builder={
 canvas,scene:new THREE.Scene(),
 ground:new THREE.Mesh(new THREE.PlaneGeometry(128,128),
  new THREE.MeshStandardMaterial()),
 camera:new THREE.PerspectiveCamera(59,1,.05,240),
 controls:{target:new THREE.Vector3(),maxDistance:140,
  update(){}},
 collisionSolver:new Collision.Solver(),
 playBridge:{active:false},
 prefabEditor:{close(){},cancelPlacement(){}},
 skillEditor:{close(){}},
 skillDefinitionEditor:{close(){}},
 smartCatalogFolder:'all',
 textureFiles:[{id:'texture:landscape:grass',folder:'landscape-tiles',
  name:'Трава.png',width:1024,height:1024,bytes:2000000}],
 textureAsset:async()=>new THREE.Texture(),
 setTextureTab(){},
 renderTextureLibrary(){},
 history:new History(20),
 saved:0,
 rayPoint(e){return new THREE.Vector3(e.worldX||0,0,e.worldZ||0)},
 project(){
  return {version:2,objects:[{id:1,kind:'wall'}],
   worldCanvas:this.worldEditor?.serialize()||null};
 },
 recordEdit(snapshot){return this.history.record(snapshot||this.project())},
 save(){this.saved++;return true}
};
(async()=>{
const editor=builder.worldEditor=new WorldEditor(builder,doc);
assert.equal(editor.state.width,500);
assert.equal(editor.state.heights.length,0);
assert.equal(editor.gridVisible,false,'Grid is hidden until explicit button press');
assert.equal(editor.grid,null,'Never draw the grid automatically');
assert.equal(editor.flatPatches.size,100,'Default world has 100 50m render patches');
assert.equal(editor.instanced.size,1,'Default surface renders in ONE instanced drawcall');
assert.equal(builder.ground.visible,false,'Base plane hidden to allow below-ground sculpt');
assert.equal(editor.open(),true);
assert.equal(elements.phoenixWorldPanel.hidden,false);
assert.equal(editor.toggleGrid(),true);
assert(editor.grid,'Grid can be enabled explicitly');
assert.equal(editor.toggleGrid(),false);
assert.equal(editor.grid,null,'Grid hides again explicitly');
// 25km² uses instancing, not 10,000 drawcalls or a high-poly plane.
elements.worldCanvasWidth.value='5000';
elements.worldCanvasDepth.value='5000';
elements.worldTileCustom.value='50';
assert.equal(editor.applySizes(),true);
assert.equal(editor.flatPatches.size,10000,'5km² world is a sparse single instanced terrain layer');
assert.equal(editor.instanced.size,1);
assert.equal(editor.instanced.get('_default').count,10000);
assert(builder.camera.far>5000,'Camera far distance must cover the world');
assert.equal(builder.history.undoStack.length,1,'Changing world size is global Builder Undo');
assert.equal(editor.grid,null);
// Return to a smaller world to test brush editing and negative heights.
elements.worldCanvasWidth.value='500';
elements.worldCanvasDepth.value='500';
assert.equal(editor.applySizes(),true);
assert.equal(builder.history.undoStack.length,2);
assert.equal(editor.flatPatches.size,100);
assert.equal(editor.startSculpt('raise'),true);
assert.equal(elements.worldPaintStatus.textContent.includes('Undo/Redo'),true);
const oldCount=builder.history.undoStack.length;
const input=(type,id,x,z)=>editor.handleBrushPointer(type,{
 target:canvas,isPrimary:true,pointerId:id,worldX:x,worldZ:z,
 preventDefault(){},stopImmediatePropagation(){}
});
input('pointerdown',8,0,0);
editor.stroke.last-=140;
input('pointermove',8,5,0);
editor.stroke.last-=140;
input('pointermove',8,8,3);
input('pointerup',8,8,3);
assert.equal(builder.history.undoStack.length,oldCount+1,
 'A complete brush stroke must be exactly ONE shared Undo action');
assert.equal(builder.saved>0,true,'One stroke triggers native project save');
const height=editor.heightAt(0,0);
assert(height>.01,'Terrain should form a real hill');
assert(editor.sculptPatches.size>0,'Sculpted ground uses local deformed meshes');
let high=false;
for(const mesh of editor.sculptPatches.values()){
 const data=mesh.geometry.getAttribute('position');
 for(let i=0;i<data.count;i++)if(data.getY(i)>.1)high=true;
}
assert(high,'Visible GPU hill geometry must contain positive vertices');
assert(builder.collisionSolver.support(new THREE.Vector3(0,height,0),[])>.01,
 'Old player joystick collision solver must stand ON authored hills');
const saved=JSON.parse(JSON.stringify(builder.project()));
const blanked=await builder.history.undo(builder.project(),async project=>{
 editor.loadFromProject(project.worldCanvas,{preserveUI:true});
});
assert.equal(blanked,true);
assert.equal(editor.heightAt(0,0),0,'Undo must restore flat ground');
assert.equal(editor.gridVisible,false,'Undo must not turn the grid on');
assert.deepEqual(saved.objects,[{id:1,kind:'wall'}]);
const redone=await builder.history.redo(builder.project(),async project=>{
 editor.loadFromProject(project.worldCanvas,{preserveUI:true});
});
assert.equal(redone,true);
assert(Math.abs(editor.heightAt(0,0)-height)<.02,'Redo must restore the hill geometry');
assert.equal(editor.state.heights.length,saved.worldCanvas.heights.length);
editor.startSculpt('lower');
elements.worldBrushRadius.value='20';
elements.worldBrushPower.value='30';
for(let k=0;k<10;k++)editor.brushAt(0,0,.25);
assert(editor.heightAt(0,0)<0,'Lower brush can form valleys BELOW world Y=0');
let under=false;
for(const mesh of editor.sculptPatches.values()){
 const data=mesh.geometry.getAttribute('position');
 for(let i=0;i<data.count;i++)if(data.getY(i)<-.05)under=true;
}
assert(under,'GPU valley mesh must contain negative Y vertices');
assert.equal(builder.collisionSolver.support(
 new THREE.Vector3(0,editor.heightAt(0,0),0),[]),editor.heightAt(0,0),
 'Player ground physics must support below-zero valleys');
editor.startSculpt('smooth');
const rough=editor.heightAt(0,0);
editor.brushAt(0,0,.2);
assert(editor.heightAt(0,0)>=rough,'Smoothing a valley moves the bottom toward neighbours');
assert.equal(editor.clearHeights(),true);
assert.equal(editor.state.heights.length,0);
assert.equal(editor.sculptPatches.size,0);
// Painting a material tile uses the same global Builder history.
editor.startPainting(false);
const undoBeforePaint=builder.history.undoStack.length;
input('pointerdown',17,8,10);
input('pointerup',17,8,10);
assert.equal(builder.history.undoStack.length,undoBeforePaint+1);
assert.equal(editor.state.tiles.length,1);
assert.equal(editor.instanced.has('grass'),true);
// Round PNG/WebP landscape brush: same file reused, only RLE alpha masks saved.
const imageId='texture:landscape:grass';
assert.equal(editor.selectTexture(imageId),true);
await editor.ensureTexture(imageId);
assert.equal(editor.paintMode,'texture');
const beforeTextureHistory=builder.history.undoStack.length;
input('pointerdown',31,4,8);
input('pointerup',31,4,8);
assert.equal(builder.history.undoStack.length,beforeTextureHistory+1,
 'One texturing pencil stroke should enter the normal Builder Undo history');
assert.equal(editor.painter.materials().length,1);
assert(editor.painter.patches.size>0);
assert(editor.textureMeshes.size>0,'Image brush must render a real alpha-blended terrain mesh');
const overlay=[...editor.textureMeshes.values()][0].get(imageId);
assert(overlay&&overlay.mesh.material.map&&overlay.mesh.material.alphaMap);
assert(overlay.canvas.lastData.some(value=>value>0),
 'Feathered mask must be uploaded to the GPU alpha texture');
const mockShader={uniforms:{},
 fragmentShader:'#include <common>\n#include <map_fragment>'};
overlay.mesh.material.onBeforeCompile(mockShader);
assert(mockShader.fragmentShader.includes('worldPaintUV'),
 'Terrain material must repeat real source image without stretching across a hill');
assert(!mockShader.fragmentShader.includes('\\n'),
 'Generated GLSL shader must contain newlines, not literal escaped backslash-n tokens');
assert(mockShader.fragmentShader.includes('\nuniform vec2 terrainRepeat;'),
 'Texture-splatting shader must declare working GLSL uniforms');
assert(mockShader.fragmentShader.includes('terrainRepeat'),
 'Tile repeat uniform must use metres independently of alpha mask UV');
const importedImageOnce=builder.textureFiles.length;
const paintedSave=builder.project();
assert.equal(builder.textureFiles.length,importedImageOnce,
 'Painting cannot duplicate imported PNG/WebP library entries');
assert.equal(paintedSave.worldCanvas.paintMasks.some(p=>p.imageId===imageId),true);
assert(!JSON.stringify(paintedSave.worldCanvas).includes('data:image'),
 'Landscape world JSON must keep mask values + image references, not image bytes');
const sampleBeforeUndo=editor.painter.serialize();
await builder.history.undo(builder.project(),async doc=>
 editor.loadFromProject(doc.worldCanvas,{preserveUI:true}));
assert.equal(editor.painter.patches.size,0,'Shared Undo clears that texture brush stroke');
await builder.history.redo(builder.project(),async doc=>
 editor.loadFromProject(doc.worldCanvas,{preserveUI:true}));
assert.deepEqual(editor.painter.serialize(),sampleBeforeUndo,
 'Shared Redo restores the painted hill without new image files');
elements.worldTextureScale.value='8';
elements.worldTextureScale.handlers.change({target:elements.worldTextureScale});
assert.equal(editor.state.textureScale,8);
assert.equal(editor.serialize().textureScale,8,
 'Texture repeat size should persist in portable JSON');
assert.equal(editor.usesTexture(imageId),true);
assert.equal(editor.releaseTexture(imageId),false,
 'A painting in the project protects its source image from accidental deletion');
// Texture paint size is INDEPENDENT from the separate terrain-mountain radius.
editor.startTexturePaint(false);
elements.worldBrushRadius.value='125';
assert.equal(editor.setTextureBrushRadius(2,false),2);
assert.equal(elements.worldTextureRadiusValue.textContent,
 '2 м радиус · 4 м диаметр');
assert.equal(editor.currentBrushRadius(),2);
assert.equal(elements.worldBrushRadius.value,'125',
 'Changing texture brush must never alter the sculpt-mountain brush');
const previousPaint=editor.painter.paint;
let paintedRadius=NaN;
editor.painter.paint=(x,z,radius)=>{paintedRadius=radius;return []};
assert.equal(editor.paintTextureAt(12,12),false);
assert.equal(paintedRadius,2,
 'Actual texture splat painter must use its own selected brush size');
assert.equal(editor.setTextureBrushRadius(50,false),50);
editor.paintTextureAt(12,12);
assert.equal(paintedRadius,50,'Changing slider changes real texture brush radius');
editor.painter.paint=previousPaint;
assert.equal(editor.showBrushIndicator(0,0),true);
assert.equal(editor.brushIndicator.visible,true);
const ring=editor.brushIndicator.geometry.getAttribute('position');
assert(ring.count>=64*6);
const ringPoint=(index=0)=>Math.hypot(ring.getX(index),ring.getZ(index));
assert(Math.abs(ringPoint()-50)<2,
 'Visible brush ring radius must match selected size in metres');
assert.equal(editor.setTextureBrushRadius(5,false),5);
assert(Math.abs(ringPoint()-5)<1,'Ring must resize immediately when brush slider changes');
input('pointermove',404,20,25);
assert.equal(editor.brushIndicator.visible,true,'Move pointer shows terrain brush outline');
assert(Math.abs(ring.getX(0)-25)<6,
 'Outline follows pointer across the actual terrain');
input('pointerdown',405,0,0);
assert(editor.brushIndicator.visible,'Touch-down shows live brush boundary');
input('pointerup',405,0,0);
assert.equal(editor.brushIndicator.visible,false,'Release hides the interactive brush preview');
editor.stopPainting();
assert.equal(editor.brushIndicator.visible,false);
editor.startSculpt('raise');
assert.equal(editor.currentBrushRadius(),125,
 'Mountain sculpt radius is still separate from terrain texture radius');
editor.stopPainting();
// Old UV44 documents without worldCanvas are migrated to original size.
editor.loadFromProject(null);
assert.equal(editor.state.width,128);
assert.equal(editor.state.depth,128);
assert.equal(editor.state.heights.length,0);
assert.equal(editor.grid,null);
console.log('PASS: 5km world, sparse hills/valleys, touch brush, shared Builder Undo/Redo, JSON, collision and opt-in grid');
})().catch(error=>{console.error(error);process.exitCode=1});
