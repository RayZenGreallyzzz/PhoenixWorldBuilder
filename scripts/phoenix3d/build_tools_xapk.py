#!/usr/bin/env python3
"""Patch Planner base APK with add-on launcher + DEX + local Three viewer assets.

DOES NOT replace the Planner Main activity and DOES NOT add GLB into
Planner's own room renderer; the new tools are a separate same-package screen.
The resulting unsigned APK must be zipaligned and all 9 APKs must be
resigned with the same signing key before installing.
"""
import argparse,struct,zipfile
from pathlib import Path
from patch_manifest import patch

def copy_info(zi):
 out=zipfile.ZipInfo(zi.filename,zi.date_time)
 out.compress_type=zi.compress_type;out.comment=zi.comment
 out.external_attr=zi.external_attr;out.create_system=zi.create_system
 out.extra=zi.extra;out.flag_bits=zi.flag_bits
 return out

def patch_base(base:Path,compiled_dex:Path,assets:Path,output:Path):
 inject={'AndroidManifest.xml':None,'classes19.dex':compiled_dex.read_bytes()}
 for name in ['index.html','three.min.js','GLTFLoader.js','OrbitControls.js']:
  inject['assets/phoenix3d/'+name]=(assets/name).read_bytes()
 with zipfile.ZipFile(base) as old,zipfile.ZipFile(output,'w',allowZip64=True) as out:
  if any(f'classes{i}.dex' not in old.namelist() for i in range(2,19)):
   raise ValueError('Unexpected Planner base APK DEX count: expected classes2..18')
  if 'classes19.dex' in old.namelist():raise ValueError('Existing classes19.dex: refusing collision')
  count=0
  for item in old.infolist():
   name=item.filename
   # Preserve other application metadata; drop stale v1 signature files.
   if name.startswith('META-INF/') and name.upper().endswith(('.RSA','.DSA','.SF','.MF')):continue
   copied=copy_info(item)
   if name=='AndroidManifest.xml':
    data=patch(old.read(item))
   else:data=old.read(item)
   out.writestr(copied,data)
   count+=1
  for name,data in inject.items():
   if name=='AndroidManifest.xml':continue
   out.writestr(name,data,compress_type=zipfile.ZIP_STORED if name.endswith('.dex') else zipfile.ZIP_DEFLATED)
 with zipfile.ZipFile(output) as z:
  assert z.testzip() is None
  assert 'classes19.dex' in z.namelist()
  assert len([n for n in z.namelist() if n.startswith('assets/phoenix3d/')])==4
 print('Patched Planner base APK:',output,'original entries',count,'size',output.stat().st_size)

def strip_v2(source:Path,dest:Path):
 data=source.read_bytes();tail=data[-65557:]
 index=tail.rfind(b'PK\x05\x06')
 if index<0:raise ValueError(f'Invalid APK: {source}')
 eocd=len(data)-len(tail)+index
 central=struct.unpack_from('<I',data,eocd+16)[0]
 if data[central-16:central]!=b'APK Sig Block 42':
  dest.write_bytes(data);return
 length=struct.unpack_from('<Q',data,central-24)[0]
 begin=central-8-length
 if begin<0 or struct.unpack_from('<Q',data,begin)[0]!=length:
  raise ValueError('Invalid signing block length')
 end=bytearray(data[eocd:]);struct.pack_into('<I',end,16,begin)
 dest.write_bytes(data[:begin]+data[central:eocd]+end)

if __name__=='__main__':
 ap=argparse.ArgumentParser()
 ap.add_argument('--base',required=True,type=Path)
 ap.add_argument('--dex',required=True,type=Path)
 ap.add_argument('--assets',required=True,type=Path)
 ap.add_argument('--output',required=True,type=Path)
 a=ap.parse_args();patch_base(a.base,a.dex,a.assets,a.output)
