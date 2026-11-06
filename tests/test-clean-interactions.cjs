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
"const categories={structure:6,doors:5,frames:4,roofs:8};",
"for(const [group,expected] of Object.entries(categories)){const btn=document.querySelector('#catalogQuick [data-catalog-group='+group+']');if(!btn)throw Error('No quick category '+group);btn.click();const visible=document.querySelectorAll('#catalogItems .catalogGroup:not([hidden]) .catalogRows button');if(visible.length<expected)throw Error('Missing visible '+group+' modules: '+visible.length);}",
"document.querySelector('#catalogQuick [data-catalog-group=structure]').click();",
"if(!app.previewOutline||!app.previewOutline.visible)throw Error('3D preview lacks contrast outline');",
"const count=app.entries.length;",
"app.setMode('drone');if(!app.preview.root.visible)throw Error('Drone missing preview');",
"app.place();if(app.entries.length!==count+1)throw Error('Drone cannot place');",
"app.setMode('character');if(!app.preview.root.visible)throw Error('Avatar missing preview');",
"app.place();if(app.entries.length!==count+2)throw Error('Avatar cannot place');",
"app.setMode('build');",
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
"const arcWall=app.createEntry('arc180',{position:[15,0,0]});app.entries.push(arcWall);app.scene.add(arcWall.root);",
"app.selected=arcWall;",
"for(const [id,value] of Object.entries({openingX:0,openingBottom:90,openingWidth:100,openingHeight:100}))document.getElementById(id).value=value;",
"app.addOpening();if(arcWall.openings.length!==1)throw Error('Semicircular window did not cut real wall');",

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
    '--window-size=1440,900','file://'+temp
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
