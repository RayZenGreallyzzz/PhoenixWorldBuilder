const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../app/src/main');
const PhoenixPersistence=require(path.join(root,'assets/js/persistence.js'));
const native={objects:[{kind:'wall',id:5}],heights:[0,0],updated:'2026-10-18T16:00:00Z'};
const web={objects:[{kind:'floor',id:1}],heights:[0,0],updated:'2026-10-18T20:00:00Z'};
const blank={objects:[],heights:[0,0],updated:'2026-10-19T10:00:00Z'};
const chosen=PhoenixPersistence.choose(native,web);
assert.equal(chosen.source,'webview');
assert.equal(PhoenixPersistence.choose(web,native).source,'android');
assert.equal(PhoenixPersistence.choose(native,blank).source,'android','Nonempty native scene must win over accidental empty startup');
assert.equal(PhoenixPersistence.choose(blank,web).source,'webview','Populated WebView scene must survive blank native');
assert.equal(PhoenixPersistence.choose(null,web).source,'webview');
assert.equal(PhoenixPersistence.choose(native,null).source,'android');
assert.equal(PhoenixPersistence.choose({},null),null);
assert.equal(PhoenixPersistence.parse('{broken'),null);
assert.equal(PhoenixPersistence.parse('{"heights":[]}'),null);
let disk='',manual='',count=0;
global.NativeBridge={
 saveProject:(body)=>{disk=body;count++;return true},
 saveManualProject:(body)=>{manual=body;return true},
 loadProject:()=>disk,
 loadBackupProject:()=>JSON.stringify(native),
 loadManualProject:()=>manual
};
assert.equal(PhoenixPersistence.native(),true);
assert.equal(PhoenixPersistence.write(web,true),true);
assert.equal(count,1);
assert.equal(PhoenixPersistence.read().objects[0].kind,'floor');
assert.equal(PhoenixPersistence.read('loadManualProject').objects.length,1);
assert.equal(PhoenixPersistence.read('loadBackupProject').objects[0].kind,'wall');
delete global.NativeBridge;
assert.equal(PhoenixPersistence.native(),false);
assert.equal(PhoenixPersistence.write(web,true),false);
const java=fs.readFileSync(path.join(root,'java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'assets/index.html'),'utf8');
for(const action of ['saveProject(String json)','loadProject()','loadBackupProject()','loadManualProject()',
 'saveManualProject(String json)','getFilesDir()','ATOMIC_MOVE','getFD().sync()','onPause()']){
 assert(java.includes(action),'Missing Android recovery behavior '+action);
}
assert(java.includes('window.PhoenixPersistence.flushNow()'),'Android back must flush synchronously');
for(const action of ['PhoenixPersistence.choose','PhoenixPersistence.write','PhoenixPersistence.read','pendingRecovery',
 'tx.oncomplete','importZip','saveLocal']){
 assert(app.includes(action),'Missing WebView recovery behavior '+action);
}
assert(!app.includes("addEventListener('visibilitychange'"),'No autosave when Android backgrounded');
assert(!app.includes("addEventListener('pagehide'"),'No autosave when app hidden');
assert(!app.includes("setInterval(()=>{\n  if(!document.hidden"),'No 15s checkpoint');
assert(app.includes("if(!notify||isLoading||pendingRecovery)return false"),'Only manual Save writes');
assert(app.includes("saveIndicator('● Не сохранено')"),'Unsaved changes marked without writing');
assert(!java.includes('onPause() {\n        if (webView != null)'), 'Home button must not trigger saves');
assert(java.includes('Выйти без сохранения'),'Android must offer exit without saving');
assert(html.indexOf('js/persistence.js')<html.indexOf('js/app.js'),'Persistence needs to load first');
for(const id of ['saveStatus','restoreManual','restoreBackup','saveDetails'])assert(html.includes('id="'+id+'"'),id);
console.log('Native two-copy journal, manual checkpoint, legacy IndexedDB rescue and exit-flush wiring OK');
