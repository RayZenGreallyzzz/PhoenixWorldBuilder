/* Phoenix Engine v2.1. World-space north-up tactical minimap.
 * Canvas2D view of the SAME authored world, NOT a second 3D world.
 * Reuses existing terrain size, painted tiles, building entries and live mobs.
 * No renderer, DOM or WebGL in model computations; 1 world unit = 1 metre.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixMinimap=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1;
 const SHAPES=['circle','square'],POSITIONS=['top-left','top-right','bottom-left','bottom-right'];
 const COLORS=Object.freeze({enemy:'#ff4e51',passive:'#f4fdff',
  npc:'#f4fdff',boss:'#ff1d28',player:'#66faff'});
 const defaults=()=>({version:VERSION,shape:'circle',position:'top-left',
  size:170,range:120,showBuildings:true,showTerrain:true,showCompass:true});
 const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
 function normalize(raw){
  const src=raw||{},d=defaults();
  if(!src||typeof src!=='object'||Array.isArray(src))
   throw new TypeError('Invalid minimap');
  const shape=src.shape??d.shape,position=src.position??d.position;
  const size=src.size??d.size,range=src.range??d.range;
  if(!SHAPES.includes(shape)||!POSITIONS.includes(position)||
   !finite(size,110,300)||!finite(range,20,2500))
   throw new TypeError('Invalid minimap settings');
  return {version:VERSION,shape,position,size:Math.round(size),
   range:Math.round(range),showBuildings:src.showBuildings!==false,
   showTerrain:src.showTerrain!==false,showCompass:src.showCompass!==false};
 }
 // range is the distance in metres from the player to the circle/square edge.
 function project(x,z,cx,cz,radius,range){
  return {x:radius+(x-cx)*radius/range,
   y:radius+(z-cz)*radius/range};
 }
 function entityClass(mob){
  if(mob.boss||mob.type==='boss')return 'boss';
  if(mob.type==='npc'||mob.type==='hero'||mob.faction!=='enemy'||
     mob.engagement==='passive')return 'passive';
  return 'enemy';
 }
 const hash=str=>{let h=2166136261;for(const ch of String(str||'')){
  h=Math.imul(h^ch.charCodeAt(0),16777619)}return h>>>0};
 const terrainColor=(tile)=>{
  if(!tile||tile.style==='_default')return '#314c44';
  const v=hash(tile.style)%4;
  return ['#385a49','#51604d','#435a53','#5b5a43'][v];
 };
 function draw(ctx,data,config){
  const opt=normalize(config),size=opt.size,center=size/2;
  const radius=size/2-6,range=opt.range;
  const avatar=data.player||{x:0,z:0,yaw:0};
  const x=Number(avatar.x)||0,z=Number(avatar.z)||0;
  const v=(wx,wz)=>project(wx,wz,x,z,center,range);
  const state=data.world||{};
  ctx.clearRect(0,0,size,size);
  ctx.save();ctx.beginPath();
  if(opt.shape==='circle')ctx.arc(center,center,center-2,0,2*Math.PI);
  else ctx.rect(1,1,size-2,size-2);
  ctx.clip();
  ctx.fillStyle='#112e37';ctx.fillRect(0,0,size,size);
  if(opt.showTerrain){
   const width=Number(state.width)||128,depth=Number(state.depth)||128;
   const a=v(-width/2,-depth/2),b=v(width/2,depth/2);
   ctx.fillStyle='#29483e';
   ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
   const scale=center/range;
   for(const tile of (state.tiles||[]).slice(0,10000)){
    const tileSize=Number(state.tileSize)||50;
    const minX=-width/2+tile.col*tileSize,minZ=-depth/2+tile.row*tileSize;
    const p=v(minX,minZ),w=Math.min(tileSize,width/2-minX)*scale,
     h=Math.min(tileSize,depth/2-minZ)*scale;
    if(w<=0||h<=0||p.x>size||p.y>size||p.x+w<0||p.y+h<0)continue;
    ctx.fillStyle=terrainColor(tile);
    ctx.fillRect(p.x,p.y,w,h);
   }
   // Real terrain elevations, sampled from the existing terrain heightAt()
   // function; a lightweight 12x12 contour grid, not a texture screenshot.
   if(typeof data.heightAt==='function'){
    const steps=12,side=size/steps;
    for(let iy=0;iy<steps;iy++)for(let ix=0;ix<steps;ix++){
     const px=(ix+.5)*side,pz=(iy+.5)*side;
     const height=Number(data.heightAt(x+(px-center)*range/center,
      z+(pz-center)*range/center))||0;
     if(Math.abs(height)<.35)continue;
     const a=Math.min(.34,Math.abs(height)/65+.06);
     ctx.fillStyle=height>0?'rgba(187,212,155,'+a+')':
      'rgba(49,139,171,'+a+')';
     ctx.fillRect(ix*side,iy*side,side+.4,side+.4);
    }
   }
  }
  // Draw placed builder architecture in real world coordinates, not invented
  // positions. The 2D footprint is deliberately simplified for performance.
  if(opt.showBuildings)for(const object of (data.buildings||[]).slice(0,3000)){
   if(object.hidden||!Number.isFinite(object.x)||!Number.isFinite(object.z))continue;
   const p=v(object.x,object.z);
   if(Math.abs(p.x-center)>center+8||Math.abs(p.y-center)>center+8)continue;
   const width=Math.max(1.4,Math.min(16,Number(object.width)||2)*center/range);
   const depth=Math.max(1.4,Math.min(16,Number(object.depth)||2)*center/range);
   ctx.fillStyle=object.category==='wall'?'#d6d6c2':'#a3ae9d';
   ctx.fillRect(p.x-width/2,p.y-depth/2,width,depth);
  }
  for(const mob of data.mobs||[]){
   if(mob.dead||!Number.isFinite(mob.x)||!Number.isFinite(mob.z))continue;
   const p=v(mob.x,mob.z),kind=entityClass(mob);
   if(Math.hypot(p.x-center,p.y-center)>center+6)continue;
   ctx.beginPath();ctx.fillStyle=COLORS[kind];
   ctx.arc(p.x,p.y,kind==='boss'?Math.max(5.5,size/33):
    Math.max(2.8,size/68),0,Math.PI*2);ctx.fill();
   ctx.lineWidth=.8;ctx.strokeStyle='#0c1a25';ctx.stroke();
  }
  // Hero remains centered. Up is geographical North (-Z), map does not spin.
  ctx.save();ctx.translate(center,center);ctx.rotate(Number(avatar.yaw)||0);
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-6,7);ctx.lineTo(0,4);
  ctx.lineTo(6,7);ctx.closePath();
  ctx.fillStyle=COLORS.player;ctx.fill();ctx.restore();
  ctx.restore();
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle='#91c4bd';
  ctx.beginPath();
  if(opt.shape==='circle')ctx.arc(center,center,center-2,0,2*Math.PI);
  else ctx.rect(1,1,size-2,size-2);
  ctx.stroke();
  if(opt.showCompass){
   ctx.textAlign='center';ctx.font='bold 12px sans-serif';
   for(const [letter,px,py,color] of [
    ['N',center,15,'#f8f8ef'],['S',center,size-7,'#dcebe5'],
    ['W',10,center+4,'#dcebe5'],['E',size-10,center+4,'#dcebe5']]){
    ctx.fillStyle='rgba(11,29,39,.82)';ctx.fillRect(px-8,py-13,16,17);
    ctx.fillStyle=color;ctx.fillText(letter,px,py);
   }
  }
  ctx.restore();
 }
 return Object.freeze({VERSION,SHAPES,POSITIONS,COLORS,defaults,normalize,
  project,entityClass,terrainColor,draw});
});
