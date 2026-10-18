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
  const ab=await file.arrayBuffer(), v=new DataView(ab), bytes=new Uint8Array(ab), out={};let offset=0,total=0,count=0;
  while(offset+30<=bytes.length){if(v.getUint32(offset,true)!==0x04034b50)break;
   if(++count>maxEntries)throw Error('Слишком много файлов в ZIP');
   let flags=v.getUint16(offset+6,true),method=v.getUint16(offset+8,true),compressed=v.getUint32(offset+18,true),nameLen=v.getUint16(offset+26,true),extra=v.getUint16(offset+28,true);
   if(flags&8)throw Error('ZIP с data descriptor пока не поддерживается: распакуй архив на планшете');
   if(flags&1)throw Error('ZIP защищён паролем');
   let name=dec.decode(bytes.slice(offset+30,offset+30+nameLen)),start=offset+30+nameLen+extra;if(start+compressed>bytes.length)throw Error('Повреждён архив');
   const comp=bytes.slice(start,start+compressed);offset=start+compressed;
   if(name.endsWith('/')||(!/\.(glb|png|jpg|jpeg|webp|json)$/i.test(name)))continue;
   let contents;
   if(method===0)contents=comp;
   else if(method===8){if(!('DecompressionStream' in window))throw Error('Твой WebView не поддерживает распаковку ZIP — извлеки файлы через менеджер');const ds=new DecompressionStream('deflate-raw');const stream=new Blob([comp]).stream().pipeThrough(ds);contents=new Uint8Array(await new Response(stream).arrayBuffer());}
   else continue;
   total+=contents.length;if(total>maxTotal)throw Error('Архив слишком большой для памяти устройства');out[name]=contents;
  }
  return out;
 }
 return {build,extract};
})();
