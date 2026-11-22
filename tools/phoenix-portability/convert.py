#!/usr/bin/env python3
"""Phoenix offline World MAP portable JSON -> Unity/Unreal import package.
Python 3.9+ standard library; no user files sent to remote services.
For a map containing buildings, include PhoenixBuilder_Scene.glb as --geometry.
"""
import argparse,base64,json,math,re,shutil,sys
from pathlib import Path
STYLES={'grass':(.392,.541,.298),'earth':(.557,.443,.302),
 'sand':(.773,.706,.486),'stone':(.471,.498,.510),
 'snow':(.78,.859,.89),'clay':(.62,.392,.314),
 'default':(.397,.494,.393)}
COLLISION={'wall':'static-mesh','floor':'static-mesh','roof':'static-mesh',
 'stairs':'static-mesh','prop':'static-mesh','decal':'none','decor':'none'}
def safe(text):
 return (re.sub(r'[^A-Za-z0-9._-]+','_',str(text))[:60].strip('._-') or 'asset')
def height(x,z,s,h):
 width,depth=s['width'],s['depth']
 u=(x+width/2)/5;v=(z+depth/2)/5
 i,j=math.floor(u),math.floor(v);a,b=u-i,v-j
 g=lambda x,y:h.get((x,y),0)
 return ((1-a)*(1-b)*g(i,j)+a*(1-b)*g(i+1,j)
         +(1-a)*b*g(i,j+1)+a*b*g(i+1,j+1))
def write_terrain(out,state):
 out.mkdir(parents=True,exist_ok=True)
 w,d=float(state['width']),float(state['depth'])
 if not (10<=w<=5000 and 10<=d<=5000):raise ValueError('Map bounds must be 10..5000 m')
 nx=min(math.ceil(w/5),256);nz=min(math.ceil(d/5),256)
 h={}
 for node in state.get('heights') or []:
  if not isinstance(node,list) or len(node)!=3:raise ValueError('Invalid height node')
  i,j,v=node
  if not isinstance(i,int) or not isinstance(j,int) or not isinstance(v,(float,int)) or not math.isfinite(v) or abs(v)>1500:
   raise ValueError('Invalid height lattice value')
  h[(i,j)]=v
 tiles={(t['col'],t['row']):t['style'] for t in state.get('tiles') or []}
 tile_size=float(state.get('tileSize') or 50)
 with (out/'Terrain.mtl').open('w',encoding='utf8') as f:
  for style,color in STYLES.items():
   f.write('newmtl Phoenix_'+style+'\nKd '+' '.join(str(x) for x in color)+'\nKa 0.1 0.1 0.1\n\n')
 def generate(filename,unreal=False):
  with (out/filename).open('w',encoding='utf8') as f:
   f.write('# Phoenix terrain - metres in Unity, centimetres in Unreal\nmtllib Terrain.mtl\no Phoenix_Terrain\ns 1\n')
   for j in range(nz+1):
    z=-d/2+j*d/nz
    for i in range(nx+1):
     x=-w/2+i*w/nx;y=height(x,z,{'width':w,'depth':d},h)
     f.write('v %.4f %.4f %.4f\n'%((-z*100,x*100,y*100) if unreal else (x,y,z)))
   for j in range(nz+1):
    for i in range(nx+1):f.write('vt %.5f %.5f\n'%(i/nx,j/nz))
   prev=None
   for j in range(nz):
    for i in range(nx):
     x=-w/2+(i+.5)*w/nx;z=-d/2+(j+.5)*d/nz
     style=tiles.get((int((x+w/2)//tile_size),int((z+d/2)//tile_size)),'default')
     if style not in STYLES:style='default'
     if style!=prev:f.write('usemtl Phoenix_'+style+'\n');prev=style
     a=j*(nx+1)+i+1;b=a+1;c=a+nx+1;d0=c+1
     for v0,v1,v2 in ((a,c,b),(b,c,d0)):
      f.write('f '+f'{v0}/{v0} {v1}/{v1} {v2}/{v2}'+'\n')
 generate('Terrain_Unity.obj');generate('Terrain_Unreal.obj',True)
 return {'unity':'Terrain/Terrain_Unity.obj','unreal':'Terrain/Terrain_Unreal.obj',
  'material':'Terrain/Terrain.mtl','grid':[nx,nz],'sourceSpacingMetres':5,
  'worldWidthMetres':w,'worldDepthMetres':d,'approximateVisualMaterials':True}
def convert(path,geometry,out):
 with path.open(encoding='utf8') as f:doc=json.load(f)
 project=doc.get('project') or {}
 if doc.get('format')!='PhoenixBuilderBackupV1' or not isinstance(doc.get('assets'),list) or project.get('version')!=2:
  raise ValueError('Expected portable PhoenixBuilderBackupV1 JSON')
 if (project.get('layer') or {}).get('format')!='phoenix-world-map' or project.get('avatar') is not None or project.get('phoenixGame') is not None:
  raise ValueError('Expected a static Phoenix MAP layer, without player or mob data')
 if not isinstance(project.get('objects'),list):raise ValueError('Missing map objects')
 if out.exists() and any(out.iterdir()):raise ValueError('Destination must be empty')
 out.mkdir(parents=True,exist_ok=True)
 for directory in ['Models','Textures','Terrain','Geometry']:(out/directory).mkdir(exist_ok=True)
 assets=[];used=set()
 for i,asset in enumerate(doc['assets']):
  aid=asset.get('id')
  if not isinstance(aid,str) or aid in used or not aid.startswith(('glb:','texture:')):
   raise ValueError('Bad or duplicate asset ID: '+str(aid))
  used.add(aid);encoded=asset.get('base64')
  if not isinstance(encoded,str) or len(encoded)>700000000:raise ValueError('Missing/oversized asset')
  data=base64.b64decode(encoded,validate=True)
  if len(data)>512000000:raise ValueError('Resource too large')
  mime=asset.get('type') or ''
  if aid.startswith('glb:'):
   if data[:4]!=b'glTF':raise ValueError('Invalid GLB: '+aid)
   folder='Models';ext='.glb'
  else:
   folder='Textures';ext={'image/png':'.png','image/jpeg':'.jpg',
    'image/webp':'.webp','image/bmp':'.bmp','image/gif':'.gif'}.get(mime,'.img')
  name='%04d_%s%s'%(i+1,safe(asset.get('name') or aid),ext)
  rel=Path(folder)/name;(out/rel).write_bytes(data)
  assets.append({'id':aid,'file':rel.as_posix(),'mime':mime,'bytes':len(data)})
 scene_file=None
 if geometry and geometry.is_file():
  with geometry.open('rb') as f:
   if f.read(4)!=b'glTF':raise ValueError('Not a GLB')
  scene_file='Geometry/PhoenixBuilder_Scene.glb'
  shutil.copyfile(geometry,out/scene_file)
 elif project['objects']:
  raise ValueError('Buildings need PhoenixBuilder_Scene.glb. Export geometry in Phoenix Builder first')
 area=project.get('worldCanvas') or {'width':128,'depth':128,'tiles':[],'heights':[]}
 terrain=write_terrain(out/'Terrain',area)
 objects=[]
 for row in project['objects']:
  cat=row.get('category','prop')
  kind=str(row.get('kind',''))
  collision='door' if 'door' in kind.lower() else COLLISION.get(cat,'manual')
  if row.get('hidden'):collision='none'
  objects.append({'id':row.get('id'),'kind':kind,'label':row.get('label'),
   'category':cat,'position':row.get('position'),
   'rotation':row.get('rotation') or {'x':0,'y':row.get('rot',0),'z':0},
   'scale':row.get('scale',1),'hidden':bool(row.get('hidden')),
   'floor':row.get('storey',0),'roomRole':row.get('roomRole'),
   'collision':collision})
 result={'format':'PhoenixExternalWorld','version':1,'source':'Phoenix Engine',
  'units':'metres','coordinates':'Three.js Y-up',
  'worldKey':project['layer']['key'],'bounds':project['layer']['bounds'],
  'geometry':scene_file,'terrain':terrain,'worldCanvas':area,
  'objects':objects,'assets':assets,
  'notes':['Do not spawn the Models GLB on top of the complete scene GLB.',
   'OBJ terrain approximates visual material blending; splat masks preserved in worldCanvas.',
   'Review engine-specific coordinate conversion, collisions and door interactions.']}
 (out/'World.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 print('Phoenix Bridge OK:',len(objects),'objects;',len(assets),'assets;',out)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('map',type=Path)
 p.add_argument('--geometry',type=Path)
 p.add_argument('--out',type=Path,default=Path('Phoenix_World_Ready'))
 a=p.parse_args()
 try:convert(a.map,a.geometry or a.map.parent/'PhoenixBuilder_Scene.glb',a.out)
 except (ValueError,KeyError,OSError,TypeError) as error:
  print('Phoenix Bridge ERROR:',error,file=sys.stderr);sys.exit(2)
