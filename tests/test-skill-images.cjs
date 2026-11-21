'use strict';
const assert=require('node:assert/strict');
const Images=require('../app/src/main/assets/engine/core/phoenix-skill-images.js');
const Skills=require('../app/src/main/assets/engine/core/phoenix-skills.js');
const Layout=require('../app/src/main/assets/engine/core/phoenix-skill-layout.js');
const png='data:image/png;base64,'+
 Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const webp='data:image/webp;base64,'+
 Buffer.from('RIFF0000WEBPVP8 ','ascii').toString('base64');
assert.equal(Images.validate(png),png);
assert.equal(Images.validate(webp),webp);
assert.equal(Images.validate(undefined),'');
assert.throws(()=>Images.validate('https://example.com/skill.png'),/PNG|WebP/);
assert.throws(()=>Images.validate('data:image/svg+xml;base64,PHN2Zz4='),/PNG|WebP/);
assert.throws(()=>Images.validate('data:text/html;base64,PHNjcmlwdD4='),/PNG|WebP/);
assert.throws(()=>Images.validate('data:image/png;base64,'+
 Buffer.from('notpng').toString('base64')),/header/);
assert.throws(()=>Images.validate('data:image/png;base64,'+'A'.repeat(Images.MAX_DATA_CHARS)),/oversized/);
assert.equal(Images.supported({type:'image/png',name:'skill.png'}),true);
assert.equal(Images.supported({type:'image/webp',name:'skill.webp'}),true);
assert.equal(Images.supported({type:'application/javascript',name:'script.js'}),false);
assert.equal(Images.supported({type:'image/svg+xml',name:'skill.svg'}),false);
const def={name:'Сфера',description:'Урон',icon:'⚡',iconImage:png,
 type:'damage',basePower:50,growth:10,level:1,maxLevel:3,
 manaCost:20,cooldown:5,range:8,animation:'cast'};
const catalog=new Skills.Catalog();
catalog.set('player','slot3',def);
catalog.set('prefab-1','slot3',{...def,iconImage:webp});
const snapshot=JSON.parse(JSON.stringify(catalog.serialize()));
const restored=new Skills.Catalog();restored.load(snapshot);
assert.equal(restored.get('player','slot3').iconImage,png);
assert.equal(restored.get('prefab-1','slot3').iconImage,webp);
assert.equal(Layout.update(Layout.defaultLayout(),'slot3',{image:webp}).slots[2].image,webp);
assert.throws(()=>catalog.set('player','slot3',{...def,iconImage:'javascript:alert(1)'}),/PNG|WebP/);
assert.equal(catalog.get('player','slot3').iconImage,png,'Invalid image must not overwrite existing ability');
(async()=>{
 let revoked=false;
 const originalImage=global.Image;
 const originalCreate=URL.createObjectURL;
 const originalRevoke=URL.revokeObjectURL;
 let createdCanvas;
 try{
  global.Image=class {
   naturalWidth=900;naturalHeight=500;
   set src(value){queueMicrotask(()=>this.onload());}
  };
  URL.createObjectURL=()=> 'blob:local-skill';
  URL.revokeObjectURL=()=>{revoked=true};
  const doc={createElement(tag){
   assert.equal(tag,'canvas');
   createdCanvas={width:0,height:0,getContext(){
    return {clearRect(){},drawImage(){}};
   },toDataURL(){return png}};
   return createdCanvas;
  }};
  const selected=await Images.fromFile({name:'fire.png',type:'image/png',size:360000},doc);
  assert.equal(selected,png);
  assert(createdCanvas.width<=192&&createdCanvas.height<=192);
  assert.equal(revoked,true,'Temporary Android blob URL must be released');
  await assert.rejects(Images.fromFile({name:'virus.svg',type:'image/svg+xml',size:42},doc),/PNG|WebP/);
  await assert.rejects(Images.fromFile({name:'huge.webp',type:'image/webp',size:9e6},doc),/6 МБ/);
 }finally{
  global.Image=originalImage;
  URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
 }
 console.log('PASS: PNG/WebP picker, safe resizing, embed in skill/HUD JSON, invalid data rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
