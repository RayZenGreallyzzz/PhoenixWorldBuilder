#!/usr/bin/env python3
"""Locate candidate native Planner 3D camera, scene model and project APIs."""
from pathlib import Path
import sys,re
base=Path(sys.argv[1])
focus=[
 'com/planner5d/library/widget/editor/editor3d',
 'com/planner5d/library/engine/libgdx',
 'com/planner5d/library/model/item',
 'com/planner5d/library/widget/event/directional',
]
keys=re.compile(r'glb|gltf|FileHandle|ModelInstance|modelInstance|VirtualJoystickView|cameraController|walkthrough|first.person|third.person|flyMode|moveCamera|updateCamera|inputProcessor|createItemFromUri|addItemBlocking|ItemNs',re.I)
print("## Relevant source paths and snippets")
count=0
for sub in focus:
 root=base/sub
 if not root.exists():continue
 files=list(root.rglob('*.java'))
 print("FOLDER",sub,"files",len(files))
 for f in files:
  try:lines=f.read_text(errors='replace').splitlines()
  except:continue
  matched=[i for i,x in enumerate(lines) if keys.search(x)]
  if not matched:continue
  score=sum(1 for i in matched if re.search(r'glb|gltf|ModelInstance|VirtualJoystickView|cameraController|walkthrough|first.person|third.person|createItemFromUri',lines[i],re.I))
  if score<1 and count>25:continue
  print("SOURCE",f.relative_to(base),"hits",len(matched),"strong",score)
  for i in matched[:6]:
   print(str(i+1)+': '+lines[i].strip()[:230])
  count+=1
  if count>62:break
 if count>62:break
print("## Targeted class details")
targets=[
 'com/planner5d/library/model/item/ItemNs.java',
 'com/planner5d/library/widget/VirtualJoystickView.java',
 'com/planner5d/library/widget/editor/editor3d/compatibility/GLTextureView.java',
 'com/planner5d/library/engine/libgdx/compatibility/a.java',
 'com/planner5d/library/widget/editor/helper/a2.java',
 'com/planner5d/library/model/manager/builtin/i.java',
]
for name in targets:
 f=base/name
 if not f.exists():continue
 lines=f.read_text(errors='replace').splitlines()
 print('CLASS',name,'lines',len(lines))
 if name.endswith('helper/a2.java') or name.endswith('builtin/i.java'):
  matcher=re.compile(r'VirtualJoystickView|createItemFromUri|setRenderer|onTouch|GLB|gltf|ModelInstance',re.I)
  indexes=[i for i,t in enumerate(lines) if matcher.search(t)][:14]
  for i in indexes:
   for j in range(max(0,i-3),min(i+5,len(lines))):
    print(j+1,lines[j].strip()[:240])
 else:
  for i,line in enumerate(lines[:125]):print(i+1,line.strip()[:240])
