"""Run INSIDE Unreal Editor (Python Editor Script Plugin + Interchange glTF).
Select Tools -> Execute Python Script after setting PHOENIX_WORLD_JSON.
Scene GLB is imported using Interchange IMPORT SCENE (preserves node transforms);
Terrain_Unreal.obj uses centimetres. Physics, splat shaders and doors need QA.
"""
import json,os
from pathlib import Path
try:import unreal
except ImportError:raise RuntimeError('Run inside Unreal Editor with Python and Interchange enabled')
world_path=os.environ.get('PHOENIX_WORLD_JSON')
if not world_path:
 world_path=str(Path(__file__).resolve().parent.parent/'World.json')
world_file=Path(world_path)
if not world_file.is_file():
 raise FileNotFoundError('World.json missing. Set PHOENIX_WORLD_JSON to its full path.')
data=json.loads(world_file.read_text(encoding='utf8'))
if data.get('format')!='PhoenixExternalWorld' or data.get('version')!=1:
 raise ValueError('Expected Phoenix Bridge World.json v1')
directory=world_file.parent
name=''.join(c if c.isalnum() or c=='_' else '_' for c in data.get('worldKey','World'))
content_path='/Game/PhoenixWorld/'+name
mgr=unreal.InterchangeManager.get_interchange_manager_scripted()
if not mgr:raise RuntimeError('Enable Interchange and glTF import plugins')
if data.get('geometry'):
 glb=(directory/data['geometry']).resolve()
 if not glb.is_file() or glb.suffix.lower()!='.glb':
  raise FileNotFoundError('Missing PhoenixBuilder_Scene.glb: '+str(glb))
 source=unreal.InterchangeManager.create_source_data(str(glb))
 if not mgr.can_translate_source_data(source,True):
  raise RuntimeError('GLB level importer unavailable. Enable Interchange glTF plugin.')
 opts=unreal.ImportAssetParameters()
 opts.is_automated=False  # choose/inspect default scene import pipeline
 if not mgr.import_scene(content_path,source,opts):
  raise RuntimeError('Unreal Interchange GLB scene import was cancelled or failed')
 unreal.log('Phoenix: imported GLB environment with world transforms.')
terrain=directory/(data.get('terrain') or {}).get('unreal','')
if terrain.is_file() and terrain.suffix.lower()=='.obj':
 task=unreal.AssetImportTask()
 task.set_editor_property('filename',str(terrain))
 task.set_editor_property('destination_path',content_path+'/Terrain')
 task.set_editor_property('automated',False)
 task.set_editor_property('replace_existing',False)
 task.set_editor_property('save',True)
 unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
 for asset_name in task.get_editor_property('imported_object_paths'):
  mesh=unreal.load_asset(asset_name)
  if isinstance(mesh,unreal.StaticMesh):
   actor=unreal.EditorLevelLibrary.spawn_actor_from_object(mesh,unreal.Vector(0,0,0))
   if actor:
    actor.set_actor_label('Phoenix_Terrain')
    actor.set_actor_scale3d(unreal.Vector(1,1,1))
else:unreal.log_warning('Phoenix terrain OBJ missing.')
unreal.log_warning('Phoenix world loaded: review mesh collisions, axes, terrain material and door interactions before use.')
