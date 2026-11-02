const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../app/src/main');
const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const java=fs.readFileSync(path.join(root,'java/com/phoenix/worldbuilder/MainActivity.java'),'utf8');
assert(java.includes('new Intent(Intent.ACTION_OPEN_DOCUMENT)'),'Native chooser must not inherit WebView MIME restrictions');
assert(java.includes('intent.setType("*/*")'),'GLB should be selectable even when Android reports application/octet-stream');
assert(!java.includes('params.createIntent()'),'Do not carry across stale EXTRA_MIME_TYPES');
assert(/\\.glb\\$\/i\.test\(f.name\)/.test(app),'JavaScript validates selected GLB by extension');
const handler=app.slice(app.indexOf(" $('fileAssets').onchange="),app.indexOf(" $('fileProject').onchange="));
assert(!/f\.size\s*[><=]|MAX_FILE|50\s*\*\s*1024/.test(handler),
 'GLB importer has no arbitrary 50 MB size cutoff');
// Run the actual app preferences implementation without bootstrapping a WebView.
const start=app.indexOf("const SURFACE_PREFS_KEY="),end=app.indexOf("function surfaceTarget(){",start);
assert(start>0&&end>start,'Persistent surface tool settings implementation exists');
const stored=new Map(),controls={
 gameSurfaceMode:{value:'tile'},gameSurfaceTileMeters:{value:'3'},
 gameSurfaceImageScale:{value:'225'},gameSurfaceFaithful:{checked:false},
 surfaceMode:{value:'repeat'},surfaceTileMeters:{value:'1'},
 surfaceImageScale:{value:'100'},surfaceFaithful:{checked:true}
};
const context=vm.createContext({
 localStorage:{setItem(k,v){stored.set(k,v)},getItem(k){return stored.get(k)||null}},
 SurfacePaint:{faces:['all','top','bottom'],modes:['repeat','tile','module','joined']},
 w:{mode:'playbuild'},$:(id)=>{assert(controls[id],id);return controls[id]},
 console, surfaceScope:'all',surfaceMode:'repeat',surfaceTileMeters:1,
 surfaceImageScale:1,surfaceFaithful:true
});
vm.runInContext(app.slice(start,end),context);
vm.runInContext("surfaceScope='bottom';surfaceMode='module';surfaceTileMeters=2.5;surfaceImageScale=1.6;surfaceFaithful=false;saveSurfacePreferences()",context);
assert(stored.has('pwb_surface_preferences_v1'),'Preference persisted to Android WebView localStorage');
vm.runInContext("surfaceScope='all';surfaceMode='repeat';surfaceTileMeters=1;surfaceImageScale=1;surfaceFaithful=true;restoreSurfacePreferences()",context);
assert.equal(context.surfaceScope,'bottom','Surface face selection restored');
assert.equal(context.surfaceMode,'module','Image-mapping selection restored');
assert.equal(context.surfaceTileMeters,2.5,'Tile metres restored');
assert.equal(context.surfaceImageScale,1.6,'Image zoom restored');
assert.equal(context.surfaceFaithful,false,'Original colour choice restored');
const visible=vm.runInContext("currentSurfaceControls()",context);
assert.equal(visible.mode,'tile','Visible existing-module mapping takes precedence when applying texture');
assert.equal(visible.imageScale,2.25,'Visible image zoom, not stale globals, is applied');
assert.equal(visible.faithful,false);
assert(app.includes('restoreSurfacePreferences();setupPicker();wireButtons()'),'Preferences restored on app startup');
console.log('GLB Android picker wildcard/no 50MB cap; mapping/zoom persistence and visible-value painting OK');