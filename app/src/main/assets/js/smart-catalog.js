/* Phoenix Smart Library: deterministic folder-first ZIP classification.
 * All filenames remain local. No cloud/ML calls and no destructive re-sorting
 * of user's existing library or presets.
 */
const SmartCatalog=(()=>{
 'use strict';
 const labels={
  walls:'🧱 Стены',corners:'📐 Углы и дуги',floors:'▦ Пол',
  ceilings:'▤ Потолок',stairs:'🪜 Лестницы',roofs:'🏠 Крыши',
  doors:'🚪 Двери',windows:'🪟 Окна',frames:'▯ Рамы',
  decor:'🌿 Декор',textures:'🎨 Текстуры',
  'my-modules':'📦 Мои модули','my-textures':'🖼 Мои текстуры'
 };
 const order=['walls','corners','floors','ceilings','stairs','roofs',
  'doors','windows','frames','decor','my-modules'];
 const definitions=[
  ['my-textures',/^(?:мо[иё]и?\s*текстур[а-я]*|my\s*textures?|custom\s*textures?|user\s*textures?)$/iu],
  ['my-modules',/^(?:мо[иё]и?\s*модул[а-я]*|my\s*modules?|custom\s*models?|user\s*models?|сво[ийяе]\s*модул[а-я]*)$/iu],
  ['stairs',/(?:лестниц|ступен|лестнич|stairs?|staircase|steps?|ladder)/iu],
  ['corners',/(?:угол|углов|угл[ыа]|corner|angular|quarter|arc(?:90|180)?|арка\s*стен|радиусн|скругл|полукруг|semicircle|round\s*wall|curved\s*wall|дуг[аи])/iu],
  ['ceilings',/(?:потол|перекрыти|ceiling|soffit)/iu],
  ['floors',/(?:полы?|floor|tile\s*floor|плит[аы]\s*пол|фундамент|foundation|slab|настил)/iu],
  ['roofs',/(?:крыш|кровл|roof|gable|ridge|mansard|shingle|шат[её]р)/iu],
  ['doors',/(?:двер|ворот|door|gate|portcullis)/iu],
  ['windows',/(?:окн|окош|window|glaz|glass\s*window)/iu],
  ['frames',/(?:рам[аы]?|косяк|наличник|frame|jamb|trim\s*door)/iu],
  ['walls',/(?:стен|кирпичн\s*стен|wall|partition|facade|фасад|панель\s*стен)/iu],
  ['decor',/(?:декор|украшени|скульп|колон|pillar|column|ornament|statue|plant|furniture|мебел|фонар|lamp|prop|decor|asset)/iu],
  ['textures',/(?:текстур|texture|material|узор|pattern|albedo|diffuse|roughness|normal|basecolor)/iu]
 ];
 function tokenize(raw){
  return String(raw||'').normalize('NFC').replace(/([a-zа-яё])([A-ZА-ЯЁ])/gu,'$1 $2')
   .replace(/[._\\/\-]+/g,' ').replace(/\d+/g,' ').trim().toLowerCase();
 }
 function detect(text,textureOnly=false){
  const t=tokenize(text);
  for(const [id,rx] of definitions){
   if(textureOnly&&!['textures','my-textures'].includes(id))continue;
   if(rx.test(t))return id;
  }
  return null;
 }
 function classify(path,override=null){
  const clean=String(path||'').replace(/\\/g,'/');
  const ext=clean.split('.').pop()?.toLowerCase();
  const texture=['png','jpg','jpeg','webp'].includes(ext);
  const model=ext==='glb';
  if(!texture&&!model)return null;
  const chunks=clean.split('/').filter(Boolean),name=chunks.pop()||'';
  const possible=texture?['textures','my-textures']:order;
  if(override&&possible.includes(override))
   return {folder:override,category:category(override),type:texture?'texture':'model',name};
  // Existing ZIP folders take precedence, from nearest parent backwards.
  // This retains the user's already-organised content.
  for(let i=chunks.length-1;i>=0;i--){
   const found=detect(chunks[i],texture);
   if(found&&possible.includes(found))
    return {folder:found,category:category(found),type:texture?'texture':'model',name};
  }
  const guessed=detect(name,texture);
  const folder=guessed&&possible.includes(guessed)?guessed:
   texture?'my-textures':'my-modules';
  return {folder,category:category(folder),type:texture?'texture':'model',name};
 }
 function category(folder){
  if(['walls','corners'].includes(folder))return 'wall';
  if(['floors','ceilings'].includes(folder))return 'floor';
  if(folder==='roofs')return 'roof';
  if(folder==='decor')return 'decor';
  return 'prop';
 }
 function filteredEntries(entries,section,term=''){
  const needle=tokenize(term);
  return entries.filter(e=>(section==='all'||e.folder===section)&&
   (!needle||tokenize(e.name+' '+e.path+' '+(labels[e.folder]||'')).includes(needle)))
   .sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true}));
 }
 function safeEntry(path){
  const s=String(path||'').replace(/\\/g,'/');
  return !!s&&s.length<260&&!s.includes('\0')&&
   !s.startsWith('/')&&!s.split('/').some(x=>x==='..'||x==='.')&&
   !s.startsWith('__MACOSX/')&&!s.split('/').some(x=>x.startsWith('._'));
 }
 return {labels,order,classify,category,filteredEntries,safeEntry,tokenize};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SmartCatalog;
