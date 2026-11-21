/* Phoenix Engine 2.0 — lightweight mobile-friendly magic/combat VFX.
 * One mesh per short-lived preset; no imported FX textures, no second RAF.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixVFX=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PRESETS=Object.freeze(['none','impact','ring','spark','magic','heal']);
 function normalize(raw,type='damage'){
  const v=raw&&typeof raw==='object'?raw:{};
  const preset=PRESETS.includes(v.preset)?v.preset:
   type==='heal'?'heal':'impact';
  const color=typeof v.color==='string'&&/^#[a-f0-9]{6}$/i.test(v.color)?
   v.color:(preset==='heal'?'#44ef9c':'#ffce65');
  const size=v.size===undefined?1:Number(v.size);
  const duration=v.duration===undefined?.5:Number(v.duration);
  if(!Number.isFinite(size)||size<.2||size>8||
     !Number.isFinite(duration)||duration<.1||duration>3)
   throw new TypeError('Invalid visual effect size/duration');
  return {preset,color,size,duration};
 }
 class SceneFX{
  constructor(scene,T){
   if(!scene||!T?.Mesh)throw new Error('Three.js scene required');
   this.scene=scene;this.T=T;this.items=[];this.limit=30;
   this.group=new T.Group();this.group.name='phoenix:combat-vfx';scene.add(this.group);
   this.ring=new T.RingGeometry(.65,.85,28);
   this.orb=new T.SphereGeometry(.5,10,8);
  }
  spawn(raw,location,type='damage'){
   const cfg=normalize(raw,type);
   if(cfg.preset==='none'||!location)return false;
   while(this.items.length>=this.limit)this.remove(this.items[0]);
   const T=this.T;
   const material=new T.MeshBasicMaterial({color:cfg.color,transparent:true,
    opacity:.88,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
   const spherical=['impact','spark','magic'].includes(cfg.preset);
   const mesh=new T.Mesh(spherical?this.orb:this.ring,material);
   mesh.position.set(location.x,location.y+.25,location.z);
   if(!spherical)mesh.rotation.x=-Math.PI/2;
   mesh.scale.setScalar(Math.max(.05,cfg.size*.25));
   mesh.renderOrder=570;
   this.group.add(mesh);
   this.items.push({mesh,time:0,config:cfg});
   return true;
  }
  remove(item){
   const at=this.items.indexOf(item);
   if(at>=0)this.items.splice(at,1);
   this.group.remove(item.mesh);
   item.mesh.material.dispose();
  }
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   for(const item of [...this.items]){
    item.time+=Math.min(dt,.1);
    const q=Math.min(1,item.time/item.config.duration),m=item.mesh;
    if(q>=1){this.remove(item);continue}
    m.material.opacity=.9*(1-q);
    const size=item.config.size*(.35+q*1.35);
    m.scale.setScalar(size);
    m.position.y+=(item.config.preset==='heal'?.8:.25)*dt;
    if(item.config.preset==='magic')m.rotation.y+=dt*6;
   }
  }
  clear(){for(const item of [...this.items])this.remove(item)}
  dispose(){
   this.clear();this.group.removeFromParent();
   this.ring.dispose();this.orb.dispose();
  }
 }
 return Object.freeze({PRESETS,normalize,SceneFX});
});
