/* Texture alignment controls. Offset values are expressed in image UV units:
 * 0.05 is five percent of one repeat, independent of model dimensions.
 * Positive offsets move texture sampling in the opposite direction from the
 * visible artwork, so arrows negate the respective UV offset.
 */
const TexturePlacement=(()=>{
 'use strict';
 const max=1000;
 const value=n=>Number.isFinite(Number(n))?Math.max(-max,Math.min(max,Number(n))):0;
 const precision=n=>Math.round(n*10000)/10000;
 const steps=[.01,.05,.1,.25];
 function move(raw,direction,step=.05){
  const d=raw||{},s=Number(step);
  const amount=steps.includes(s)?s:.05;
  let u=value(d.offsetU),v=value(d.offsetV);
  if(direction==='left')u+=amount;
  else if(direction==='right')u-=amount;
  else if(direction==='up')v-=amount;
  else if(direction==='down')v+=amount;
  else if(direction==='reset'){u=0;v=0;}
  else return {...d,offsetU:precision(u),offsetV:precision(v)};
  return {...d,offsetU:precision(value(u)),offsetV:precision(value(v))};
 }
 return {move,steps};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TexturePlacement;
