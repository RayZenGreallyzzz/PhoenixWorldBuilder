/* Offline classification of ZIP assets: no AI, server or manual folder unpacking.
 * Distinguishes repeatable finishes from single artwork and proposes safe,
 * high-confidence model/texture matches. Explicit metadata always wins.
 */
const SmartPackage=(()=>{
 const norm=s=>String(s||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+|\/+$/g,'');
 const key=s=>norm(s).toLocaleLowerCase();
 const base=s=>norm(s).split('/').pop()||'';
 const ext=s=>(base(s).match(/\.([^.]+)$/)||[])[1]?.toLowerCase()||'';
 const stem=s=>base(s).replace(/\.[^.]+$/,'');
 const simplify=s=>stem(s).toLocaleLowerCase()
  .replace(/(?:[_ .-](?:base[_ -]?color|albedo|diffuse|color|colour|texture|tex|map|material|mat|2k|4k|8k|normal|roughness|metallic))+(?:[_ .-]?(?:\d+))?$/i,'')
  .replace(/[^a-z0-9а-яё]+/gi,'');
 // Read Cyrillic folder names as they are. Paths such as
 // "Большие гобелены/..." and "Картины на стену/..." must work too.
 // The file extension alone does not turn a painting into a tiled material.
 const artworkWord=/(?:^|[\\/\s_.-])(?:картин[а-яё]*|гобелен[а-яё]*|габелен[а-яё]*|габилен[а-яё]*|гобилен[а-яё]*|панно|фреск[а-яё]*|живопис[а-яё]*|эмблем[а-яё]*|герб[а-яё]*|логотип[а-яё]*|постер[а-яё]*|плакат[а-яё]*|фотографи[а-яё]*|витраж[а-яё]*|декал[а-яё]*|баннер[а-яё]*|painting[s]?|tapestr(?:y|ies)|mural[s]?|artwork|picture[s]?|poster[s]?|emblem[s]?|decal[s]?|banner[s]?|gallery)(?=$|[\\/\s_.-])/i;
 const kind=s=>artworkWord.test(key(s))?'painting':'texture';
 const category=s=>{
  const v=key(s);
  if(/(?:wall|стен|window|окно|двер|door|pillar|колон)/.test(v)&&/(?:arc|полукруг|curved|round)/.test(v))return 'wall';
  const corner=/(?:corner|угол|углов|углы|угловые|угловой|угловая|стык)/.test(v);
  // «Полукруглая стена» is not a floor. Match standalone floor words.
  const floorWord=/(?:^|[\\/\s_.-])(?:floor|slab|foundation|пол|полы|пола|плит[а-яё]*|фундамент[а-яё]*|настил[а-яё]*)(?=$|[\\/\s_.-])/i.test(v);
  if(corner&&floorWord)return 'foundation';
  if(corner)return 'corner';
  if(/(?:ceiling|потол|перекрыт)/.test(v))return 'ceiling';
  if(/(?:roof|крыша|кровл)/.test(v))return 'roof';
  if(floorWord||/(?:platform|основан)/.test(v))return 'foundation';
  if(/(?:wall|стен|window|окно|pillar|колон)/.test(v))return 'wall';
  if(/(?:door|двер|ворот)/.test(v))return 'door';
  if(/(?:stairs|лестниц|ступен)/.test(v))return 'stairs';
  return 'prop';
 };
 const normalizedRole=role=>{
  const r=String(role||'').toLocaleLowerCase();
  if(artworkWord.test(r)||/paint|art|tapestry|mural|decal|emblem|картин|гобелен|габелен|габилен|панно|эмблем|фреск/.test(r))
   return 'painting';
  if(/texture|finish|material|облицов|отделк|текстур|покрыт|покрыти|штукатур|обои|ткан|кирпич|камен|дерев/.test(r))return 'texture';
  return null;
 };
 const normalizeCategory=(value,fallback)=>{
  if(!value)return category(fallback);
  const v=String(value).toLocaleLowerCase().trim();
  if(['foundation','wall','corner','ceiling','stairs','roof','door','prop'].includes(v))return v;
  if(/угол|углов|углы|угловые|угловой|угловая|corner/.test(v))return 'corner';
  if(/стен|wall|колонн|pillar/.test(v))return 'wall';
  if(/потол|перекрыт|ceiling/.test(v))return 'ceiling';
  if(/кры|кровл|roof/.test(v))return 'roof';
  if(/пол|фундамент|плит|floor/.test(v))return 'foundation';
  if(/лест|ступен|stair/.test(v))return 'stairs';
  if(/двер|ворот|door/.test(v))return 'door';
  return category(fallback);
 };
 function lookup(paths,name){
  if(!name)return null;
  const needle=key(name);
  const exact=paths.find(p=>key(p)===needle);
  if(exact)return exact;
  // Metadata inside a nested top-level package can use paths from its root.
  const matches=paths.filter(p=>key(p).endsWith('/'+needle)||key(p)===needle);
  if(matches.length===1)return matches[0];
  const byBasename=paths.filter(p=>key(base(p))===key(base(name)));
  return byBasename.length===1?byBasename[0]:null;
 }
 function metadataFor(manifest,paths){
  const models=new Map(),images=new Map();
  const rawModels=Array.isArray(manifest?.models)?manifest.models:
   Array.isArray(manifest?.assets)?manifest.assets:[];
  const rawImages=Array.isArray(manifest?.images)?manifest.images:[];
  for(const m of rawModels){
   const filename=lookup(paths,m?.path||m?.model||m?.file);
   if(filename&&ext(filename)==='glb')models.set(filename,m);
  }
  for(const img of rawImages){
   const filename=lookup(paths,img?.path||img?.file);
   if(filename&&/^(?:png|jpe?g|webp)$/.test(ext(filename)))images.set(filename,img);
  }
  return {models,images};
 }
 function analyze(paths,manifest={}){
  const list=paths.map(norm).filter(Boolean),{models,images}=metadataFor(manifest,list);
  const glbs=[],pictures=[],textures=[];
  for(const filename of list){
   const format=ext(filename);
   if(format==='glb'){
    const explicit=models.get(filename)||{};
    glbs.push({path:filename,category:normalizeCategory(explicit.category,filename),metadata:explicit});
   }else if(/^(png|jpg|jpeg|webp)$/.test(format)){
    const explicit=images.get(filename)||{};
    const role=normalizedRole(explicit.role||explicit.usage||explicit.type)||kind(filename);
    (role==='painting'?pictures:textures).push({path:filename,role,metadata:explicit});
   }
  }
  const allImages=[...textures,...pictures],bindings=new Map(),linked=[];
  for(const model of glbs){
   const meta=model.metadata;
   if(meta.materials||meta.texture){
    const declared=Array.isArray(meta.materials)?meta.materials:
     [{name:'',texture:meta.texture}];
    const slots=declared.map(m=>{
     const texture=lookup(allImages.map(i=>i.path),m.texture||m.file);
     return texture?{name:m.name||'',path:texture}:null;
    }).filter(Boolean);
    if(slots.length){bindings.set(model.path,{slots,applyAll:!!meta.texture&&!meta.materials});linked.push(model.path)}
    continue;
   }
   const token=simplify(model.path);
   if(token.length<4)continue;
   // Automatic association requires a one-to-one, shared base filename,
   // never a generic stone texture or picture in an unrelated folder.
   const matching=textures.filter(t=>simplify(t.path)===token);
   if(matching.length!==1)continue;
   bindings.set(model.path,{slots:[{name:'',path:matching[0].path}],applyAll:true});
   linked.push(model.path);
  }
  return {models:glbs,pictures,textures,bindings,linked,lookup};
 }
 return {analyze,kind,category,lookup,normalizedRole,normalizeCategory};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SmartPackage;
