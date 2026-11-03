#!/usr/bin/env node
/* Deterministic smoke test for inline game mode without GPU.
 * Uses real Three.js geometry but stubs WebGL, GLB IO and Android bridge.
 */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=process.cwd();
const {JSDOM}=require(path.resolve(root,'build/node/node_modules/jsdom'));
const html=fs.readFileSync(path.resolve(root,'build/viewer/game.html'),'utf8');
const code=html.split('<script>')[1].split('</script>')[0];
assert(code.includes('function placeData()'),'Game controller not found');
const dom=new JSDOM(html,{url:'https://phoenix3d.local/game.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
let latest=null,saveCount=0,selectedGLB=0,savedBundles=0,loadedBundles=0,chosenDecor=0;
w.innerWidth=640;w.innerHeight=480;w.devicePixelRatio=1;
w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
w.GameBridge={
 saveScene(json){latest=JSON.parse(json);saveCount++;},
 chooseCharacter(){selectedGLB++;},
 choosePlannerJson(){},exportGameMap(){},openNativeBuilder(){},
 chooseDecor(){chosenDecor++;},saveBundle(){savedBundles++;},loadBundle(){loadedBundles++}
};
w.fetch=async url=>({ok:true,json:async()=>url.includes('game-scene')?{version:1,items:[]}:{className:'Project',items:[]}});
// Evaluate exactly the browser Three.js build that gets bundled into the APK.
w.eval(fs.readFileSync(path.resolve(root,'build/viewer/three.min.js'),'utf8'));
const THREE=w.THREE;
assert(THREE&&typeof THREE.Scene==='function','Browser Three.js failed to initialize');
THREE.WebGLRenderer=class {
 constructor(){this.capabilities={getMaxAnisotropy:()=>4};this.outputEncoding=THREE.sRGBEncoding;}
 setPixelRatio(){}setSize(){}render(){}
};
THREE.GLTFLoader=class {load(url,onLoad,onProgress,onError){if(onError)onError(new Error('test has no GLB'));}};
THREE.TextureLoader=class {load(url,onLoad,onProgress,onError){if(onError)onError(new Error('test has no PNG'));}};
w.THREE=THREE;
function click(id){
 const el=w.document.getElementById(id);assert(el,'Missing button #'+id);el.click();
}
async function main(){
 w.eval(code);
 await new Promise(resolve=>setTimeout(resolve,40));
 click('btnBuild');
 assert(w.document.querySelector('#panel').classList.contains('open'),'Build panel not visible');
 click('btnPlace');
 assert(latest?.version===1,'No saved game scene');
 assert(latest.items.length===1,'Expected 1 placed wall: '+JSON.stringify(latest));
 assert(latest.items[0].kind==='wall','Wrong object type');
 click('btnRotate');click('btnPlace');
 assert(latest.items.length===2,'Expected 2 placed walls');
 const part=w.document.querySelector('#part');
 part.value='floor';part.dispatchEvent(new w.Event('change'));
 const withDecor=w.document.querySelector('#useDecor');
 withDecor.checked=true;withDecor.dispatchEvent(new w.Event('change'));
 click('btnPlace');
 assert(latest.items.length===3,'Expected floor');
 assert(latest.items[2].decor===true,'Decor flag not serialized');
 click('btnUndo');
 assert(latest.items.length===2,'Undo not persisted');
 click('btnAvatar');click('btnDecor');
 assert(selectedGLB===1&&chosenDecor===1,'Android pickers not connected');
 click('btnSaveBundle');click('btnLoadBundle');
 assert(savedBundles===1&&loadedBundles===1,'ZIP project buttons missing bridge');
 click('btnPlay');
 assert(!w.document.querySelector('#panel').classList.contains('open'),'Walk mode did not hide panel');
 console.log('PASS game smoke: geometry, build, rotate, floor, decor metadata, undo, GLB picker, ZIP.',{saveCount});
 dom.window.close();
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;dom.window.close();});
