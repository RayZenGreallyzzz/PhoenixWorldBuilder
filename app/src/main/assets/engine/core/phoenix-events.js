/* Phoenix Engine — declarative events 0.1. Platform-neutral.
 * Online game server must authenticate actions before emitting trusted events.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixEvents=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const NAME=/^[a-z][a-z0-9._:-]{0,63}$/;
 const IDENT=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
 const SCOPES=Object.freeze(['player','party','instance','server']);
 function clone(value){
  const ancestors=new Set();
  function walk(v,depth){
   if(depth>20)throw new TypeError('Event data too deep');
   if(v===null||typeof v==='string'||typeof v==='boolean')return v;
   if(typeof v==='number'&&Number.isFinite(v))return v;
   if(!v||typeof v!=='object'||ancestors.has(v))throw new TypeError('Invalid event data');
   if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&
      Object.getPrototypeOf(v)!==null)throw new TypeError('Event data must be plain JSON');
   ancestors.add(v);
   const out=Array.isArray(v)?v.map(x=>walk(x,depth+1)):{};
   if(!Array.isArray(v))for(const k of Object.keys(v)){
    if(['__proto__','prototype','constructor'].includes(k))throw new TypeError('Unsafe event field');
    out[k]=walk(v[k],depth+1);
   }
   ancestors.delete(v);return out;
  }
  return walk(value,0);
 }
 function event(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Invalid game event');
  if(typeof raw.type!=='string'||!NAME.test(raw.type))throw new TypeError('Invalid event type');
  if(typeof raw.id!=='string'||!IDENT.test(raw.id))throw new TypeError('Invalid event id');
  if(typeof raw.actorId!=='string'||!IDENT.test(raw.actorId))throw new TypeError('Invalid actor id');
  const scope=raw.scope??'player';
  if(!SCOPES.includes(scope))throw new TypeError('Invalid event scope');
  const data=clone(raw.data??{});
  if(!data||Array.isArray(data)||typeof data!=='object')throw new TypeError('Event data must be object');
  return {type:raw.type,id:raw.id,actorId:raw.actorId,scope,data};
 }
 class Hub{
  constructor(){this.handlers=new Map()}
  subscribe(type,fn){
   if(type!=='*'&&!NAME.test(type))throw new TypeError('Invalid subscription type');
   if(typeof fn!=='function')throw new TypeError('Handler required');
   let set=this.handlers.get(type);
   if(!set){set=new Set();this.handlers.set(type,set)}
   set.add(fn);
   return ()=>{set.delete(fn);if(!set.size)this.handlers.delete(type)};
  }
  emit(raw){
   const value=event(raw);
   const listeners=[...(this.handlers.get(value.type)||[]),...(this.handlers.get('*')||[])];
   for(const handler of listeners)handler(clone(value));
   return listeners.length;
  }
  clear(){this.handlers.clear()}
 }
 return Object.freeze({SCOPES,event,Hub});
});
