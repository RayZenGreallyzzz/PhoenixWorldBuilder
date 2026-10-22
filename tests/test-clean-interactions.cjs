const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
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
"const count=app.entries.length;",
"app.setMode('drone');if(!app.preview.root.visible)throw Error('Drone missing preview');",
"app.place();if(app.entries.length!==count+1)throw Error('Drone cannot place');",
"app.setMode('character');if(!app.preview.root.visible)throw Error('Avatar missing preview');",
"app.place();if(app.entries.length!==count+2)throw Error('Avatar cannot place');",
"app.setMode('build');",
"const wall=app.createEntry('wall',{position:[8,0,0]});app.entries.push(wall);app.scene.add(wall.root);",
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
 r=cp.spawnSync(browser,[
 '--headless','--no-sandbox','--disable-dev-shm-usage',
 '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-features=Vulkan','--virtual-time-budget=4500','--dump-dom',
 '--window-size=1440,900','file://'+temp
 ],{encoding:'utf8',timeout:30000,maxBuffer:25*1024*1024});
}finally{fs.unlinkSync(temp)}
if(!(r.stdout||'').includes('data-interaction-smoke="ok"')){
 const error=(r.stdout||'').match(/data-interaction-smoke="([^"]*)"/)?.[1]||'unknown';
 console.error('Interaction failure:',error,(r.stderr||'').slice(-1000));process.exit(1);
}
console.log('Chrome UI: build in drone/character, mount decor, bend/trim GLB and restore scene OK');
