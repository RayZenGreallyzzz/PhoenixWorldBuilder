const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const Open=require(path.join(base,'js/wall-openings.js'));
const Collision=require(path.join(base,'js/character-collision.js'));
const Catalog=require(path.join(base,'js/smart-catalog.js'));
const ZipCode=fs.readFileSync(path.join(base,'js/zip-helper.js'),'utf8');
const context=vm.createContext({Blob,TextEncoder,TextDecoder,
 Uint8Array,Uint32Array,ArrayBuffer,DataView,Response,DecompressionStream,
 console,Math});
vm.runInContext(ZipCode,context);
const Zip=context.ZipUtils||vm.runInContext('ZipUtils',context);
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const near=(n,value,label,t=.04)=>assert(Math.abs(n-value)<t,label+': '+n+' vs '+value);
const categories=[
 ['Мои модели/Стены/Кирпичная Стена.glb','walls','wall'],
 ['pack/corners/Угол 90° GLB.glb','corners','wall'],
 ['pack/ЛЕСТНИЦЫ/spiral_stair.glb','stairs','prop'],
 ['models/floors/плитка.glb','floors','floor'],
 ['pack/Потолок/cieling-01.glb','ceilings','floor'],
 ['models/roof_mansard.glb','roofs','roof'],
 ['models/windows/decoration.glb','windows','prop'],
 ['models/doors/gothic-door.glb','doors','prop'],
 ['models/frames/frame.glb','frames','prop'],
 ['models/decor/flower.glb','decor','decor'],
 ['some/strangeAsset_77.glb','my-modules','prop'],
 ['Textures/Stone_D.png','textures',null],
 ['Мои текстуры/stone.png','my-textures',null]
];
for(const [file,folder,category] of categories){
 const found=Catalog.classify(file);
 assert.equal(found?.folder,folder,'Wrong folder for '+file);
 if(category)assert.equal(found.category,category,'Wrong physics/build category');
}
assert.equal(Catalog.classify('walls/brick-stair.glb').folder,'walls',
 'An organised parent folder must beat ambiguous filename words');
assert.equal(Catalog.classify('myModel.glb','stairs').folder,'stairs',
 'User can manually override smart classification');
assert.equal(Catalog.classify('файл.fbx'),null,'Never claim FBX is supported by GLB importer');
assert(!Catalog.safeEntry('../unsafe/door.glb'),'Reject zip traversal');
assert(!Catalog.safeEntry('__MACOSX/._door.glb'),'Reject macOS resource forks');
assert.equal(Catalog.filteredEntries([
 {name:'Северная Стена',folder:'walls',path:'walls/stena.glb'},
 {name:'Южная лестница',folder:'stairs',path:'stairs/stairs.glb'}],'walls','север').length,1);
const root=CleanGeometry.create('wall');
const originalPosition=root.position.clone();
const solver=new Collision.Solver({radius:.23,height:1.7});
let solid={root,kind:'wall',category:'wall'};
const normalPath=solver.move(V(.74,0,-1),V(0,0,2),[solid]);
assert(normalPath.blocked,'Closed wall blocks character motion');
assert(normalPath.position.z<-.17,'Cannot walk through solid wall');
assert(root.position.equals(originalPosition),'Collision must never move building geometry');
const passage={id:'hole',group:'hole',type:'passage',x:0,y:0,w:1.2,h:2.1};
const holeRoot=CleanGeometry.create('wall'),render=Open.render(holeRoot,'wall',[passage],
 {thickness:.22,axes:{x:1,y:1,z:1}});
assert(render.ok,render.reason||'Wall cut failed');
const holeWall={root:holeRoot,kind:'wall',category:'wall'};
const through=solver.move(V(0,0,-1),V(0,0,2),[holeWall]);
assert(through.position.z>.8,
 'Character physically passes through missing triangles of a true open doorway');
assert(!through.blocked,'Empty passage has no invisible full-wall box');
const nextTo=solver.move(V(.9,0,-1),V(0,0,2),[holeWall]);
assert(nextTo.position.z<-.17,'Wall remains solid just outside opening');
const windowRoot=CleanGeometry.create('wall');
const windowCut={...passage,id:'window',group:'window',type:'window',y:.9,h:1.1};
assert(Open.render(windowRoot,'wall',[windowCut],{thickness:.22,axes:{x:1,y:1,z:1}}).ok);
const windowMotion=solver.move(V(0,0,-1),V(0,0,2),[
 {root:windowRoot,kind:'wall',category:'wall'}]);
assert(windowMotion.position.z<-.17,'A glazed window is not an open walk-through passage');
// Imported static GLB mesh can collide even if it does not have a wall-category label.
const imported=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.2),
 new THREE.MeshStandardMaterial({side:THREE.FrontSide}));
mesh.position.y=1;imported.add(mesh);
const againstImport=solver.move(V(0,0,-1),V(0,0,2),
 [{root:imported,category:'prop',kind:'glb:door'}]);
assert(againstImport.position.z<-.17,'Imported module with FrontSide material blocks player');
assert.equal(mesh.material.side,THREE.FrontSide,'Temporary collision ray test restores original GLB material');
const noCollision=solver.move(V(0,0,-1),V(0,0,2),[
 {root:imported,category:'prop',collision:false}]);
assert(noCollision.position.z>.8,'Per-entry disabled collision does not obstruct player');
// Walkable floor/short stair: support Y follows actual polygon height.
const stairRoot=new THREE.Group(),stair=new THREE.Mesh(new THREE.BoxGeometry(1,.22,1),
 new THREE.MeshStandardMaterial());
stair.position.set(0,.11,0);stairRoot.add(stair);
const step=solver.move(V(0,0,-.9),V(0,0,.7),[
 {root:stairRoot,kind:'glb:stairs',category:'prop'}]);
near(step.position.y,.22,'Small stairs are walkable',.03);
const floorRoot=CleanGeometry.create('floor');
near(solver.move(V(0,0,0),V(.07,0,0),[{root:floorRoot,category:'floor'}]).position.y,
 .18,'Player support follows floor slab',.03);
// ZIP extraction with model + actual image bytes, including paths and CRCs.
(async()=>{
 const glb=new Uint8Array(32);const dv=new DataView(glb.buffer);
 dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,32,true);
 const image=new Uint8Array([137,80,78,71,1,2,3,4,5,6]);
 const packed=await Zip.build({
  'Walls/Дом-1.glb':glb,
  'My Textures/stone.png':image
 });
 const raw=new Uint8Array(await packed.arrayBuffer());
 const files=await Zip.extract(packed);
 assert.deepEqual([...files['Walls/Дом-1.glb']],[...glb]);
 assert.deepEqual([...files['My Textures/stone.png']],[...image]);
 const corrupt=raw.slice(),ld=new DataView(corrupt.buffer);
 const len=ld.getUint16(26,true);corrupt[30+len]^=0x01;
 await assert.rejects(Zip.extract(new Blob([corrupt])),/CRC|Поврежд/);
 await assert.rejects(Zip.extract(packed,{maxTotal:5}),/большой|памят/);
 // ZIP method 8 uses DEFLATE (normal Android/Windows 7zip default).
 const compressed=zlib.deflateRawSync(glb),fileName='models/model.glb';
 const store=await Zip.build({[fileName]:glb});
 const old=new Uint8Array(await store.arrayBuffer()),view=new DataView(old.buffer);
 const cd=view.getUint32(old.length-6,true);
 const payloadStart=30+view.getUint16(26,true)+view.getUint16(28,true);
 const payloadEnd=payloadStart+glb.length,shift=compressed.length-glb.length;
 const output=new Uint8Array(old.length+shift);
 output.set(old.slice(0,payloadStart));output.set(compressed,payloadStart);
 output.set(old.slice(payloadEnd),payloadStart+compressed.length);
 const o=new DataView(output.buffer),cdo=cd+shift;
 o.setUint16(8,8,true);o.setUint32(18,compressed.length,true);
 o.setUint16(cdo+10,8,true);o.setUint32(cdo+20,compressed.length,true);
 o.setUint32(output.length-6,cdo,true);
 const deflated=await Zip.extract(new Blob([output]));
 assert.deepEqual([...deflated[fileName]],[...glb],'DEFLATE ZIP restores exact GLB bytes');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
 const workflow=fs.readFileSync(path.resolve(base,'../../../../.github/workflows/android-apk.yml'),'utf8');
 for(const id of ['importZip','zipFolderOverride','zipImportStatus','smartCategoryFilter',
  'smartCatalogSearch','textureCategoryFilter','textureSearch','enableCollisions'])
  assert(html.includes('id="'+id+'"'),'Missing ZIP/physics control '+id);
 assert(html.indexOf('js/zip-helper.js')<html.indexOf('js/clean-app.js'));
 assert(html.indexOf('js/character-collision.js')<html.indexOf('js/clean-app.js'));
 for(const term of ['this.importZIP(file)','this.collisionSolver.move(previous,step,this.entries)',
  'loadCatalogMeta(){','this.catalogMeta.keys()','catalogLibrary:[...this.catalogMeta.values()]',
  'CatalogPreview.observeCards','this.loadTextureThumbnail','async ensureTemplate('])
  assert(app.includes(term),'ZIP library/physics not integrated: '+term);
 assert(workflow.includes('pako@2.1.0'),'APK must include offline ZIP DEFLATE decoder');
 console.log('Smart ZIP folders, stored+deflate+CRC ZIP, real doorway, window, GLB collisions and step support OK');
})().catch(err=>{console.error(err);process.exit(1)});
