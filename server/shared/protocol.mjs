/* Phoenix Server protocol v1 — shared by Node.js, Cloudflare DO and tests.
 * Never accepts arbitrary client damage, XP, inventories or world edits.
 */
export const VERSION=1;
// Capability manifest is informational: the wire protocol stays v1.
// Neither the app nor the server may infer gameplay authority from a UI flag.
export const CAPABILITIES=Object.freeze({
 guest:true,sharedPositions:true,chat:true,worldJson:true,
 accountRegistration:false,persistentCharacters:false,
 serverCombat:false,inventory:false,skillSync:false
});
export const WORLD_ID=/^[a-z][a-z0-9-]{0,39}$/;
export const MAX_MESSAGE_BYTES=2048;
const okNum=n=>typeof n==='number'&&Number.isFinite(n);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&
 value.length<=max&&!/[\x00-\x1f<>]/.test(value);
export function validRoom(id){return typeof id==='string'&&WORLD_ID.test(id)}
export function validPosition(p){
 return Array.isArray(p)&&p.length===3&&p.every(n=>okNum(n)&&Math.abs(n)<=100000);
}
export function parseMessage(data){
 const raw=typeof data==='string'?data:
  (data instanceof ArrayBuffer?new TextDecoder().decode(data):'');
 if(!raw||new TextEncoder().encode(raw).length>MAX_MESSAGE_BYTES)
  throw new TypeError('Invalid message size');
 let m;try{m=JSON.parse(raw)}catch{throw new TypeError('Invalid JSON')}
 if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.type!=='string')
  throw new TypeError('Invalid message');
 switch(m.type){
  case 'join':
   if(!text(m.name,32))throw new TypeError('Invalid nickname');
   return {type:'join',name:m.name.trim()};
  case 'move':
   if(!validPosition(m.position))throw new TypeError('Invalid position');
   return {type:'move',position:m.position.slice()};
  case 'chat':
   if(!text(m.text,180))throw new TypeError('Invalid chat');
   return {type:'chat',text:m.text.trim()};
  case 'ping':return {type:'ping'};
  default:throw new TypeError('Unsupported client message');
 }
}
export function encode(message){return JSON.stringify({v:VERSION,...message})}
export function checkWorldPosition(position,world){
 if(!validPosition(position))return false;
 const w=world?.bounds?.width||500,d=world?.bounds?.depth||500;
 return Math.abs(position[0])<=w/2&&Math.abs(position[2])<=d/2&&
  Math.abs(position[1])<=10000;
}
