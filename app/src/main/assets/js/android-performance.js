/* Phoenix Builder: inexpensive real-time Android diagnostics.
 * These are renderer counts and measured frame cadence, NOT GPU-memory bytes.
 * Optional adaptive resolution is conservative and never edits project assets.
 */
const AndroidPerformance=(()=>{
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const round=x=>Math.round(x*10)/10;
 const n=x=>Number.isFinite(Number(x))?Number(x):0;
 class Monitor{
  constructor(options={}){
   this.maxPixelRatio=clamp(n(options.maxPixelRatio)||1,0.5,2);
   this.pixelRatio=this.maxPixelRatio;
   this.auto=false;this.frameTimes=[];this.samples=[];
   this.lastRender=0;this.lastReport=0;this.lastChange=0;
   this.slowWindows=0;this.fastWindows=0;this.adjustments=0;
   this.lastStats={fps:0,calls:0,triangles:0,geometries:0,textures:0,
    pixelRatio:this.pixelRatio,jsHeapMiB:null};
  }
  setAuto(value){
   this.auto=!!value;
   this.slowWindows=0;this.fastWindows=0;
   if(!this.auto){this.pixelRatio=this.maxPixelRatio}
   return this.pixelRatio;
  }
  // Use actual frames rendered, rather than requestAnimationFrame callbacks.
  frame(now,renderer,jsHeapBytes=null){
   if(!Number.isFinite(now))return null;
   if(this.lastRender&&now-this.lastRender>0&&now-this.lastRender<600)
    this.frameTimes.push(now-this.lastRender);
   this.lastRender=now;
   if(this.frameTimes.length>180)this.frameTimes.shift();
   if(!this.lastReport){this.lastReport=now;return null}
   if(now-this.lastReport<1600)return null;
   this.lastReport=now;
   const times=this.frameTimes.splice(0),average=times.length?
    times.reduce((s,d)=>s+d,0)/times.length:0;
   const fps=average?clamp(1000/average,0,120):0,
    info=renderer?.info||{},render=info.render||{},memory=info.memory||{};
   const stats={
    fps:round(fps),
    calls:Math.round(n(render.calls)),triangles:Math.round(n(render.triangles)),
    geometries:Math.round(n(memory.geometries)),textures:Math.round(n(memory.textures)),
    pixelRatio:round(this.pixelRatio*100)/100,
    jsHeapMiB:Number.isFinite(jsHeapBytes)&&jsHeapBytes>0?
     round(jsHeapBytes/1048576):null
   };
   // The editor intentionally targets ~30 FPS, not 60. Do not infer GPU load
   // from a 30 FPS cap: lower resolution only after repeated real slow windows.
   if(this.auto&&times.length>=12&&now-this.lastChange>=8500){
    if(fps<23){this.slowWindows++;this.fastWindows=0}
    else if(fps>28){this.fastWindows++;this.slowWindows=0}
    else{this.fastWindows=0;this.slowWindows=0}
    if(this.slowWindows>=2&&this.pixelRatio>.65){
     this.pixelRatio=Math.max(.65,Math.round((this.pixelRatio-.15)*100)/100);
     this.lastChange=now;this.adjustments++;this.slowWindows=0;
    }else if(this.fastWindows>=5&&this.pixelRatio<this.maxPixelRatio){
     this.pixelRatio=Math.min(this.maxPixelRatio,Math.round((this.pixelRatio+.10)*100)/100);
     this.lastChange=now;this.adjustments++;this.fastWindows=0;
    }
   }
   stats.pixelRatio=Math.round(this.pixelRatio*100)/100;
   this.lastStats=stats;
   this.samples.push({ms:Math.round(now),...stats});
   if(this.samples.length>18)this.samples.shift();
   return stats;
  }
  report({objects=0,imported=0,codecs={},userAgent=''}={}){
   const values=this.samples.filter(s=>s.fps>0).map(s=>s.fps),
    mean=values.length?round(values.reduce((a,b)=>a+b,0)/values.length):0;
   return {
    app:'Phoenix Builder Studio 2.0',
    measured:'Renderer telemetry, not hardware GPU memory or a benchmark score',
    renderTargetFps:30,
    last:this.lastStats,
    avgFps:mean,
    minFps:values.length?Math.min(...values):0,
    recordedWindows:values.length,
    resolutionAdjustments:this.adjustments,
    automaticResolution:this.auto,
    scene:{objects:Math.max(0,Math.floor(n(objects))),
     imported:Math.max(0,Math.floor(n(imported)))},
    codecs:Object.fromEntries(Object.entries(codecs)
     .filter(([k])=>['meshopt','draco','ktx2'].includes(k)).map(([k,v])=>[k,!!v])),
    // Deliberately do not include project names, file paths or imported assets.
    device:String(userAgent||'').slice(0,240)
   };
  }
 }
 return {Monitor};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AndroidPerformance;
