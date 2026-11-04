/* Bulk trimming planner: prepare all floor changes BEFORE touching the scene.
 * All-or-nothing for errors, no source GLB mutations. Re-running is idempotent:
 * cuts are always recomputed from pristine templates, never edited geometry.
 */
const BulkFloorTrim=(()=>{
 'use strict';
 const LIMIT=450;
 function manualPlane(raw){
  if(!raw)return null;
  const angle=Number(raw.angle),offset=Number(raw.offset);
  if(!Number.isFinite(angle)||!Number.isFinite(offset)||Math.abs(offset)>10000)return null;
  const rad=Math.max(-180,Math.min(180,angle))*Math.PI/180;
  const side=raw.side==='greater'?1:-1;
  return {nx:side*Math.cos(rad),nz:side*Math.sin(rad),offset:side*offset};
 }
 function prepare(entries,cloneTemplate,reset=false){
  const floors=(entries||[]).filter(e=>e.category==='floor');
  if(!floors.length)return {ok:false,reason:'В проекте нет плит пола'};
  if(floors.length>LIMIT)return {ok:false,
   reason:'Слишком много плит для безопасной одновременной обработки ('+floors.length+
    '). Максимум '+LIMIT+'; обрабатывай частями'};
  const walls=entries.filter(e=>e.category==='wall');
  if(!reset&&!walls.length)return {ok:false,reason:'В проекте нет стен для подрезки'};
  const staged=[];
  let unchanged=0,cuts=0,closed=0,openGLB=0;
  for(const tile of floors){
   const source=cloneTemplate(tile.kind,tile.thickness,tile.scale,tile.axes);
   if(!source)return {ok:false,reason:'Не найдена исходная модель: '+tile.kind};
   let auto=[];
   if(!reset){
    const sourceBounds=CleanGeometry.localBounds(source);
    const match=EdgeAutoTrim.resolve(tile,walls,sourceBounds);
    if(!match.ok){unchanged++;continue}
    auto=match.cuts;
   }else if(!(tile.kind==='floor'?tile.floorTrim?.cuts?.length:tile.autoEdgeCuts?.length)){
    unchanged++;continue;
   }
   const fresh=cloneTemplate(tile.kind,tile.thickness,tile.scale,tile.axes);
   if(!fresh)return {ok:false,reason:'Не найдена модель для подрезки: '+tile.kind};
   fresh.position.copy(tile.root.position);
   fresh.rotation.copy(tile.root.rotation);
   fresh.scale.copy(tile.root.scale);
   fresh.updateWorldMatrix(true,true);
   let result,edit,floorTrim;
   if(tile.kind==='floor'){
    floorTrim=FloorClip.normalize({...tile.floorTrim,cuts:auto});
    result=FloorClip.apply(fresh,floorTrim);
   }else{
    const manual=manualPlane(tile.manualEdgeCut);
    edit=CleanMeshEdit.normalize({...tile.meshEdit,planeCuts:[
     ...(manual?[manual]:[]),...auto]});
    result=CleanMeshEdit.active(edit)?CleanMeshEdit.apply(fresh,edit):
     {ok:true,changed:false,openCut:false};
   }
   if(!result.ok)return {ok:false,reason:'Не удалось обработать плиту #'+tile.id+
    ' ('+tile.kind+'): '+result.reason};
   staged.push({tile,root:fresh,floorTrim,meshEdit:edit,auto,capResult:result});
   cuts+=auto.length;
   if(tile.kind!=='floor'&&result.openCut)openGLB++;
   else closed++;
  }
  return {ok:true,staged,unchanged,count:staged.length,cutCount:cuts,closed,openGLB,
   reset:!!reset};
 }
 function commit(plan,scene,selected,outline){
  if(!plan?.ok)return false;
  for(const job of plan.staged){
   scene.add(job.root);
   job.tile.root.removeFromParent();
   job.tile.root=job.root;
   if(job.tile.kind==='floor')job.tile.floorTrim=job.floorTrim;
   else{
    job.tile.autoEdgeCuts=job.auto;
    job.tile.meshEdit=job.meshEdit;
    job.tile.capResult=job.capResult;
    job.tile.thicknessEditable=false;
   }
  }
  if(selected&&outline&&plan.staged.some(x=>x.tile===selected))
   outline.setFromObject(selected.root);
  return true;
 }
 return {prepare,commit,LIMIT,manualPlane};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BulkFloorTrim;
