/* Accessible analogue joystick for character/drone on Android.
 * One pointer belongs to the pad; a second finger can orbit the 3D camera.
 * Screen directions: up = negative Y, right = positive X.
 */
const TouchJoystick=(()=>{
 'use strict';
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 class Joystick{
  constructor(element,onChange,options={}){
   if(!element)throw Error('Joystick element is missing');
   this.pad=element;this.knob=element.querySelector('.joystickKnob');
   this.onChange=typeof onChange==='function'?onChange:()=>{};
   this.deadzone=clamp(Number(options.deadzone)||.1,0,.4);
   this.pointerId=null;this.value={x:0,y:0};
   element.addEventListener('pointerdown',e=>this.start(e));
   element.addEventListener('pointermove',e=>this.move(e));
   for(const name of ['pointerup','pointercancel','lostpointercapture'])
    element.addEventListener(name,e=>this.finish(e));
   window.addEventListener('blur',()=>this.reset());
   document.addEventListener('visibilitychange',()=>{
    if(document.hidden)this.reset();
   });
  }
  update(e){
   const b=this.pad.getBoundingClientRect();
   const radius=Math.max(24,Math.min(b.width,b.height)*.5-25);
   const dx=e.clientX-(b.left+b.width/2),dy=e.clientY-(b.top+b.height/2);
   const distance=Math.hypot(dx,dy),level=Math.min(1,distance/radius);
   const displacement=distance>0?radius*level/distance:0;
   const x=dx*displacement,y=dy*displacement;
   if(this.knob)this.knob.style.transform=
    'translate(-50%,-50%) translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
   const strength=level<=this.deadzone?0:(level-this.deadzone)/(1-this.deadzone);
   this.value={x:distance>0?dx/distance*strength:0,
    y:distance>0?dy/distance*strength:0};
   this.onChange({...this.value});
  }
  start(e){
   if(this.pointerId!==null||e.button!==0)return;
   this.pointerId=e.pointerId;
   try{this.pad.setPointerCapture(e.pointerId)}catch(_e){}
   this.update(e);e.preventDefault();e.stopPropagation();
  }
  move(e){
   if(e.pointerId!==this.pointerId)return;
   this.update(e);e.preventDefault();e.stopPropagation();
  }
  finish(e){
   if(e.pointerId!==this.pointerId)return;
   this.reset();e.preventDefault();e.stopPropagation();
  }
  reset(){
   if(this.pointerId!==null&&this.pad.hasPointerCapture?.(this.pointerId)){
    try{this.pad.releasePointerCapture(this.pointerId)}catch(_e){}
   }
   this.pointerId=null;this.value={x:0,y:0};
   if(this.knob)this.knob.style.transform='translate(-50%,-50%)';
   this.onChange({...this.value});
  }
 }
 return Joystick;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TouchJoystick;
