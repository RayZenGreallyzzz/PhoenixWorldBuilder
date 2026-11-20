/* Phoenix Builder UV24: progressive loading order (no project mutation). */
const ProjectLoadStages=(()=>{'use strict';
 const names=['Фасадные стены','Крыши','Внутренние стены','Полы и потолки','Декор и остальные детали'];
 function ordered(entries){
  const walls=entries.filter(e=>e.category==='wall');
  const xs=walls.map(e=>e.root?.position?.x??e.position?.[0]??0),
   zs=walls.map(e=>e.root?.position?.z??e.position?.[2]??0);
  const ext=xs.length?{left:Math.min(...xs),right:Math.max(...xs),
   near:Math.min(...zs),far:Math.max(...zs)}:null;
  function stage(e){
   if(e.category==='roof')return 1;
   if(e.category==='floor'||e.roomRole==='ceiling')return 3;
   if(e.category!=='wall')return 4;
   if(/внутр|interior|inner/i.test(e.label||''))return 2;
   if(/наруж|фасад|exterior|outer/i.test(e.label||''))return 0;
   if(!ext)return 2;
   const x=e.root?.position?.x??e.position?.[0]??0,
    z=e.root?.position?.z??e.position?.[2]??0;
   // Approximation only: position/label classification never alters the model.
   return Math.min(Math.abs(x-ext.left),Math.abs(x-ext.right),
    Math.abs(z-ext.near),Math.abs(z-ext.far))<0.65?0:2;
  }
  return entries.map((entry,index)=>({entry,index,group:stage(entry)}))
   .sort((a,b)=>a.group-b.group||a.index-b.index);
 }
 return {names,ordered};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ProjectLoadStages;
