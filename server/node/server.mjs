/* Phoenix Server Node.js transport — same room logic as Cloudflare adapter.
 * npm install && npm start. Bind 127.0.0.1 by default; use Cloudflare
 * Tunnel or your own TLS reverse proxy for internet connections.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {WebSocketServer} from 'ws';
import {PhoenixRoom} from '../shared/room.mjs';
import {blankWorld,validateWorld} from '../shared/world.mjs';
import {validRoom} from '../shared/protocol.mjs';

const ROOT=process.env.PHOENIX_DATA_DIR||'./data';
const HOST=process.env.PHOENIX_HOST||'127.0.0.1';
const PORT=Number(process.env.PHOENIX_PORT||8787);
const MAX=Number(process.env.PHOENIX_MAX_PLAYERS||16);
const ADMIN_TOKEN=process.env.PHOENIX_ADMIN_TOKEN||'';
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)
 throw new Error('Invalid PHOENIX_PORT');
if(!Number.isInteger(MAX)||MAX<1||MAX>64)
 throw new Error('Invalid PHOENIX_MAX_PLAYERS');

const rooms=new Map();
const filename=id=>path.join(ROOT,id+'.json');
async function diskWorld(id){
 try{return validateWorld(JSON.parse(await fs.readFile(filename(id),'utf8')))}
 catch(error){
  if(error.code==='ENOENT')return blankWorld(id);
  throw error;
 }
}
async function roomFor(id){
 if(!validRoom(id))throw new TypeError('Invalid world ID');
 if(rooms.has(id))return rooms.get(id);
 const world=await diskWorld(id);
 const room=new PhoenixRoom({world,maxPlayers:MAX,
  nextId:()=>crypto.randomUUID()});
 rooms.set(id,room);return room;
}
const json=(res,status,data)=>{
 const body=JSON.stringify(data);
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(body);
};
function authorized(req){
 if(!ADMIN_TOKEN||ADMIN_TOKEN.length<24)return false;
 const supplied=req.headers.authorization||'';
 const expected='Bearer '+ADMIN_TOKEN;
 if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected))return false;
 return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
async function readJson(req){
 let bytes=0,chunks=[];
 for await(const part of req){
  bytes+=part.length;
  if(bytes>4_200_000)throw new Error('request-too-large');
  chunks.push(part);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/', 'http://localhost');
  const match=url.pathname.match(/^\/admin\/world\/([a-z][a-z0-9-]{0,39})$/);
  if(url.pathname==='/health'&&req.method==='GET'){
   return json(res,200,{ok:true,service:'Phoenix Server',
    protocol:1,mode:'self-hosted',rooms:rooms.size,
    players:[...rooms.values()].reduce((s,r)=>s+r.count(),0)});
  }
  if(match){
   if(!authorized(req))return json(res,403,{error:'Admin token required (at least 24 characters)'});
   const id=match[1],room=await roomFor(id);
   if(req.method==='GET')return json(res,200,room.world);
   if(req.method==='PUT'){
    if(room.count())return json(res,409,{error:'Disconnect players before world replacement'});
    const world=validateWorld(await readJson(req));
    if(world.worldId!==id)return json(res,400,{error:'World ID mismatch'});
    const previous=room.world;
    const result=room.replaceWorld(world);
    await fs.mkdir(ROOT,{recursive:true});
    const temp=filename(id)+'.'+crypto.randomBytes(4).toString('hex')+'.tmp';
    try{
     await fs.writeFile(temp,JSON.stringify(world,null,2),'utf8');
     await fs.rename(temp,filename(id));
    }catch(err){
     room.world=previous;await fs.rm(temp,{force:true});throw err;
    }
    return json(res,200,{ok:true,world:result});
   }
   return json(res,405,{error:'Method not allowed'});
  }
  return json(res,404,{error:'Not found'});
 }catch(err){
  json(res,err.message==='request-too-large'?413:400,
   {error:err.message||'Invalid request'});
 }
});
const wss=new WebSocketServer({noServer:true,maxPayload:2048,
 perMessageDeflate:false});
server.on('upgrade',async(req,socket,head)=>{
 try{
  const url=new URL(req.url||'/', 'http://localhost');
  const match=url.pathname.match(/^\/ws\/([a-z][a-z0-9-]{0,39})$/);
  if(!match){socket.destroy();return}
  const room=await roomFor(match[1]);
  wss.handleUpgrade(req,socket,head,ws=>{
   room.welcome(ws);
   ws.on('message',(bytes,isBinary)=>{
    if(isBinary){ws.close(1003,'JSON text only');return}
    room.handle(ws,bytes.toString('utf8'));
   });
   ws.on('close',()=>room.leave(ws));
   ws.on('error',()=>room.leave(ws));
  });
 }catch(error){
  socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  socket.destroy();
 }
});
server.listen(PORT,HOST,()=>{
 console.log('Phoenix Server ready on http://'+HOST+':'+PORT);
 console.log('WebSocket: ws://'+HOST+':'+PORT+'/ws/main');
 console.log('Admin API: /admin/world/main (PUT import / GET export)');
 if(ADMIN_TOKEN.length<24)console.warn('Admin import/export DISABLED: set PHOENIX_ADMIN_TOKEN (>=24 chars)');
});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
