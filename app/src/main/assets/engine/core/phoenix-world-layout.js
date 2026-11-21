/* Phoenix Engine 1.4: shared kilometre-scale canvas + sparse landscape sectors.
 * Scene dimensions are metres. Never allocate all grid sectors as geometry.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWorldLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,MAX_METERS=5000,MAX_TILES=10000;
 const HEIGHT_STEP=5,MAX_HEIGHT_NODES=12000,MAX_ELEVATION=1500;
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
  if(!Array.isArray(d.heights??[])||(d.heights??[]).length>MAX_HEIGHT_NODES)
   throw new TypeError('Слишком много вершин рельефа для Android');
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
  const seen=new Set(),heights=[];
  const maxI=Math.ceil(s.width/HEIGHT_STEP),maxJ=Math.ceil(s.depth/HEIGHT_STEP);
  for(const cell of d.heights||[]){
   if(!Array.isArray(cell)||cell.length!==3)throw new TypeError('Ошибка карты высот');
   const [i,j,h]=cell,key=i+':'+j;
   if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||
      i>maxI||j>maxJ||!Number.isFinite(h)||
      Math.abs(h)>MAX_ELEVATION||seen.has(key))
    throw new TypeError('Неверная вершина рельефа '+key);
   seen.add(key);
   if(Math.abs(h)>=.005)heights.push([i,j,Math.round(h*100)/100]);
  }
  heights.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  return {version:VERSION,...s,tiles,heights};
 }
 function plain(){
  return {version:VERSION,width:500,depth:500,tileSize:50,tiles:[],heights:[]};
 }
 function legacy(){
  // Old UV44 projects have an exactly 128×128 metre ground.
  return {version:VERSION,width:128,depth:128,tileSize:50,tiles:[],heights:[]};
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
  if((before.tiles.length||before.heights.length)&&(
    before.width!==after.width||before.depth!==after.depth||
    before.tileSize!==after.tileSize))
   throw new Error('Сначала очисти ландшафт и рельеф или сохрани копию проекта');
  return validate({version:VERSION,...after,tiles:before.tiles,heights:before.heights});
 }
 // Sparse editable height lattice: 5m spacing; only non-zero nodes saved.
 function heightAt(raw,x,z,lookup=null){
  const s=raw;
  const nx=(x+s.width/2)/HEIGHT_STEP,nz=(z+s.depth/2)/HEIGHT_STEP;
  if(!Number.isFinite(nx)||!Number.isFinite(nz)||
     nx<0||nz<0||nx>s.width/HEIGHT_STEP||nz>s.depth/HEIGHT_STEP)
   return 0;
  const i=Math.floor(nx),j=Math.floor(nz),tx=nx-i,tz=nz-j;
  const map=lookup||new Map(s.heights.map(([a,b,h])=>[a+':'+b,h]));
  const get=(a,b)=>map.get(a+':'+b)||0;
  return (1-tx)*(1-tz)*get(i,j)+tx*(1-tz)*get(i+1,j)+
   (1-tx)*tz*get(i,j+1)+tx*tz*get(i+1,j+1);
 }
 function sculpt(raw,x,z,options={}){
  const s=validate(raw),r=Number(options.radius??25),
   power=Number(options.strength??3),seconds=Number(options.seconds??.08),
   mode=options.mode||'raise';
  if(!Number.isFinite(x)||!Number.isFinite(z)||x< -s.width/2||
     x>s.width/2||z< -s.depth/2||z>s.depth/2)
   throw new RangeError('Кисть за границами мира');
  if(!Number.isFinite(r)||r<5||r>150||!Number.isFinite(power)||
     power<=0||power>30||!Number.isFinite(seconds)||seconds<0||seconds>.25||
     !['raise','lower','smooth'].includes(mode))
   throw new TypeError('Некорректный радиус, сила или режим кисти');
  const map=new Map(s.heights.map(([i,j,h])=>[i+':'+j,h]));
  const toWorldX=i=>i*HEIGHT_STEP-s.width/2;
  const toWorldZ=j=>j*HEIGHT_STEP-s.depth/2;
  const loI=Math.max(0,Math.ceil((x-r+s.width/2)/HEIGHT_STEP));
  const hiI=Math.min(Math.floor(s.width/HEIGHT_STEP),
   Math.floor((x+r+s.width/2)/HEIGHT_STEP));
  const loJ=Math.max(0,Math.ceil((z-r+s.depth/2)/HEIGHT_STEP));
  const hiJ=Math.min(Math.floor(s.depth/HEIGHT_STEP),
   Math.floor((z+r+s.depth/2)/HEIGHT_STEP));
  const updates=[];
  const step=Math.min(.25,seconds)*power;
  for(let j=loJ;j<=hiJ;j++)for(let i=loI;i<=hiI;i++){
   const d=Math.hypot(toWorldX(i)-x,toWorldZ(j)-z);
   if(d>r)continue;
   const weight=Math.pow(1-(d/r)*(d/r),2);
   const key=i+':'+j,current=map.get(key)||0;
   let height=current;
   if(mode==='raise')height+=step*weight;
   else if(mode==='lower')height-=step*weight;
   else{
    // Keep the filter local and symmetric: smooth towards the neighbours
    // from the previous snapshot, never an updated cell in this same pass.
    const neighbour=[[i-1,j],[i+1,j],[i,j-1],[i,j+1]];
    let total=0,count=0;
    for(const [a,b] of neighbour){
     if(a<0||b<0||a*HEIGHT_STEP>s.width||b*HEIGHT_STEP>s.depth)continue;
     total+=map.get(a+':'+b)||0;count++;
    }
    const average=count?total/count:current;
    height+=Math.min(1,step*.25)*weight*(average-current);
   }
   height=Math.max(-MAX_ELEVATION,Math.min(MAX_ELEVATION,height));
   height=Math.round(height*100)/100;
   if(Math.abs(height-current)<.005)continue;
   updates.push([key,height]);
  }
  if(!updates.length)return s;
  const additions=updates.filter(([key,v])=>Math.abs(v)>=.005&&!map.has(key)).length;
  if(map.size+additions>MAX_HEIGHT_NODES)
   throw new RangeError('Максимум '+MAX_HEIGHT_NODES+
    ' изменённых вершин: выбери более крупную кисть или очисти рельеф');
  for(const [key,value] of updates){
   if(Math.abs(value)<.005)map.delete(key);else map.set(key,value);
  }
  const heights=[...map].map(([key,h])=>{
   const [i,j]=key.split(':').map(Number);return [i,j,h];
  });
  return validate({...s,heights});
 }
 return Object.freeze({
  VERSION,MAX_METERS,MAX_TILES,MAX_HEIGHT_NODES,HEIGHT_STEP,
  SIZES,STYLES,settings,cellAt,rect,heightAt,sculpt,
  validate,plain,legacy,paint,erase,resize
 });
});
