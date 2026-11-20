/* Bounded memory-only edit history. Snapshots are the same v2 project
 * descriptors as normal saves: no duplicated GLB binaries or image bytes.
 */
const EditorHistory=(()=>{
 'use strict';
 class History{
  constructor(limit=20,maxBytes=4*1024*1024){
   this.limit=Math.max(1,Math.min(50,limit));
   this.maxBytes=maxBytes;this.undoStack=[];this.redoStack=[];
   this.busy=false;this.lastWarning='';
  }
  encode(doc){
   const text=JSON.stringify(doc);
   if(text.length>this.maxBytes){
    this.lastWarning='Проект слишком большой для истории действий';
    return null;
   }
   return text;
  }
  record(doc){
   if(this.busy)return false;
   const state=this.encode(doc);if(state===null)return false;
   if(this.undoStack.at(-1)===state)return false;
   this.undoStack.push(state);
   if(this.undoStack.length>this.limit)this.undoStack.shift();
   this.redoStack=[];return true;
  }
  get canUndo(){return this.undoStack.length>0}
  get canRedo(){return this.redoStack.length>0}
  clear(){if(this.busy)return;this.undoStack=[];this.redoStack=[];}
  async change(direction,current,restore){
   if(this.busy)throw Error('Другая операция восстановления ещё выполняется');
   const from=direction==='undo'?this.undoStack:this.redoStack;
   const to=direction==='undo'?this.redoStack:this.undoStack;
   if(!from.length)return false;
   const target=from.pop(),present=this.encode(current);
   if(present===null){from.push(target);throw Error(this.lastWarning)}
   this.busy=true;
   try{
    await restore(JSON.parse(target));
    to.push(present);
    if(to.length>this.limit)to.shift();
    return true;
   }catch(error){from.push(target);throw error}
   finally{this.busy=false}
  }
  undo(current,restore){return this.change('undo',current,restore)}
  redo(current,restore){return this.change('redo',current,restore)}
 }
 return History;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=EditorHistory;
