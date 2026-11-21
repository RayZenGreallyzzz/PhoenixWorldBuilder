'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets');
const source=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const mobs=fs.readFileSync(path.join(base,'engine/builder/prefab-editor.js'),'utf8');
const skills=fs.readFileSync(path.join(base,'engine/builder/skill-definition-editor.js'),'utf8');
const css=fs.readFileSync(path.join(base,'clean.css'),'utf8');
const i=source.indexOf(' markProjectDirty(){');
const j=source.indexOf(' recordEdit(snapshot){',i);
const a=source.indexOf(' save(){');
const b=source.indexOf(' async load(){',a);
assert(i>=0&&j>i&&a>0&&b>a,'Manual-save methods must exist');
let nativeWrites=0,localWrites=0,warnings=0;
const button={classes:new Set(),title:'',classList:{
 add(v){button.classes.add(v)},remove(v){button.classes.delete(v)}}};
const document={getElementById:id=>id==='btnSave'?button:null};
const window={NativeBridge:{saveCleanProject(json){
 nativeWrites++;return typeof json==='string'&&json.includes('phoenixGame');
}}};
const localStorage={setItem(key,value){
 assert.equal(key,'phoenix-builder-clean-v2');
 assert.equal(typeof value,'string');
 localWrites++;
}};
const notify=()=>{warnings++};
const Harness=new Function('document','window','localStorage','notify',
 'return class Harness { '+source.slice(i,j)+source.slice(a,b)+
 ' project(){return {version:2,objects:[],phoenixGame:{version:1}};} }')(
 document,window,localStorage,notify);
const h=new Harness();
h.restoringProject=false;h.projectLoadRunning=false;
h.markProjectDirty();
h.markProjectDirty();
assert.equal(h.projectDirty,true);
assert(button.classes.has('phoenixUnsaved'));
assert.equal(nativeWrites,0,'Dirty marker may not persist project');
assert.equal(localWrites,0,'Dirty marker may not use localStorage');
assert.equal(h.save(),true,'Manual save still succeeds');
assert.equal(nativeWrites,1);
assert.equal(localWrites,1);
assert.equal(h.projectDirty,false);
assert(!button.classes.has('phoenixUnsaved'));
h.markProjectDirty();
assert.equal(h.projectDirty,true);
h.restoringProject=true;h.projectDirty=false;
h.markProjectDirty();
assert.equal(h.projectDirty,false,'No dirty flag during project restore');
h.restoringProject=false;
assert(!mobs.includes('this.b.save()'),
 'Mob changes must never persist whole project automatically');
assert(mobs.includes('this.b.markProjectDirty?.()'));
assert(!skills.includes('this.b.save?.()'),
 'Skill definition changes must never write full project automatically');
assert(skills.includes('this.b.markProjectDirty?.()'));
assert(source.includes("$('btnSave').onclick=()=>this.save()"),
 'Manual save button must be wired');
assert(css.includes('#btnSave.phoenixUnsaved'),
 'Unsaved indicator must be visible');
console.log('PASS: manual saves only, no edit-time native/localStorage writes, visible dirty state');
