const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=path.join(__dirname,'../app/src/main/assets/js');
const SmartPackage=require(path.join(js,'smart-package.js'));
const files=[
 'My fantasy pack/models/Wall_01.glb',
 'My fantasy pack/textures/Wall_01_basecolor.png',
 'My fantasy pack/Гобелены/Королевский гобелен.jpg',
 'My fantasy pack/Картины/Страж.png',
 'My fantasy pack/Облицовка наружная/Stone_Dark.png',
 'My fantasy pack/models/Wall_Corner90.glb',
 'My fantasy pack/Гобелены/Wall_Corner90.png'
];
const plan=SmartPackage.analyze(files);
assert.equal(plan.models.length,2);
assert.equal(plan.pictures.length,3);
assert.equal(plan.textures.length,2);
assert.equal(plan.models[0].category,'wall');
assert.equal(plan.models[1].category,'corner');
assert.equal(plan.bindings.get(files[0]).slots[0].path,files[1],
 'Exact basecolor texture is linked to corresponding GLB');
assert.equal(plan.bindings.has(files[5]),false,
 'A painting with a similar filename must never overwrite a GLB material');
assert.equal(SmartPackage.lookup(files,'textures/wall_01_basecolor.png'),files[1],
 'Nested archives resolve one extra package root');
const ambiguous=SmartPackage.analyze([
 'models/Pillar01.glb','texture/Pillar01_albedo.png','texture/Pillar01_basecolor.jpg']);
assert.equal(ambiguous.bindings.size,0,'Ambiguous assets require user review instead of false links');
const explicit=SmartPackage.analyze(['pack/models/wall.glb','pack/images/a.png'],{
 models:[{path:'models/wall.glb',category:'wall',materials:[{name:'Main',texture:'images/a.png'}]}],
 images:[{path:'images/a.png',role:'painting'}]
});
assert.equal(explicit.pictures.length,1);
assert.equal(explicit.bindings.get('pack/models/wall.glb').slots[0].name,'Main');
assert.equal(explicit.bindings.get('pack/models/wall.glb').slots[0].path,'pack/images/a.png');
console.log('Automatic ZIP roles, metadata, nested paths and conservative model materials OK');
