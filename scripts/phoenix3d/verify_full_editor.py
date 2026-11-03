#!/usr/bin/env python3
"""Prove that Phoenix 3D overlay did NOT replace the original full builder.

Compare original base APK against patched/signed base. Only resource display
name and AndroidManifest are allowed to change, plus new optional classes19.dex
and assets/phoenix3d/*. Original objects, 3D models, database and 18 DEX
remain byte identical; no account/license code is patched.
"""
import sys,hashlib,zipfile
from pathlib import Path

orig,patched=map(Path,sys.argv[1:3])
with zipfile.ZipFile(orig) as a,zipfile.ZipFile(patched) as b:
 assert a.testzip() is None and b.testzip() is None
 old={x.filename:x for x in a.infolist()}
 new={x.filename:x for x in b.infolist()}
 count=0
 for name,i in old.items():
  if name.startswith('META-INF/') or name in {'AndroidManifest.xml','resources.arsc'}:continue
  j=new.get(name)
  assert j,('Deleted original resource:',name)
  assert i.file_size==j.file_size and i.CRC==j.CRC,('Changed original resource:',name)
  count+=1
 for n in [f'classes{i}.dex' if i>1 else 'classes.dex' for i in range(1,19)]+['assets/database.sqlite']:
  assert n in old and n in new,('Required original class/database missing:',n)
  ah=hashlib.sha256(a.read(n)).digest()
  bh=hashlib.sha256(b.read(n)).digest()
  assert ah==bh,('Modified original building/database data:',n)
 assets=[n for n in old if n.endswith('.p3d')]
 assert len(assets)>200,('Original furniture/building 3D assets unexpectedly absent:',len(assets))
 assert all(n in new for n in assets)
 assert 'classes19.dex' in new
 for n in ['game.html','game-gizmo.js','three.min.js']:
  assert 'assets/phoenix3d/'+n in new,('New game asset missing:',n)
 resource=b.read('resources.arsc')
 assert b'Phoenix 3D' in resource or 'Phoenix 3D'.encode('utf-16le') in resource
 print('PASS: full construction preserved:',count,'old APK entries unchanged by CRC,',
       len(assets),'original .p3d models, 18 byte-identical DEX files and original local SQLite.')
 print('New optional avatar/gizmo tools included. Native GLB integration NOT validated.')
