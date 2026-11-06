const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../app/src/main/assets');let browser=null;
for(const bin of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
 const r=cp.spawnSync('which',[bin],{encoding:'utf8'});
 if(r.status===0){browser=r.stdout.trim();break}
}
if(!browser){console.log('Chrome not installed; UI smoke skipped');process.exit(0)}
const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[
"window.addEventListener('DOMContentLoaded',()=>{",
"try{",
"const app=window.PhoenixClean;",
"if(!app||document.body.dataset.cleanReady!=='true')throw Error('Editor init failed');",
"const library=document.getElementById('catalogItems');",
"if(library.getBoundingClientRect().height<145)throw Error('Catalogue squashed and modules hidden on Android-sized screen');",
"if(document.getElementById('catalogImport').open)throw Error('GLB import must be collapsed by default');",
"const categories={structure:5,doors:5,frames:4,roofs:9};",
"for(const [group,expected] of Object.entries(categories)){const btn=document.querySelector('#catalogQuick [data-catalog-group='+group+']');if(!btn)throw Error('No quick category '+group);btn.click();const visible=document.querySelectorAll('#catalogItems .catalogGroup:not([hidden]) .catalogRows button');if(visible.length<expected)throw Error('Missing visible '+group+' modules: '+visible.length);}",
"document.querySelector('#catalogQuick [data-catalog-group=structure]').click();",
"if(!app.previewOutline||!app.previewOutline.visible)throw Error('3D preview lacks contrast outline');",
"const count=app.entries.length;",
"app.setMode('drone');if(!app.preview.root.visible)throw Error('Drone missing preview');",
"app.place();if(app.entries.length!==count+1)throw Error('Drone cannot place');",
"app.setMode('character');if(!app.preview.root.visible)throw Error('Avatar missing preview');",
"app.place();if(app.entries.length!==count+2)throw Error('Avatar cannot place');",
"app.setMode('build');",
"const avatarToggle=document.getElementById('avatarInBuild');avatarToggle.checked=true;avatarToggle.dispatchEvent(new Event('change'));",
"if(!app.player.visible)throw Error('Fitted character is invisible during construction after opt-in');",
"app.setMode('drone');if(app.player.visible)throw Error('Drone unexpectedly shows avatar model');",
"app.setMode('character');if(!app.player.visible)throw Error('Character mode lost visible imported avatar');",
"app.setMode('build');",
"document.getElementById('btnQuickImportGLB').click();if(!document.getElementById('catalogImport').open)throw Error('Quick GLB import is still hidden');",
"document.getElementById('catalogImport').open=false;",
"if(!app.controls.enablePan||app.controls.screenSpacePanning)throw Error('Building camera is still locked to map centre');",
"const focusedObject=app.entries[0];const originalPos=focusedObject.root.position.clone();",
"const originalOffset=app.camera.position.clone().sub(app.controls.target);",
"app.selected=focusedObject;app.setTool('pick');document.getElementById('btnFocusCamera').click();",
"const focusCenter=new THREE.Box3().setFromObject(focusedObject.root).getCenter(new THREE.Vector3());",
"if(app.controls.target.distanceTo(focusCenter)>.0001)throw Error('Focus button did not change orbit pivot');",
"if(app.camera.position.clone().sub(app.controls.target).distanceTo(originalOffset)>.0001)throw Error('Moving pivot changed camera orientation');",
"if(focusedObject.root.position.distanceTo(originalPos)>.000001)throw Error('Camera focus accidentally moved constructed wall');",
"app.selected=null;app.setTool('place');document.getElementById('btnFocusCamera').click();",
"if(!app.cameraFocusPick)throw Error('No tap-to-focus mode when nothing selected');",
"document.getElementById('btnFocusCamera').click();if(app.cameraFocusPick)throw Error('Cannot cancel focus tap');",
"app.setMode('character');if(app.controls.enablePan)throw Error('Character follow panning unexpectedly changed');",
"app.setMode('build');if(!app.controls.enablePan)throw Error('Free camera lost after character mode');",
"app.selectKind('wall');app.magnet=false;app.gridSnap=false;app.cursor.set(1.234,0,2.567);app.updatePreview(app.cursor);",
"if(Math.abs(app.preview.root.position.x-1.234)>.00001||Math.abs(app.preview.root.position.z-2.567)>.00001)throw Error('Magnet off still forces old 25 cm grid');",
"app.gridSnap=true;app.gridStep=.25;app.updatePreview(app.cursor);if(Math.abs(app.preview.root.position.x-1.25)>.00001)throw Error('Explicit grid does not snap');",
"app.gridSnap=false;app.updatePreview(app.cursor);",
"document.getElementById('posX').value='1.237';app.editField('posX');",
"if(Math.abs(app.preview.root.position.x-1.237)>.00001)throw Error('Manual 1mm coordinate was overwritten by preview cursor');",
"app.place();const fine=app.entries[app.entries.length-1];app.setTool('pick');app.selected=fine;",
"document.getElementById('moveStep').value='.001';const before=fine.root.position.clone();app.nudgeSelected(1,0);app.nudgeSelected(0,0,1);",
"if(Math.abs(fine.root.position.x-before.x-.001)>.000001||Math.abs(fine.root.position.y-before.y-.001)>.000001)throw Error('1mm X/Y nudges failed');",
"app.setTool('place');app.selected=null;",

"for(const kind of ['doorRound','frameGothic','roofHip4','roofFantasySpire']){app.selectKind(kind);if(!app.preview?.root)throw Error('Missing architecture prefab '+kind);app.place()}",
"const wall=app.createEntry('wall',{position:[8,0,0]});app.entries.push(wall);app.scene.add(wall.root);",
"const neighbor=app.createEntry('wall',{position:[10,0,0]});app.entries.push(neighbor);app.scene.add(neighbor.root);",
"app.setTool('pick');app.selected=wall;",
"for(const [id,value] of Object.entries({openingType:'window',openingX:75,openingBottom:90,openingWidth:90,openingHeight:100}))document.getElementById(id).value=value;",
"app.addOpening();if(wall.openings.length!==1||neighbor.openings.length!==1)throw Error('Window did not span joined walls');",
"const passageWall=app.createEntry('wall',{position:[24,0,0]});const passageNeighbor=app.createEntry('wall',{position:[26,0,0]});for(const e of [passageWall,passageNeighbor]){app.entries.push(e);app.scene.add(e.root)}",
"app.selected=passageWall;app.openingPickMode=false;app.startOpeningTool();",
"if(!document.getElementById('openingPanel').open||document.getElementById('openingPanel').style.display==='none')throw Error('Door hole editor hidden behind options');",
"document.getElementById('openingSizePreset').value='155:212';document.getElementById('openingSizePreset').dispatchEvent(new Event('change'));",
"if(Number(document.getElementById('openingWidth').value)!==155||Number(document.getElementById('openingHeight').value)!==212)throw Error('Door size preset not applied');",
"document.getElementById('openingPositionPreset').value='end';document.getElementById('openingPositionPreset').dispatchEvent(new Event('change'));",
"if(Math.abs(Number(document.getElementById('openingX').value)-100)>.01)throw Error('Joint centering unavailable');",
"document.getElementById('openingType').value='passage';document.getElementById('openingWidth').value=95;document.getElementById('openingHeight').value=210;document.getElementById('openingBottom').value=0;",
"app.addOpening();const bare=passageWall.openings.find(o=>o.type==='passage');if(!bare)throw Error('Empty doorway not cut');",
"if(!passageNeighbor.openings.some(o=>o.type==='passage'))throw Error('Empty doorway failed to cut across seam');",
"if(passageWall.root.getObjectByName('phoenixOpening:'+bare.id))throw Error('Bare passage still has a fake door');",
"app.selected=wall;app.syncInspector();",
"const arcWall=app.createEntry('arc180',{position:[15,0,0]});app.entries.push(arcWall);app.scene.add(arcWall.root);",
"app.selected=arcWall;",
"for(const [id,value] of Object.entries({openingX:0,openingBottom:90,openingWidth:100,openingHeight:100}))document.getElementById(id).value=value;",
"app.addOpening();if(arcWall.openings.length!==1)throw Error('Semicircular window did not cut real wall');",
"app.selected=arcWall;app.setTool('pick');app.syncInspector();",
"for(const [id,val] of Object.entries({textureStyle:'stone',textureMapping:'repeat',textureTileMeters:'.55',textureImageScale:'1.2',textureRotation:'12',textureOffsetU:'.14',textureOffsetV:'-.08',textureRoughness:'.98',textureMetalness:'0',textureRelief:'.45'}))document.getElementById(id).value=val;",
"document.getElementById('textureApplyFrames').checked=true;app.changeSurface();",
"if(Math.abs(arcWall.surface.tileMeters-.55)>.001||Math.abs(arcWall.surface.roughness-.98)>.001||arcWall.surface.relief<.4)throw Error('Workshop slider settings did not apply');",
"const paintedArc=arcWall.root.getObjectByName('structure:wall')||arcWall.root.children.find(c=>c.isMesh&&!c.userData.phoenixInsert);",
"if(!paintedArc?.geometry?.getAttribute('uv')||Math.abs(paintedArc.material.roughness-.98)>.001)throw Error('Real-metre arc UV / matte PBR not applied');",
"if(!paintedArc.material.normalMap)throw Error('Workshop relief did not create normal map from procedural texture');",
"app.applySurfaceToAllWalls();",
"if(!wall.surface||wall.surface.tileMeters!==.55||!neighbor.surface||neighbor.surface.roughness!==.98)throw Error('Material not copied consistently to same-floor walls');",
"const glass=wall.root.getObjectByName('window:glass'),frame=wall.root.getObjectByName('frame:left');",
"if(!glass||!frame||Math.abs(frame.material.roughness-.98)>.001||Math.abs(glass.material.roughness-.98)<.001)throw Error('Frame paint should not alter window glass');",
"const painted=app.project();if(!painted.objects.find(o=>o.id===arcWall.id)?.surface?.mapping)throw Error('Mesh Workshop material not serialized');",

"const decor=new THREE.Group();decor.add(new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.08),new THREE.MeshStandardMaterial()));",
"app.assets.set('glb:decor',{template:decor,name:'Picture',category:'decor'});",
"app.selectKind('glb:decor');app.surfaceHit={point:new THREE.Vector3(8,1.4,.11),normal:new THREE.Vector3(0,0,1),entry:wall};",
"app.updatePreview(app.surfaceHit.point);if(!app.preview._hasWallTarget)throw Error('No wall mount');",
"app.place();if(app.entries[app.entries.length-1].category!=='decor')throw Error('Wrong decor category');",
"const source=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,.2,3,1,1),new THREE.MeshStandardMaterial());",
"source.add(mesh);const original=Array.from(mesh.geometry.attributes.position.array);",
"app.assets.set('glb:cut',{template:source,name:'Cut',category:'prop'});app.selectKind('glb:cut');",
"for(const [id,v] of Object.entries({trimAxis:'x',trimStart:20,trimEnd:10,bendAxis:'x',bendAngle:55}))document.getElementById(id).value=v;",
"app.applyMeshSettings();if(app.preview.meshEdit.bend!==55)throw Error('Bend failed');",
"app.place();const project=app.project();",
"if(!project.objects.some(o=>o.meshEdit?.bend===55))throw Error('Edited object not persisted');",
"if(JSON.stringify(Array.from(mesh.geometry.attributes.position.array))!==JSON.stringify(original))throw Error('Source corrupted');",
"app.restore(project).then(()=>{",
"if(app.entries.length!==project.objects.length||!app.entries.some(e=>e.category==='decor'))throw Error('Reload changed scene');",
"document.body.dataset.interactionSmoke='ok';",
"}).catch(err=>document.body.dataset.interactionSmoke='error:'+err.message);",
"}catch(err){console.error(err);document.body.dataset.interactionSmoke='error:'+err.message}",
"});"
].join('\n');
const temp=path.join(root,'__interaction_smoke__.html');
const html=original.replace('</body>','<script>'+source+'</script></body>');
if(original===html)throw Error('HTML append failed');
fs.writeFileSync(temp,html);let r;
try{
 for(let attempt=0;attempt<2;attempt++){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-interact-'));
  try{
   r=cp.spawnSync(browser,[
    '--user-data-dir='+profile,'--no-first-run','--disable-extensions',
    '--headless','--no-sandbox','--disable-dev-shm-usage',
    '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
    '--disable-features=Vulkan','--virtual-time-budget=4500','--dump-dom',
    '--window-size=1280,800','file://'+temp
   ],{encoding:'utf8',timeout:45000,maxBuffer:25*1024*1024});
  }finally{fs.rmSync(profile,{recursive:true,force:true})}
  if((r.stdout||'').includes('data-interaction-smoke="ok"'))break;
  console.warn('Retrying transient headless UI interaction failure '+(attempt+1)+'/2');
 }
}finally{fs.unlinkSync(temp)}
if(!(r.stdout||'').includes('data-interaction-smoke="ok"')){
 const error=(r.stdout||'').match(/data-interaction-smoke="([^"]*)"/)?.[1]||'unknown';
 console.error('Interaction failure:',error,(r.stderr||'').slice(-1000));process.exit(1);
}
console.log('Chrome UI: build in drone/character, mount decor, bend/trim GLB and restore scene OK');
