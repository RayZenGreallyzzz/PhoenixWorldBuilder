/* Phoenix Builder: import project data explicitly, independently of model ZIP.
 * Does not rewrite old projects or import unknown project formats silently.
 */
const ProjectOpen=(()=>{'use strict';
 const decoder=new TextDecoder('utf-8',{fatal:true});
 function classify(doc){
  if(doc?.format==='PhoenixBuilderBackupV1' && doc?.project?.version===2 &&
   Array.isArray(doc.project.objects) && Array.isArray(doc.assets))return 'backup';
  if(doc?.version===2 && Array.isArray(doc.objects))return 'project';
  if(doc?.version===1 && Array.isArray(doc.objects))return 'legacy';
  return null;
 }
 function validated(doc){
  const type=classify(doc);
  if(!type)throw Error('Нужен проект Phoenix Builder 2.0 (.phoenix.json) или ZIP с таким проектом');
  if(type==='legacy')throw Error('Найден ZIP старого Phoenix World Builder (версия 1). Для безопасного переноса требуется конвертация; текущий дом не изменён.');
  return {type,doc,project:type==='backup'?doc.project:doc};
 }
 async function read(file){
  if(!file)throw Error('Выбери сохранённый проект');
  const filename=String(file.name||'');
  if(/\.zip$/i.test(filename)){
   // Extract ONLY JSON. Never unzip unrelated 3D libraries into project storage.
   const records=await ZipUtils.extract(file,{projectOnly:true,maxEntries:2500,
    maxTotal:160000000,maxEntry:160000000});
   const names=Object.keys(records);
   const candidates=names.filter(n=>/\.json$/i.test(n)).sort((a,b)=>{
    const priority=n=>/\.phoenix\.json$/i.test(n)?0:
     /(?:^|\/)project\.json$/i.test(n)?1:2;
    return priority(a)-priority(b);
   });
   let legacy=false;
   for(const name of candidates){
    let doc;
    try{doc=JSON.parse(decoder.decode(records[name]));}catch(_){continue;}
    const type=classify(doc);
    if(type==='backup'||type==='project')return {...validated(doc),filename:name};
    if(type==='legacy')legacy=true;
   }
   if(legacy)throw Error('В ZIP найден старый проект Phoenix World Builder (версия 1). Он не совместим с редактором 2.0 без конвертации. Сцена не изменена.');
   throw Error('В ZIP нет редактируемого проекта Phoenix Builder 2.0. Если это архив GLB, используй «Загрузить ZIP».');
  }
  if(!/\.json$/i.test(filename))
   throw Error('Выбери .phoenix.json, .json или ZIP с сохранённым проектом');
  return {...validated(JSON.parse(await file.text())),filename};
 }
 return {classify,read};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ProjectOpen;
