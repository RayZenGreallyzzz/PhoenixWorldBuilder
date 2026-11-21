/* Portable server world manifest v1. No embedded GLB/media or credentials.
 * The map/render assets remain in the published game client; the server owns
 * identity, bounds, spawn, gameplay metadata and world revision.
 */
import {validRoom,validPosition} from './protocol.mjs';
export const WORLD_FORMAT='phoenix-server-world';
const scalar=n=>typeof n==='number'&&Number.isFinite(n);
const clone=v=>JSON.parse(JSON.stringify(v));
export function validateWorld(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  input.format!==WORLD_FORMAT||input.version!==1)
  throw new TypeError('Invalid Phoenix server world format');
 if(!validRoom(input.worldId))throw new TypeError('Invalid worldId');
 const name=input.name;
 if(typeof name!=='string'||!name.trim()||name.length>80)
  throw new TypeError('Invalid world name');
 if(!Number.isSafeInteger(input.revision)||input.revision<1||
  input.revision>100000000)throw new TypeError('Invalid world revision');
 const bounds=input.bounds;
 if(!bounds||!scalar(bounds.width)||!scalar(bounds.depth)||
    bounds.width<50||bounds.width>5000||bounds.depth<50||bounds.depth>5000)
  throw new TypeError('Invalid world bounds');
 const spawn=input.spawn;
 if(!validPosition(spawn)||Math.abs(spawn[0])>bounds.width/2||
    Math.abs(spawn[2])>bounds.depth/2)
  throw new TypeError('Invalid world spawn');
 const objects=input.objects??[],mobs=input.mobs??[],
  prefabs=input.prefabs??[],skills=input.skills??[];
 if(!Array.isArray(objects)||objects.length>20000||
  !Array.isArray(mobs)||mobs.length>300||
  !Array.isArray(prefabs)||prefabs.length>500||
  !Array.isArray(skills)||skills.length>300)
  throw new TypeError('Invalid world content');
 for(const obj of objects){
  if(!obj||typeof obj.kind!=='string'||obj.kind.length>160||
     !validPosition(obj.position)||
     typeof obj.category!=='string'||obj.category.length>50)
   throw new TypeError('Invalid world object');
 }
 for(const item of [...mobs,...prefabs,...skills]){
  if(!item||typeof item!=='object'||Array.isArray(item))
   throw new TypeError('Invalid game definitions');
 }
 const safe={format:WORLD_FORMAT,version:1,worldId:input.worldId,
  name:name.trim(),revision:input.revision,
  bounds:{width:bounds.width,depth:bounds.depth},
  spawn:spawn.slice(),objects:clone(objects),mobs:clone(mobs),
  prefabs:clone(prefabs),skills:clone(skills)};
 // Prevent accidentally accepting large icon-data or image assets and leaking
 // editor backups to clients through an administrative import.
 if(new TextEncoder().encode(JSON.stringify(safe)).length>4_000_000)
  throw new TypeError('World manifest exceeds 4 MB; omit images and models');
 return safe;
}
export function blankWorld(id='main'){
 return validateWorld({format:WORLD_FORMAT,version:1,worldId:id,
  name:'Phoenix World',revision:1,bounds:{width:500,depth:500},
  spawn:[0,0,0],objects:[],mobs:[],prefabs:[],skills:[]});
}
