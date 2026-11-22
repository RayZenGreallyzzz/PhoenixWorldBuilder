// Place this file under Assets/Editor in a Unity project.
// Install com.unity.cloud.gltfast with Package Manager to import GLBs.
// Menu: Tools / Phoenix Engine / Import Phoenix World...
#if UNITY_EDITOR
using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
public static class PhoenixWorldImporter
{
 [Serializable] class TerrainRef { public string unity; public string unreal; }
 [Serializable] class WorldObject {
  public int id; public string kind; public string category;
  public string collision; public bool hidden;
 }
 [Serializable] class World {
  public string format,geometry,worldKey;public int version;
  public TerrainRef terrain;public WorldObject[] objects;
 }
 [MenuItem("Tools/Phoenix Engine/Import Phoenix World...")]
 public static void Pick()
 {
  string name=EditorUtility.OpenFilePanel("Choose Phoenix Bridge World.json","","json");
  if(string.IsNullOrEmpty(name))return;
  try{Import(name);}
  catch(Exception ex){Debug.LogError(ex);
   EditorUtility.DisplayDialog("Phoenix import failed",ex.Message,"OK");}
 }
 public static void Import(string file)
 {
  World w=JsonUtility.FromJson<World>(File.ReadAllText(file));
  if(w==null||w.format!="PhoenixExternalWorld"||w.version!=1)
   throw new InvalidDataException("Expected Phoenix Bridge World.json version 1");
  string original=Path.GetDirectoryName(Path.GetFullPath(file));
  string folder="Assets/PhoenixWorld/Imported_"+
   Regex.Replace(w.worldKey??"Map","[^A-Za-z0-9_-]","_");
  string target=Path.Combine(Directory.GetCurrentDirectory(),folder);
  Directory.CreateDirectory(target);
  foreach(string sub in new[]{"Models","Textures","Geometry","Terrain"}){
   string from=Path.Combine(original,sub),to=Path.Combine(target,sub);
   if(!Directory.Exists(from))continue;
   Directory.CreateDirectory(to);
   foreach(string path in Directory.GetFiles(from)){
    if(sub=="Terrain"&&Path.GetFileName(path)=="Terrain_Unreal.obj")continue;
    File.Copy(path,Path.Combine(to,Path.GetFileName(path)),true);
   }
  }
  AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
  GameObject root=new GameObject("PhoenixWorld_"+(w.worldKey??"Map"));
  Undo.RegisterCreatedObjectUndo(root,"Phoenix world");
  var rules=new Dictionary<int,string>();
  foreach(WorldObject obj in w.objects??new WorldObject[0])
   if(!obj.hidden)rules[obj.id]=obj.collision;
  int colliders=0;
  if(!string.IsNullOrEmpty(w.geometry)){
   string asset=folder+"/Geometry/PhoenixBuilder_Scene.glb";
   var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(asset);
   if(!prefab)throw new InvalidOperationException(
    "Missing GLB importer. Install com.unity.cloud.gltfast in Package Manager.");
   var scene=(GameObject)PrefabUtility.InstantiatePrefab(prefab);
   if(!scene)scene=UnityEngine.Object.Instantiate(prefab);
   scene.name="Phoenix_Static_Geometry";
   Undo.RegisterCreatedObjectUndo(scene,"Phoenix geometry");
   scene.transform.SetParent(root.transform,false);
   // Phoenix glTF nodes have names Phoenix_<object ID>_<mesh name>.
   // World matrices are already in the GLB, so DON'T spawn Models/ again.
   foreach(MeshFilter filter in scene.GetComponentsInChildren<MeshFilter>(true)){
    if(!filter.sharedMesh)continue;
    Match m=Regex.Match(filter.gameObject.name,@"Phoenix_(\d+)_");
    if(!m.Success||!int.TryParse(m.Groups[1].Value,out int id))continue;
    if(!rules.TryGetValue(id,out string rule))continue;
    if(rule!="static-mesh"&&rule!="door")continue;
    MeshCollider hit=filter.GetComponent<MeshCollider>();
    if(!hit)hit=Undo.AddComponent<MeshCollider>(filter.gameObject);
    hit.sharedMesh=filter.sharedMesh;hit.convex=false;
    filter.gameObject.isStatic=rule=="static-mesh";
    colliders++;
   }
  }
  if(w.terrain!=null&&!string.IsNullOrEmpty(w.terrain.unity)){
   var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(folder+"/Terrain/Terrain_Unity.obj");
   if(!prefab)Debug.LogWarning("Phoenix terrain OBJ missing");
   else{
    var terrain=(GameObject)PrefabUtility.InstantiatePrefab(prefab);
    if(!terrain)terrain=UnityEngine.Object.Instantiate(prefab);
    terrain.name="Phoenix_Terrain";terrain.transform.SetParent(root.transform,false);
    Undo.RegisterCreatedObjectUndo(terrain,"Phoenix terrain");
    foreach(MeshFilter filter in terrain.GetComponentsInChildren<MeshFilter>(true)){
     if(!filter.sharedMesh)continue;
     var hit=filter.GetComponent<MeshCollider>();
     if(!hit)hit=Undo.AddComponent<MeshCollider>(filter.gameObject);
     hit.sharedMesh=filter.sharedMesh;hit.convex=false;colliders++;
    }
   }
  }
  Selection.activeGameObject=root;EditorGUIUtility.PingObject(root);
  EditorUtility.DisplayDialog("Phoenix import complete",
   "Static mesh colliders: "+colliders+
   ". Verify axes, texture splat, doors and collision accuracy. Save your Unity scene.","OK");
 }
}
#endif
