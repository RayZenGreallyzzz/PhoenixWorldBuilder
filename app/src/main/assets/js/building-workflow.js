/* Room plans, floor copying and engine-readable building metadata.
 * Pure data transformation: safe to validate before touching the Three.js scene.
 * World units are metres; Phoenix's existing floor spacing is 2.6 metres.
 */
const BuildingWorkflow=(()=>{
 'use strict';
 const HEIGHT=2.6,STEP=2,MAX_OBJECTS=900;
 const finite=(value,name)=>{
  const n=Number(value);
  if(!Number.isFinite(n))throw Error('Проверь число: '+name);
  return n;
 };
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const precision=n=>Math.round(n*1000)/1000;
 const id=()=> 'room-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
 const parseSize=(value,name)=>{
  const n=finite(value,name);
  if(n<2||n>24||Math.abs(n/STEP-Math.round(n/STEP))>1e-6)
   throw Error(name+': от 2 до 24 м, кратно 2 м');
  return n;
 };
 function roomPlan(params={}){
  const width=parseSize(params.width,'Ширина');
  const depth=parseSize(params.depth,'Длина');
  const x=finite(params.x??0,'X'),z=finite(params.z??0,'Z');
  const storey=Number(params.storey??0);
  if(!Number.isInteger(storey)||storey<0||storey>49)throw Error('Этаж от 1 до 50');
  const roomId=String(params.roomId||id()).slice(0,72),base=storey*HEIGHT;
  const rows=depth/STEP,columns=width/STEP,items=[];
  const add=(kind,px,py,pz,rotation,role)=>{
   items.push({kind,category:kind==='wall'?'wall':'floor',storey,
    groupId:roomId,roomRole:role,position:[precision(px),precision(py),
     precision(pz)],rot:rotation});
  };
  // Align tiles to a 2m grid with NO scaling, so walls have correct
  // socket positions and UV metres; corners are coincident by design.
  for(let col=0;col<columns;col++){
   const px=x-width/2+1+col*STEP;
   add('wall',px,base,z-depth/2,0,'wall');
   add('wall',px,base,z+depth/2,0,'wall');
  }
  for(let row=0;row<rows;row++){
   const pz=z-depth/2+1+row*STEP;
   add('wall',x-width/2,base,pz,Math.PI/2,'wall');
   add('wall',x+width/2,base,pz,Math.PI/2,'wall');
  }
  if(params.floor!==false||params.ceiling===true)
   for(let col=0;col<columns;col++)
    for(let row=0;row<rows;row++){
     const px=x-width/2+1+col*STEP,pz=z-depth/2+1+row*STEP;
     if(params.floor!==false)add('floor',px,base,pz,0,'floor');
     if(params.ceiling===true)add('floor',px,base+HEIGHT-.18,pz,0,'ceiling');
    }
  if(items.length>MAX_OBJECTS)throw Error('Слишком много деталей: '+items.length);
  return {roomId,width,depth,storey,items};
 }
 function duplicateStorey(objects,sourceStorey){
  if(!Number.isInteger(sourceStorey)||sourceStorey<0||sourceStorey>=49)
   throw Error('Для копирования нужен этаж 1–49');
  const source=objects.filter(e=>e.storey===sourceStorey);
  if(!source.length)throw Error('Этот этаж пока пуст');
  if(source.length>MAX_OBJECTS)throw Error('Этаж содержит слишком много деталей');
  const grouped=new Map();
  const copy=source.map(entry=>{
   const item=JSON.parse(JSON.stringify(entry));
   delete item.id;
   item.storey=sourceStorey+1;
   item.position=[item.position[0],precision(item.position[1]+HEIGHT),
    item.position[2]];
   if(item.groupId){
    if(!grouped.has(item.groupId))grouped.set(item.groupId,id());
    item.groupId=grouped.get(item.groupId);
   }
   return item;
  });
  return copy;
 }
 function duplicateRoom(objects,roomId,shift=[4,0,0]){
  const source=objects.filter(o=>o.groupId===roomId);
  if(!source.length)throw Error('Выделенная деталь не принадлежит комнате');
  if(source.length>MAX_OBJECTS)throw Error('Комната содержит слишком много деталей');
  const newId=id();
  return source.map(src=>{
   const item=JSON.parse(JSON.stringify(src));delete item.id;
   item.position=item.position.map((v,i)=>precision(v+Number(shift[i]||0)));
   item.groupId=newId;return item;
  });
 }
 function gameManifest(doc){
  const objects=Array.isArray(doc.objects)?doc.objects:[];
  return {
   format:'PhoenixGameBuilding',version:1,unit:'meter',
   coordinateSystem:'Three.js Y-up',geometry:'PhoenixBuilder_Scene.glb',
   caveat:'Import GLB mesh; instantiate colliders and door interactions in the game engine using this manifest. This manifest is NOT a physics engine.',
   objects:objects.filter(o=>o.hidden!==true).map(o=>({
    id:o.id,label:o.label||null,kind:o.kind,category:o.category,storey:o.storey||0,
    groupId:o.groupId||null,roomRole:o.roomRole||null,
    position:o.position,rotation:o.rotation||{x:0,y:o.rot||0,z:0},
    collision:['wall','floor','roof'].includes(o.category)?'static-mesh':
     o.kind?.toLowerCase().includes('door')?'separate-door':'manual',
    door:{swing:o.doorAngle||0,openings:o.openings||[]},
    visual:{surface:o.surface||null,surfaceSides:o.surfaceSides||{}}
   })),
   floors:[...new Set(objects.filter(o=>o.hidden!==true).map(o=>o.storey||0))].sort((a,b)=>a-b)
  };
 }
 return {HEIGHT,MAX_OBJECTS,roomPlan,duplicateStorey,duplicateRoom,gameManifest};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BuildingWorkflow;
