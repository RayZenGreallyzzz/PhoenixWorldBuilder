/* Phoenix Builder -> portable Phoenix Server world manifest.
 * Exports game logic and scene placements, never GLB file bytes, PNG icons,
 * local saves, account credentials or private Android data.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixServerExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const FORMAT='phoenix-server-world';
 const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(id);
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function build(project,{worldId='main',name='Phoenix World',revision=1,
  spawn=[0,0,0]}={}){
  if(!project||typeof project!=='object'||Array.isArray(project))
   throw new TypeError('Invalid Builder project');
  if(!validId(worldId))throw new TypeError('Invalid server world ID');
  if(typeof name!=='string'||!name.trim()||name.length>80)
   throw new TypeError('Invalid server world title');
  if(!Number.isSafeInteger(revision)||revision<1||revision>100000000)
   throw new TypeError('Invalid server revision');
  const area=project.worldCanvas||{};
  const width=Number(area.width)||500,depth=Number(area.depth)||500;
  if(width<50||width>5000||depth<50||depth>5000)
   throw new TypeError('Invalid server world size');
  if(!Array.isArray(spawn)||spawn.length!==3||
     !spawn.every(n=>finite(n)&&Math.abs(n)<=100000)||
     Math.abs(spawn[0])>width/2||Math.abs(spawn[2])>depth/2)
   throw new TypeError('Spawn must be inside the world');
  const objects=[];
  for(const item of project.objects||[]){
   if(item?.hidden)continue;
   if(!Array.isArray(item?.position)||item.position.length!==3||
     !item.position.every(finite))continue;
   objects.push({kind:String(item.kind||'').slice(0,160),
    category:String(item.category||'misc').slice(0,50),
    position:item.position.slice()});
  }
  const game=project.phoenixGame||{};
  const prefabs=(game.catalog?.prefabs||[]).map(p=>({
   id:p.id,name:p.name,type:p.type,faction:p.faction,
   assetId:p.assetId||'',stats:p.stats,progression:p.progression||null,
   animations:p.animations,ai:p.ai,respawn:p.respawn,
   attackEffect:p.attackEffect
  }));
  const mobs=(game.world?.entities||[]).filter(entity=>
   entity?.components?.prefab&&entity?.components?.transform)
   .map(entity=>({
    id:entity.id,name:entity.name,
    prefabId:entity.components.prefab.id,
    position:entity.components.transform.position,
    yaw:entity.components.transform.yaw||0,
    stats:entity.components.stats||{},
    character:entity.components.character||{}
   }));
  const skills=(game.skills?.characters||[]).map(row=>({
   id:row.id,slots:Object.fromEntries(Object.entries(row.slots||{})
    .map(([id,s])=>[id,{...s,iconImage:''}]))
  }));
  const result={format:FORMAT,version:1,worldId,name:name.trim(),
   revision,bounds:{width,depth},spawn:spawn.slice(),
   objects,mobs,prefabs,skills};
  if(new TextEncoder().encode(JSON.stringify(result)).length>4_000_000)
   throw new TypeError('Server world exceeds 4 MB; reduce scene data');
  return result;
 }
 return Object.freeze({FORMAT,build});
});
