/* Phoenix Engine edit ownership for a shared world canvas.
 * View/camera modes (build, character, drone) are NOT editor ownership.
 * Only one editing domain receives touch-to-edit events at a time.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixEditorContext=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DOMAINS=Object.freeze(['construction','landscape','characters']);
 class Context{
  constructor(onChange){
   this.current='construction';
   this.onChange=typeof onChange==='function'?onChange:()=>{};
  }
  set(domain){
   if(!DOMAINS.includes(domain))throw new TypeError('Invalid editor domain');
   if(this.current===domain)return false;
   const previous=this.current;
   this.current=domain;
   this.onChange(domain,previous);
   return true;
  }
  owns(domain){return this.current===domain;}
  route(handlers){
   const handler=handlers?.[this.current];
   return typeof handler==='function'?handler():false;
  }
 }
 return Object.freeze({DOMAINS,Context});
});
