#!/usr/bin/env python3
"""Summarize architectural scene boundary from decompiled Planner dex.
Only extract filenames and very short matching lines, not bulk proprietary source.
"""
import sys,re
from pathlib import Path
root=Path(sys.argv[1])
files=list(root.rglob('*.java'))
print('Total Java sources:',len(files))
keywords=[
 ('Planner UI entrypoints',r'class\\s+(Main|EditorActivity|ProjectActivity|EditorScreen)\\b|onCreate\\(|GLSurfaceView|SurfaceView'),
 ('3D renderer',r'FilamentAsset|AssetLoader|ResourceLoader|com\\.badlogic\\.gdx|com\\.google\\.android\\.filament|Renderer\\b|SceneView'),
 ('Scene objects',r'createObject|addObject|addItem|addModel|addFurniture|objectsInScene|sceneGraph'),
 ('Avatar / movement',r'playerCharacter|CharacterController|ThirdPerson|joystick|setCameraPosition|cameraMove|cameraPosition|avatar|walkMode'),
 ('Project save',r'Floor\\b|Wall\\b|Project\\b|saveProject|serialize|projectId'),
]
for section,pattern in keywords:
 regex=re.compile(pattern,re.I)
 results=[]
 for f in files:
  if 'com/planner5d' not in str(f).replace('\\','/'):continue
  try:
   lines=f.read_text(errors='replace').splitlines()
  except OSError:continue
  hits=[(i+1,line.strip()) for i,line in enumerate(lines) if regex.search(line)]
  if hits:
   short=str(f.relative_to(root))
   for i,line in hits[:3]:
    if len(results)<90:
     line=re.sub(r'\\s+',' ',line)[:165]
     results.append(f'{short}:{i} {line}')
 print('\\n##',section,': files',len(set(r.split(':')[0] for r in results)))
 for s in results[:90]:print(s)
print('\\n## Planner namespace class paths')
names=[str(f.relative_to(root)) for f in files if '/com/planner5d/' in '/'+str(f.relative_to(root)).replace('\\','/')]
for f in names[:120]:print(f)
