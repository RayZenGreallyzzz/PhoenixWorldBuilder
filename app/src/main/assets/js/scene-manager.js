/* Lightweight offline scene outliner. The outliner works with stable object
 * descriptors, not cloned geometry or thumbnails; it scales to large scenes.
 */
const SceneManager=(()=>{
 'use strict';
 const LIMIT=140;
 const cleanName=value=>String(value??'').replace(/[<>\x00-\x1f\x7f]/g,'')
  .trim().slice(0,64);
 const displayName=(entry,fallback='Деталь')=>
  cleanName(entry?.label)||cleanName(fallback)||'Деталь';
 function results(entries,opts={}){
  const q=String(opts.query||'').trim().toLocaleLowerCase('ru-RU'),
   storey=opts.storey||'all',current=Number(opts.current)||0,
   max=Math.max(1,Math.min(300,Number(opts.limit)||LIMIT));
  let filtered=(Array.isArray(entries)?entries:[]).filter(entry=>{
   if(storey==='current'&&entry.storey!==current)return false;
   if(storey!=='current'&&storey!=='all'&&entry.storey!==Number(storey))
    return false;
   const searchable=[
    entry.id,entry.kind,entry.category,entry.label,entry.roomRole,
    entry.groupId,opts.describe?.(entry)
   ].filter(v=>v!==undefined&&v!==null).join(' ').toLocaleLowerCase('ru-RU');
   return !q||searchable.includes(q);
  });
  filtered.sort((a,b)=>(a.storey||0)-(b.storey||0)||
   (Number(a.id)||0)-(Number(b.id)||0));
  return {rows:filtered.slice(0,max),total:filtered.length,
   truncated:filtered.length>max,limit:max};
 }
 function apply(entry,raw){
  if(!entry||!raw)return entry;
  if(Object.prototype.hasOwnProperty.call(raw,'label'))
   entry.label=cleanName(raw.label);
  if(Object.prototype.hasOwnProperty.call(raw,'hidden'))
   entry.hidden=raw.hidden===true;
  if(Object.prototype.hasOwnProperty.call(raw,'locked'))
   entry.locked=raw.locked===true;
  if(entry.root)entry.root.visible=!entry.hidden;
  return entry;
 }
 function editingAllowed(entry){return !entry?.locked&&!entry?.hidden;}
 return {LIMIT,cleanName,displayName,results,apply,editingAllowed};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SceneManager;
