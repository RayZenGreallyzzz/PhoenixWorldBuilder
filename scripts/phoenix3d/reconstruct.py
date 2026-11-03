#!/usr/bin/env python3
"""Restore the exact Phoenix 3D XAPK from 6 GitHub Release ZIP assets.

Usage: python3 scripts/phoenix3d/reconstruct.py release/ out/Phoenix3D_Planner.xapk

Five outer archives (1.zip..5.zip) each contain one Phoenix3D_Parts.zNN.
The sixth release asset Phoenix3D_Parts.zip is the final split segment.
Do not use zip -s 0 or just concatenate parts: split-ZIP offset metadata
and the 4-byte split header make that output noncanonical.
"""
import argparse,hashlib,shutil,struct,tempfile,zipfile,zlib
from pathlib import Path

N='Phoenix3D_Parts'
EXPECTED_SHA='76fc66de208c5c4efd83b262661302af8bb93febed08c31bb500262334aae17f'
BLOCK=4*1024*1024

def recover(directory:Path,destination:Path):
 with tempfile.TemporaryDirectory(prefix='planner_release_') as tmp:
  t=Path(tmp);parts=[]
  for number in range(1,6):
   out=t/f'{N}.z{number:02d}'
   direct=directory/out.name
   if direct.exists():parts.append(direct);continue
   archive=directory/f'{number}.zip'
   if not archive.is_file():raise FileNotFoundError(f'Missing release archive: {archive}')
   with zipfile.ZipFile(archive) as z:
    files=[info for info in z.infolist() if not info.is_dir()]
    if len(files)!=1 or Path(files[0].filename).name!=out.name:
     raise ValueError(f'{archive.name} must contain only {out.name}')
    with z.open(files[0]) as src,out.open('wb') as dst:shutil.copyfileobj(src,dst,BLOCK)
   parts.append(out)
  final=directory/f'{N}.zip'
  if not final.is_file():raise FileNotFoundError('Missing sixth part Phoenix3D_Parts.zip')
  parts.append(final)
  with parts[0].open('rb') as src:
   if src.read(4)!=b'PK\x07\x08':raise ValueError('Not a split ZIP: missing PK0708 header')
   hdr=src.read(30)
   if len(hdr)!=30 or hdr[:4]!=b'PK\x03\x04':raise ValueError('Invalid local ZIP header')
   _,version,flags,method,time,date,crc,compressed,original,namelen,extralen=struct.unpack('<IHHHHHIIIHH',hdr)
   name=src.read(namelen).decode('utf-8');src.seek(extralen,1)
   offset=src.tell()
  if name!='Phoenix3D_Planner.xapk' or method!=0 or flags!=0 or compressed!=original:
   raise ValueError('Expected a single nonencrypted STORED Phoenix3D_Planner.xapk')
  remaining=compressed;checksum=0;digest=hashlib.sha256()
  destination.parent.mkdir(parents=True,exist_ok=True)
  with destination.open('wb') as out:
   for i,part in enumerate(parts):
    with part.open('rb') as src:
     if i==0:src.seek(offset)
     while remaining:
      buf=src.read(min(BLOCK,remaining))
      if not buf:break
      out.write(buf);checksum=zlib.crc32(buf,checksum);digest.update(buf);remaining-=len(buf)
    if not remaining:break
  if remaining or checksum!=crc:
   destination.unlink(missing_ok=True)
   raise ValueError(f'Incomplete/corrupt parts: remaining={remaining}, CRC={checksum:08x}')
  actual=digest.hexdigest()
  if actual!=EXPECTED_SHA:
   destination.unlink(missing_ok=True)
   raise ValueError(f'XAPK differs from approved release: {actual}')
  with zipfile.ZipFile(destination) as x:
   if x.testzip() is not None or len(x.namelist())!=9 or any(not n.endswith('.apk') for n in x.namelist()):
    raise ValueError('XAPK is damaged or missing split APKs')
   print('Verified nine APK modules:',*[f'  {n}' for n in x.namelist()],sep='\\n')
  print('PASS: recovered',destination,'SHA-256',actual,'bytes',original)
  return actual

if __name__=='__main__':
 a=argparse.ArgumentParser()
 a.add_argument('parts_folder',type=Path);a.add_argument('output_xapk',type=Path)
 o=a.parse_args();recover(o.parts_folder,o.output_xapk)
