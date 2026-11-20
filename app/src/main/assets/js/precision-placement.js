/* Phoenix Builder: true millimetre precision for manual positioning.
 * 1 scene unit = 1 metre. Magnetic sockets, grid snap and fine nudge are
 * independent features. All recorded coordinates are rounded to 0.001 m
 * (one millimetre), without forcing world-grid snapping.
 */
const PrecisionPlacement=(()=>{
 'use strict';
 const STEPS=[.001,.005,.01,.05,.25,1];
 const roundMM=v=>Number.isFinite(v)?Math.round(v*1000)/1000:0;
 const step=(raw,fallback=.001)=>{
  const x=Number(raw);
  return STEPS.some(y=>Math.abs(x-y)<1e-10)?x:fallback;
 };
 const snap=(value,metres)=>{
  const size=step(metres,.25);
  return roundMM(Math.round(value/size)*size);
 };
 const free=value=>roundMM(value);
 const coordinate=(value,gridEnabled=false,gridStep=.25)=>
  gridEnabled?snap(value,gridStep):free(value);
 function drag(base,origin,hit,gridEnabled=false,gridStep=.25){
  if(!Number.isFinite(base)||!Number.isFinite(origin)||!Number.isFinite(hit))
   return roundMM(base);
  return coordinate(base+hit-origin,gridEnabled,gridStep);
 }
 function nudge(value,direction,rawStep=.001){
  const amount=step(rawStep,.001);
  return roundMM(value+(Number(direction)||0)*amount);
 }
 const formatMM=value=>(Math.round((Number(value)||0)*1000)+' мм');
 return {STEPS,roundMM,step,snap,free,coordinate,drag,nudge,formatMM};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PrecisionPlacement;
