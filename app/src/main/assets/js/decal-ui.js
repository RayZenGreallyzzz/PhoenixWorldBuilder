/* Emblem/painting editor for Phoenix World Builder.
 * Individual PNGs and generated texts are stored in the texture library.
 * Only module data changes when applying a decal: world map remains manual-save.
 */
const DecalUI=(()=>{
 let api=null,active=0,lastEntry=null;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const get=key=>document.getElementById(key);
 const DECAL_PREFIX='emblem:';
 const existing=()=>api?.world?.selected||null;
 function value(){
  const entry=existing();return entry?DecalLayer.normalize(entry.data.decals):[];
 }
 function render(){
  if(!api)return;
  const entry=existing(),list=value(),sel=get('decalActive');
  if(entry!==lastEntry){lastEntry=entry;active=Math.max(0,list.length-1);}
  active=Math.min(active,Math.max(0,list.length-1));
  if(sel){
   sel.replaceChildren();
   if(!list.length){const opt=document.createElement('option');opt.value='';opt.textContent='Нет эмблем';sel.append(opt)}
   else list.forEach((d,i)=>{const opt=document.createElement('option');opt.value=String(i);
    opt.textContent=(i+1)+'. '+(api.textureMeta().get(d.texture)?.name||d.texture);
    sel.append(opt)});
   sel.value=list.length?String(active):'';
  }
  const d=list[active];
  if(!d&&entry){
   const cat=entry.data.category||entry.kind;
   const choice=get('decalFace');
   if(!choice.dataset.userChosenFor||choice.dataset.userChosenFor!==String(entry.data.id)){
    choice.value=['foundation','floor','ceiling','ceiling_finish'].includes(cat)?'top':'front';
    choice.dataset.userChosenFor=String(entry.data.id);
   }
  }
  if(d){
   get('decalFace').value=d.face;
   get('decalSize').value=Math.round(d.size*100);
   get('decalRotation').value=d.rotation;
   get('decalOpacity').value=Math.round(d.opacity*100);
  }
  get('decalSizeValue').textContent=d?Math.round(d.size*100)+'%':'—';
  get('decalRotationValue').textContent=d?d.rotation+'°':'—';
  get('decalOpacityValue').textContent=d?Math.round(d.opacity*100)+'%':'—';
  get('btnDecalFit').textContent=d?.fit==='fill'?'▣ Вписать с пропорциями':'▣ На всю поверхность';
  get('decalHint').textContent=entry?
   'Выбрано эмблем: '+list.length+'/'+DecalLayer.MAX+'. Настройки сохранятся после нажатия 💾 для карты.':
   'Сначала выбери стену или пол на карте, затем открой вкладку «Эмблемы».';
  for(const id of ['decalActive','decalSize','decalRotation','decalOpacity','decalLeft','decalRight','decalUp','decalDown','btnDecalFit','btnDecalDelete']){
   if(get(id))get(id).disabled=!d;
  }
 }
 function change(patch){
  const entry=existing();if(!entry)return;
  const list=value();if(!list[active])return;
  list[active]={...list[active],...patch};
  api.world.updateDecals(entry,list);
  render();
 }
 function shift(dx,dy){
  const d=value()[active];if(!d)return;
  change({x:clamp(Math.round((d.x+dx)*100)/100,0,1),
   y:clamp(Math.round((d.y+dy)*100)/100,0,1)});
 }
 async function addImage(id){
  const entry=existing();
  if(!entry)return api.toast('Сначала выбери стену или пол. Затем нажми на эмблему.');
  const list=value();
  if(list.length>=DecalLayer.MAX)return api.toast('На одной детали максимум 3 рисунка. Удали один, чтобы добавить новый.');
  const tex=await api.loadTexture(id);
  if(!tex)return api.toast('PNG не найдена или повреждена');
  const face=get('decalFace').value||((entry.data.category==='foundation')?'top':'front');
  const decal={id:'stamp:'+Date.now().toString(36),texture:id,face,x:.5,y:.5,size:.65,
   rotation:0,opacity:1,fit:'contain'};
  api.world.updateDecals(entry,[...list,decal]);
  active=list.length;render();api.toast('Эмблема нанесена. Меняй размер и положение в «Оформление».');
 }
 function imageCanvas(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  return [canvas,canvas.getContext('2d')];
 }
 async function saveCanvas(canvas,name){
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG не создана')),'image/png'));
  const id=DECAL_PREFIX+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  await api.saveTexture(id,name,new Uint8Array(await blob.arrayBuffer()),'image/png');
  await api.loadTexture(id);
  api.refreshGallery();return id;
 }
 function emblemDrawing(kind){
  const [canvas,c]=imageCanvas(),cx=256,cy=256;
  c.lineCap='round';c.lineJoin='round';
  const primary=['#e9bf60','#7bd8fe','#f3e5c8','#a8df98','#e28b87','#bca2ff'][kind];
  c.strokeStyle=primary;c.fillStyle=primary;
  c.shadowColor=primary;c.shadowBlur=10;
  function circle(r,width){c.lineWidth=width;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke()}
  function points(n,r,rot=-Math.PI/2){return Array.from({length:n},(_,i)=>[cx+Math.cos(rot+i*Math.PI*2/n)*r,cy+Math.sin(rot+i*Math.PI*2/n)*r])}
  function polygon(p,width){c.lineWidth=width;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke()}
  if(kind===0||kind===1||kind===5){
   circle(207,12);circle(187,3);circle(126,5);
   for(let i=0;i<12;i++){const a=i*Math.PI/6;c.save();c.translate(cx+Math.cos(a)*160,cy+Math.sin(a)*160);c.rotate(a+Math.PI/2);c.font='bold 39px serif';c.textAlign='center';c.fillText(['ᚨ','ᛉ','ᚱ','ᚾ','ᚷ','ᛟ'][i%6],0,12);c.restore()}
   polygon(points(kind===1?6:5,115),7);
   if(kind===5){polygon(points(3,98,Math.PI/2),7);polygon(points(3,98,-Math.PI/2),7)}
   else circle(41,12);
  }else if(kind===2){
   polygon(points(8,203),14);circle(169,8);polygon(points(5,141),8);
   c.beginPath();c.moveTo(256,120);c.lineTo(305,229);c.lineTo(399,249);c.lineTo(324,318);
   c.lineTo(341,404);c.lineTo(256,351);c.lineTo(171,404);c.lineTo(188,318);c.lineTo(113,249);
   c.lineTo(207,229);c.closePath();c.stroke();
  }else if(kind===3){
   circle(205,7);
   for(let i=0;i<8;i++){
    c.save();c.translate(256,256);c.rotate(i*Math.PI/4);
    c.lineWidth=13;c.beginPath();c.moveTo(0,-65);c.bezierCurveTo(-140,-135,-50,-180,0,-195);c.stroke();
    c.beginPath();c.ellipse(-54,-150,28,14,Math.PI/4,0,Math.PI*2);c.fill();c.restore();
   }
  }else{
   polygon(points(6,202),12);circle(141,8);
   c.lineWidth=18;c.beginPath();c.moveTo(165,320);c.lineTo(256,139);c.lineTo(347,320);c.stroke();
   c.beginPath();c.moveTo(183,270);c.lineTo(329,270);c.stroke();
  }
  return canvas;
 }
 async function ensureStarter(){
  if(!api)return;
  if([...api.textureMeta().keys()].some(id=>id.startsWith('emblem:starter-')))return;
  const names=['Золотой магический круг','Голубые руны','Герб светлого замка','Круг из лозы','Алый знак ордена','Фиолетовая печать'];
  for(let i=0;i<names.length;i++){
   const cv=emblemDrawing(i);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));
   if(!blob)continue;
   const id='emblem:starter-'+i;
   await api.saveTexture(id,names[i],new Uint8Array(await blob.arrayBuffer()),'image/png');
  }
  api.refreshGallery();
 }
 async function createText(){
  const text=prompt('Напиши надпись для стены или пола','PHOENIX');
  if(text===null)return;
  const message=text.trim().slice(0,70);
  if(!message)return api.toast('Надпись пустая');
  const color=prompt('Цвет надписи HEX','#f5d58c')||'#f5d58c';
  const fill=/^#[0-9a-fA-F]{6}$/.test(color)?color:'#f5d58c';
  const [canvas,c]=imageCanvas();c.fillStyle=fill;c.strokeStyle='#232126';c.lineWidth=7;
  c.textAlign='center';c.textBaseline='middle';
  const rows=message.match(/.{1,20}/g)?.slice(0,4)||[message];
  let font=rows.length>2?49:rows.length===2?66:90;
  c.font='bold '+font+'px Georgia, serif';
  while(rows.some(row=>c.measureText(row).width>474)&&font>25){font-=4;c.font='bold '+font+'px Georgia, serif'}
  rows.forEach((row,i)=>{const y=256+(i-(rows.length-1)/2)*(font+11);c.strokeText(row,256,y);c.fillText(row,256,y)});
  const id=await saveCanvas(canvas,'Надпись: '+message);
  if(existing())await addImage(id);
  else api.toast('Надпись добавлена в каталог. Выбери стену или пол.');
 }
 // Keep wide tapestries at native resolution while capping GPU memory on Android.
 function importDimensions(width,height){
  const maxSide=4096,maxPixels=2048*2048;
  const scale=Math.min(1,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
 }
 async function importFile(file){
  if(!file)return;
  if(!/^image\/(png|webp|jpeg)$/.test(file.type))return api.toast('Нужна картинка PNG, WEBP или JPG');
  if(file.size>15*1024*1024)return api.toast('Файл слишком большой (до 15 МБ)');
  const url=URL.createObjectURL(file);
  let img;
  try{
   img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Изображение не загрузилось'));i.src=url});
   const target=importDimensions(img.width,img.height);
   const name=file.name.replace(/\.(png|webp|jpe?g)$/i,'');
   let id;
   if(target.width===img.width&&target.height===img.height){
    // Do not re-encode in Canvas: preserve original pixels and transparency.
    id=DECAL_PREFIX+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
    await api.saveTexture(id,name,new Uint8Array(await file.arrayBuffer()),file.type);
    await api.loadTexture(id);
    api.refreshGallery();
   }else{
    const c=document.createElement('canvas');c.width=target.width;c.height=target.height;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,c.width,c.height);
    id=await saveCanvas(c,name);
   }
   if(existing())await addImage(id);
   else api.toast('PNG добавлена в каталог. Выбери стену и эмблему.');
  }catch(e){console.error(e);api.toast('Ошибка PNG: '+e.message)}
  finally{URL.revokeObjectURL(url)}
 }
 function init(options){
  api=options;
  get('decalActive').onchange=e=>{active=Math.max(0,Number(e.target.value)||0);render()};
  get('decalFace').onchange=e=>change({face:e.target.value});
  for(const [id,dx,dy] of [['decalLeft',-.05,0],['decalRight',.05,0],['decalUp',0,.05],['decalDown',0,-.05]])
   get(id).onclick=()=>shift(dx,dy);
  for(const [id,field,mult,output] of [['decalSize','size',.01,'decalSizeValue'],['decalRotation','rotation',1,'decalRotationValue'],['decalOpacity','opacity',.01,'decalOpacityValue']]){
   get(id).oninput=e=>{get(output).textContent=e.target.value+(field==='rotation'?'°':'%')};
   get(id).onchange=e=>change({[field]:Number(e.target.value)*mult});
  }
  get('btnDecalFit').onclick=()=>{
   const item=value()[active];if(item)change({fit:item.fit==='fill'?'contain':'fill'});
  };
  get('btnDecalDelete').onclick=()=>{
   const entry=existing();if(!entry)return;
   const list=value();if(!list[active])return;
   list.splice(active,1);active=Math.max(0,active-1);
   api.world.updateDecals(entry,list);render();
   api.toast('Эмблема удалена с детали');
  };
  get('btnDecalText').onclick=()=>createText().catch(err=>api.toast(err.message));
  get('btnImportEmblem').onclick=()=>get('fileEmblem').click();
  get('fileEmblem').onchange=e=>{const file=e.target.files?.[0];e.target.value='';importFile(file)};
  get('btnOpenEmblems').onclick=()=>openGallery();
  get('btnGameEmblems').onclick=()=>openGallery(true);
  render();
 }
 async function openGallery(fromGame=false){
  if(!existing())api.toast('Выбери стену или пол, затем эмблему');
  await ensureStarter().catch(err=>console.warn('Starter emblems',err));
  api.openGallery(fromGame);
 }
 return {init,render,addImage,importFile,importDimensions,createText,ensureStarter,openGallery};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DecalUI;
