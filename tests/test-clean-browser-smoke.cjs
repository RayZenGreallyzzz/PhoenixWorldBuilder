const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const candidates=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
let executable=null;
for(const bin of candidates){
 const r=spawnSync('which',[bin],{encoding:'utf8'});
 if(r.status===0){executable=r.stdout.trim();break}
}
if(!executable){
 console.log('No Chrome on runner: DOM smoke skipped, static geometry suite remains required');
 process.exit(0);
}
const file='file://'+path.resolve(__dirname,'../app/src/main/assets/index.html');
const args=[
 '--headless','--no-sandbox','--disable-dev-shm-usage',
 '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-features=Vulkan','--virtual-time-budget=3000','--dump-dom',
 '--window-size=1440,900',file];
const result=spawnSync(executable,args,{encoding:'utf8',timeout:25000,maxBuffer:20*1024*1024});
const dom=result.stdout||'';
if(dom.includes('data-clean-ready="true"')){
 console.log('Clean Builder WebGL starts in headless Chromium with UI and Three.js active.');
 process.exit(0);
}
const error=(dom.match(/<span id="status">([^<]+)/)||[])[1]||'';
console.error('Clean viewer failed headless start', {exit:result.status,status:error,stderr:(result.stderr||'').slice(-1500)});
process.exit(1);
