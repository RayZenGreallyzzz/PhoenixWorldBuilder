/* ZIP reader/writer, no network dependencies. Import supports store + DEFLATE via
 * DecompressionStream where provided by Android System WebView. */
const ZipUtils=(()=>{
 const enc=new TextEncoder(), dec=new TextDecoder();
 const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
 function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
 const u16=(v,p,n)=>{v.setUint16(p,n,true)},u32=(v,p,n)=>{v.setUint32(p,n>>>0,true)};
 function join(arr){const out=new Uint8Array(arr.reduce((s,b)=>s+b.byteLength,0));let p=0;for(const b of arr){out.set(b,p);p+=b.byteLength;}return out}
 async function build(items){let local=[],central=[],pos=0,count=0;
  for(const [name,value] of Object.entries(items)){
    let bytes=typeof value==='string'?enc.encode(value):value instanceof Uint8Array?value:new Uint8Array(value);
    let filename=enc.encode(name),h=new Uint8Array(30+filename.length),d=new DataView(h.buffer);u32(d,0,0x04034b50);u16(d,4,20);u16(d,6,0x800);u16(d,8,0);u32(d,14,crc(bytes));u32(d,18,bytes.length);u32(d,22,bytes.length);u16(d,26,filename.length);h.set(filename,30);
    let c=new Uint8Array(46+filename.length),cd=new DataView(c.buffer);u32(cd,0,0x02014b50);u16(cd,4,20);u16(cd,6,20);u16(cd,8,0x800);u32(cd,16,crc(bytes));u32(cd,20,bytes.length);u32(cd,24,bytes.length);u16(cd,28,filename.length);u32(cd,42,pos);c.set(filename,46);
    local.push(h,bytes);central.push(c);pos+=h.length+bytes.length;count++;
  }
  const cb=join(central),end=new Uint8Array(22),dv=new DataView(end.buffer);u32(dv,0,0x06054b50);u16(dv,8,count);u16(dv,10,count);u32(dv,12,cb.length);u32(dv,16,pos);return new Blob([...local,cb,end],{type:'application/zip'});
 }
 async function extract(file,{maxEntries=5000,maxTotal=170000000}={}){
  const ab=await file.arrayBuffer(),v=new DataView(ab),bytes=new Uint8Array(ab),out=Object.create(null);
  // Read the central directory, not just local file headers: common Android,
  // Windows and 7-Zip archives put sizes after each compressed stream
  // (general-purpose bit 3 / data descriptor).
  let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)
   if(v.getUint32(p,true)===0x06054b50){eocd=p;break}
  if(eocd<0)throw Error('Не найден каталог ZIP');
  const totalEntries=v.getUint16(eocd+10,true),centralOffset=v.getUint32(eocd+16,true);
  if(totalEntries>maxEntries)throw Error('Слишком много файлов в ZIP');
  if(centralOffset>=bytes.length)throw Error('Повреждён каталог ZIP');
  let pos=centralOffset,total=0;
  for(let n=0;n<totalEntries;n++){
   if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('Повреждён каталог ZIP');
   const method=v.getUint16(pos+10,true),flags=v.getUint16(pos+8,true);
   const compressed=v.getUint32(pos+20,true),uncompressed=v.getUint32(pos+24,true);
   const nameLen=v.getUint16(pos+28,true),extraLen=v.getUint16(pos+30,true),commentLen=v.getUint16(pos+32,true);
   const local=v.getUint32(pos+42,true);
   if(pos+46+nameLen+extraLen+commentLen>bytes.length)throw Error('Повреждено имя файла ZIP');
   const name=dec.decode(bytes.subarray(pos+46,pos+46+nameLen));
   pos+=46+nameLen+extraLen+commentLen;
   if(name.endsWith('/')||!/.(glb|png|jpg|jpeg|webp|json)$/i.test(name))continue;
   if(flags&1)throw Error('ZIP защищён паролем');
   if(name.split(/[\\/]/).includes('..'))throw Error('Небезопасный путь внутри ZIP');
   if(local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)throw Error('Повреждён заголовок ZIP');
   const dataStart=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
   if(dataStart+compressed>bytes.length||uncompressed>maxTotal-total)throw Error('Архив слишком большой для памяти устройства');
   const data=bytes.subarray(dataStart,dataStart+compressed);
   let contents;
   if(method===0)contents=data.slice();
   else if(method===8){
    if(typeof DecompressionStream==='undefined')throw Error('Android WebView не поддерживает распаковку DEFLATE');
    const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    contents=new Uint8Array(await new Response(stream).arrayBuffer());
   }else continue;
   if(contents.length!==uncompressed)throw Error('Повреждены данные ZIP: '+name);
   total+=contents.length;if(total>maxTotal)throw Error('Архив слишком большой для памяти устройства');
   out[name.replace(/\\/g,'/')]=contents;
  }
  return out;
 }
 return {build,extract};
})();
