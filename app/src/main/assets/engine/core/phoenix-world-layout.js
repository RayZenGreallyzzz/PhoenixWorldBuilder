/* Phoenix Engine 1.4: shared kilometre-scale canvas + sparse landscape sectors.
 * Scene dimensions are metres. Never allocate all grid sectors as geometry.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWorldLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,MAX_METERS=5000,MAX_TILES=2048;
 const SIZES=Object.freeze([50,100,250,500,1000]);
 const STYLES=Object.freeze({
  grass:{title:'🌱 Трава',color:0x648a4c},
  earth:{title:'🟤 Земля',color:0x8e714d},
  sand:{title:'🏖 Песок',color:0xc5b47c},
  stone:{title:'🪨 Камень',color:0x787f82},
  snow:{title:'❄️ Снег',color:0xc7dbe3},
  clay:{title:'🧱 Глина',color:0x9e6450}
 });
 const has=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
 function length(n,name){
  if(typeof n!=='number'||!Number.isFinite(n)||n<10||n>MAX_METERS)
   throw new TypeError(name+' должен быть от 10 до 5000 м');
  return n;
 }
 function settings(data){
  const d=data||{};
  return {
   width:length(d.width===undefined?500:Number(d.width),'Ширина'),
   depth:length(d.depth===undefined?500:Number(d.depth),'Длина'),
   tileSize:length(d.tileSize===undefined?50:Number(d.tileSize),'Размер сектора')
  };
 }
 function cellAt(setting,x,z){
  const s=settings(setting);
  if(!Number.isFinite(x)||!Number.isFinite(z)||
     x< -s.width/2||x>=s.width/2||z< -s.depth/2||z>=s.depth/2)return null;
  const col=Math.floor((x+s.width/2)/s.tileSize);
  const row=Math.floor((z+s.depth/2)/s.tileSize);
  return {col,row,key:col+':'+row};
 }
 function rect(setting,col,row){
  const s=settings(setting),cols=Math.ceil(s.width/s.tileSize),
   rows=Math.ceil(s.depth/s.tileSize);
  if(!Number.isInteger(col)||!Number.isInteger(row)||
     col<0||row<0||col>=cols||row>=rows)return null;
  const minX=-s.width/2+col*s.tileSize,minZ=-s.depth/2+row*s.tileSize;
  const width=Math.min(s.tileSize,s.width/2-minX),
   depth=Math.min(s.tileSize,s.depth/2-minZ);
  return {minX,minZ,width,depth,x:minX+width/2,z:minZ+depth/2};
 }
 function validate(raw){
  const d=raw||{},s=settings(d),src=d.tiles??[];
  if(src===null||!Array.isArray(src)||src.length>MAX_TILES)
   throw new TypeError('Неверное число ландшафтных тайлов');
  if(d.version!==undefined&&d.version!==VERSION)
   throw new TypeError('Неизвестная версия ландшафта');
  const unique=new Set(),tiles=[];
  for(const item of src){
   const col=item?.col,row=item?.row,style=item?.style;
   const r=rect(s,col,row),key=col+':'+row;
   if(!r||!has(STYLES,style)||unique.has(key))
    throw new TypeError('Недопустимый ландшафтный сектор '+key);
   unique.add(key);tiles.push({col,row,style});
  }
  tiles.sort((a,b)=>a.row-b.row||a.col-b.col);
  return {version:VERSION,...s,tiles};
 }
 function plain(){
  return {version:VERSION,width:500,depth:500,tileSize:50,tiles:[]};
 }
 function legacy(){
  // Old UV44 projects have an exactly 128×128 metre ground.
  return {version:VERSION,width:128,depth:128,tileSize:50,tiles:[]};
 }
 function paint(raw,x,z,style){
  const state=validate(raw);
  if(!has(STYLES,style))throw new TypeError('Неизвестный тип ландшафта');
  const at=cellAt(state,x,z);
  if(!at)throw new RangeError('Вне границ общего холста');
  const i=state.tiles.findIndex(t=>t.col===at.col&&t.row===at.row);
  if(i>=0)state.tiles[i]={col:at.col,row:at.row,style};
  else{
   if(state.tiles.length>=MAX_TILES)
    throw new RangeError('Предел '+MAX_TILES+' тайлов для мобильного устройства');
   state.tiles.push({col:at.col,row:at.row,style});
  }
  return validate(state);
 }
 function erase(raw,x,z){
  const state=validate(raw),at=cellAt(state,x,z);
  if(!at)throw new RangeError('Вне границ общего холста');
  state.tiles=state.tiles.filter(t=>t.col!==at.col||t.row!==at.row);
  return validate(state);
 }
 function resize(raw,changes){
  const before=validate(raw),after=settings({...before,...changes});
  if(before.tiles.length&&(
    before.width!==after.width||before.depth!==after.depth||
    before.tileSize!==after.tileSize))
   throw new Error('Сначала удали ландшафтные тайлы или сохрани копию проекта');
  return validate({version:VERSION,...after,tiles:before.tiles});
 }
 return Object.freeze({
  VERSION,MAX_METERS,MAX_TILES,SIZES,STYLES,settings,cellAt,rect,
  validate,plain,legacy,paint,erase,resize
 });
});
