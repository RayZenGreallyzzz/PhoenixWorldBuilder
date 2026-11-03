#!/usr/bin/env python3
"""Change display-only product name in the original resource string table.

All replacements are byte-length-identical. Do NOT touch package IDs, catalog
paths, network endpoints, billing code, licensing checks, scene or project data.
"""
import sys
from pathlib import Path

REPLACEMENTS=[
 ("Planner 5D","Phoenix 3D"),
 # Keep technical tokens without spaces intact; they may be used as IDs.
]
def apply(data:bytes)->tuple[bytes,dict]:
 counts={}
 for src,dst in REPLACEMENTS:
  assert len(src)==len(dst)
  for encoding in ('utf-8','utf-16le'):
   a=src.encode(encoding);b=dst.encode(encoding)
   count=data.count(a)
   counts[f'{src} ({encoding})']=count
   if count:data=data.replace(a,b)
 return data,counts

if __name__=='__main__':
 original=Path(sys.argv[1])
 output=Path(sys.argv[2])
 data=original.read_bytes()
 modified,counts=apply(data)
 if len(modified)!=len(data):raise RuntimeError('Resource structure changed in size')
 if not any(counts.values()):raise RuntimeError('No display brand references; inspect original resources')
 output.write_bytes(modified)
 print('Display-name patch counts:',counts)
