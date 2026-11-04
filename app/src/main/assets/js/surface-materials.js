/* Offline material/texture palette for Phoenix Builder modules.
 * Texture choices persist as small descriptors, custom image bytes in IndexedDB.
 * Only instance materials are modified; catalog GLBs and their maps stay intact.
 */
const SurfaceMaterials=(()=>{
 'use strict';
 const styles=['none','paint','brick','stone','wood','tile','concrete','metal','custom'];
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const labels={none:'Исходный',paint:'🎨 Краска',brick:'🧱 Кирпич',stone:'🪨 Камень',
  wood:'🪵 Дерево',tile:'▦ Плитка',concrete:'◻ Бетон',metal:'⚙ Металл',custom:'🖼 Изображение'};
 function normalize(raw){
  const d=raw||{},style=styles.includes(d.style)?d.style:'none';
  return {style,color:/^#[0-9a-f]{6}$/i.test(d.color||'')?d.color:'#ffffff',
   repeat:clamp(Number(d.repeat)||1,.2,12),
   imageId:typeof d.imageId==='string'?d.imageId.slice(0,110):''};
 }
 function canvasPattern(style){
  const el=document.createElement('canvas');el.width=256;el.height=256;
  const c=el.getContext('2d');if(!c)return null;
  const fill=(color,x=0,y=0,w=256,h=256)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
  let seed=0xdecafbad;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  if(style==='brick'){
   fill('#dbd0ba');
   for(let y=0,row=0;y<256;y+=54,row++){
    for(let x=-64+(row%2)*64;x<256;x+=128){
     fill('#b66b52',x+3,y+3,122,48);fill('#ca795b',x+6,y+6,114,5);
    }
   }
  }else if(style==='tile'){
   fill('#c0b8a9');
   for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){
    fill((x+y)%128===0?'#e3dfd7':'#d1cfc8',x+3,y+3,58,58);
    fill('#f3f0e8',x+5,y+5,56,2);
   }
  }else if(style==='wood'){
   fill('#976740');for(let y=0;y<256;y+=48){
    fill(y%96===0?'#ad7950':'#8d5e3e',0,y+2,256,43);
    for(let k=0;k<8;k++){c.strokeStyle=k%2?'#835534':'#bb8860';c.lineWidth=1+rand()*2;
     c.beginPath();let py=y+4+rand()*36;c.moveTo(0,py);c.bezierCurveTo(60,py-4,170,py+5,256,py);c.stroke()}
   }
  }else if(style==='stone'){
   fill('#999c98');for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=96){
    fill(rand()>.5?'#b8b7b0':'#8c908e',x+3,y+3,90,58);
    fill('#d5d2c8',x+9,y+9,62,3);
   }
  }else if(style==='metal'){
   fill('#8b939e');for(let y=0;y<256;y+=32){
    fill(y%64?'#77828d':'#9ca5ac',0,y,256,28);
    for(let x=16;x<256;x+=64){c.beginPath();c.fillStyle='#46525d';c.arc(x,y+7,3,0,Math.PI*2);c.fill()}
   }
  }else if(style==='concrete'){
   fill('#b5b7b5');for(let i=0;i<5000;i++){
    c.fillStyle=rand()>.5?'#a4a7a5':'#c7c8c5';c.fillRect(rand()*256,rand()*256,1+rand()*3,1+rand()*3);
   }
  }else return null;
  const t=new THREE.CanvasTexture(el);
  t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=2;return t;
 }
 function apply(root,raw,customTexture=null){
  const style=normalize(raw);
  if(style.style==='none')return {ok:true,changed:false};
  if(style.style==='custom'&&!customTexture)
   return {ok:false,reason:'Сначала выбери загруженное изображение'};
  const template=style.style==='custom'?customTexture:
   style.style==='paint'?null:canvasPattern(style.style);
  if(style.style!=='paint'&&!template)return {ok:false,reason:'Не удалось создать текстуру'};
  const image=template?template.clone():null;
  if(image){
   image.wrapS=image.wrapT=THREE.RepeatWrapping;
   image.repeat.set(style.repeat,style.repeat);
   image.encoding=THREE.sRGBEncoding;image.needsUpdate=true;
  }
  let count=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.phoenixInsert)return;
   const update=mat=>{
    const copy=mat.clone();
    if(image)copy.map=image;
    else if(style.style==='paint')copy.map=null;
    copy.color.set(style.color);
    copy.needsUpdate=true;
    return copy;
   };
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(update):update(mesh.material);
   count++;
  });
  return {ok:true,changed:count>0,meshes:count};
 }
 return {styles,labels,normalize,apply,canvasPattern};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SurfaceMaterials;
