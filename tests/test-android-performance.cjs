const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../app/src/main/assets');
const Perf=require(path.join(base,'js/android-performance.js'));
function renderer(){
 return {info:{render:{calls:134,triangles:120500},
  memory:{geometries:250,textures:23}}};
}
function runSamples(m,r,from,periodMs,count){
 let now=from,prev=null;
 for(let i=0;i<count;i++){
  now+=periodMs;const stats=m.frame(now,r,73400320);
  if(stats)prev=stats;
 }
 return {now,stats:prev};
}
{
 const m=new Perf.Monitor({maxPixelRatio:1.25}),r=renderer();
 const start=runSamples(m,r,10000,33.3333,130);
 assert(start.stats&&start.stats.fps>=29&&start.stats.fps<=31,
  'FPS comes from actual rendered frame intervals with a 30fps render cap');
 assert.equal(start.stats.calls,134,'Draw calls are read from renderer.info');
 assert.equal(start.stats.triangles,120500,'Visible triangle count is sampled');
 assert.equal(start.stats.geometries,250);
 assert.equal(start.stats.textures,23);
 assert.equal(start.stats.jsHeapMiB,70,'Reported JS heap is not mistaken for GPU VRAM');
 assert.equal(m.pixelRatio,1.25,'Automatic downscaling is opt in');
 const slow=runSamples(m,r,start.now,55,220);
 assert(slow.stats.fps<23,'Measure real slow frames accurately');
 assert.equal(m.pixelRatio,1.25,'Disabled adaptive mode does not reduce quality');
 const rep=m.report({objects:126,imported:12,
  codecs:{meshopt:true,draco:true,ktx2:true,password:'must-not-appear'},
  importStats:{decodedMs:315,fileMiB:1.6,triangles:45678,
   extensions:['EXT_meshopt_compression','malicious_custom_extension'],
   fileName:'secret.glb'},userAgent:'Android test'});
 assert.equal(rep.scene.objects,126);
 assert.equal(rep.scene.imported,12);
 assert.equal(rep.codecs.meshopt,true);
 assert(!('password' in rep.codecs),'Only decoder availability is exported');
 assert(!JSON.stringify(rep).includes('.glb'),'No imported model paths or project data');
 assert.equal(rep.lastGLBImport.decodedMs,315);
 assert.equal(rep.lastGLBImport.triangles,45678);
 assert.deepEqual(rep.lastGLBImport.extensions,['EXT_meshopt_compression']);
 assert(!JSON.stringify(rep).includes('secret'),'Import report does not include private file names');
 assert(rep.avgFps>0&&rep.recordedWindows>0);
}
{
 const m=new Perf.Monitor({maxPixelRatio:1.25}),r=renderer();
 m.setAuto(true);
 const warm=runSamples(m,r,10000,50,160);
 assert(warm.stats.fps>=19&&warm.stats.fps<=21,'Slow 20fps frames are sampled');
 assert(m.pixelRatio<1.25,'Repeated bad FPS windows trigger a small resolution reduction');
 const lowered=m.pixelRatio;
 const fast=runSamples(m,r,warm.now+1000,33,430);
 assert(fast.stats.fps>=29&&fast.stats.fps<=31);
 assert(m.pixelRatio>lowered,'After several steady 30fps windows pixels may recover');
 assert(m.pixelRatio<=1.25,'Adaptive resolution never exceeds device cap');
 m.setAuto(false);
 assert.equal(m.pixelRatio,1.25,'Turning auto off restores source display quality');
 assert.equal(m.adjustments>=2,true,'Both down and up transitions recorded');
}
{
 const m=new Perf.Monitor({maxPixelRatio:.85}),r=renderer();
 m.setAuto(true);
 let data=runSamples(m,r,10000,80,300);
 assert(m.pixelRatio>=.65&&m.pixelRatio<=.85,'Resolution floor protects UI readability');
 const ratio=m.pixelRatio;
 m.frame(data.now+2500,r);
 assert.equal(m.pixelRatio,ratio,'Background gap never counts as a very slow GPU frame');
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
for(const id of ['optimizationAutoResolution','performanceStats','btnPerfReport'])
 assert(html.includes('id="'+id+'"'),'Missing user-visible control '+id);
assert(html.indexOf('js/android-performance.js')<html.indexOf('js/clean-app.js'),
 'Profiler is available before the editor starts');
for(const token of ['new AndroidPerformance.Monitor','this.performanceMonitor.frame',
 'this.performanceMonitor.report','updateAutoResolution()','exportPerformanceReport()',
 'this.renderer.setPixelRatio(this.performanceMonitor.pixelRatio)','this.lastGLBImport='])
 assert(app.includes(token),'Performance monitor not correctly wired: '+token);
assert(css.includes('.perfDiagnostic'),'Diagnostic UI lacks mobile styling');
console.log('Android measured FPS, renderer counts, adaptive quality, privacy and UI integration OK');
