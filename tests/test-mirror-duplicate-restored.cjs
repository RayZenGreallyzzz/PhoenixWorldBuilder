/* Restore BOTH mirror buttons and all original state plumbing from 1337 APK.
 * Check that mirrored duplicates preserve true wall cut-outs and source geometry.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
const T=global.THREE=require(path.join(base,'js/three.min.js'));
const G=global.CleanGeometry=require(path.join(base,'js/clean-geometry.js'));
const O=global.WallOpenings=require(path.join(base,'js/wall-openings.js'));
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const source=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const gizmo=fs.readFileSync(path.join(base,'js/builder-gizmo.js'),'utf8');
for(const id of ['quickMirrorDuplicate','btnMirrorDuplicate'])
 assert(html.includes('id="'+id+'"'),'Original mirror button missing: '+id);
assert(source.includes("$('btnMirrorDuplicate').onclick=$('quickMirrorDuplicate').onclick=()=>this.duplicate(true)"),
 'Both mirror buttons must be wired to a real action');
assert(source.includes('mirrorX:config.mirrorX===true'));
assert(source.includes('mirrorX:source.mirrorX'));
assert(source.includes('this.preview.mirrorX=data.mirrorX'));
assert(source.includes('obj.mirrorX=preset.mirrorX===true'));
assert(source.includes('...(obj.mirrorX?{mirrorX:true}:{})'));
assert(gizmo.includes('(obj.mirrorX?-1:1)*obj.scale*obj.axes.x'),
 'CAD gizmo must not destroy the mirrored X sign during resize');
const end=source.lastIndexOf("window.addEventListener('DOMContentLoaded'");
assert(end>0,'Cannot isolate app constructor for testing');
const testable=source.slice(0,end)+'return CleanBuilder;\n})();';
const context={THREE:T,CleanGeometry:G,WallOpenings:O,
 document:{getElementById(){return {textContent:'',className:''}}},
 console,setTimeout,clearTimeout};
const Builder=vm.runInNewContext(testable,context);
assert.equal(typeof Builder.prototype.duplicate,'function');
let refreshed=0,history=0;
const original=G.create('corner'),cut=[{id:'window',type:'window',
 shape:'rectangle',x:0,y:.9,w:.6,h:.8}];
assert(O.render(original,'corner',cut,{thickness:.22,axes:{x:1,y:1,z:1}}).ok);
const baseEntry={id:1,kind:'corner',category:'wall',root:original,
 rotation:{x:0,y:0,z:0},rot:0,scale:1,axes:{x:1,y:1,z:1},
 thickness:.22,openings:cut,mirrorX:false};
const editing={selected:baseEntry,entries:[baseEntry],nextId:2,
 scene:new T.Scene(),gizmo:{attach(){}},
 canEditObject(){return true;},
 encode(entry){return {id:entry.id,kind:entry.kind,category:entry.category,
 position:entry.root.position.toArray(),rotation:{...entry.rotation},
 rot:entry.rot,scale:entry.scale,axes:{...entry.axes},thickness:entry.thickness,
 openings:entry.openings,mirrorX:entry.mirrorX};},
 createEntry(kind,data){
  const root=G.create(kind);
  if(data.openings?.length)
   assert(O.render(root,kind,data.openings,
    {thickness:data.thickness,axes:data.axes}).ok);
  root.position.fromArray(data.position);
  const entry={...data,kind,root,id:this.nextId++};
  Builder.prototype.applyTransform.call(this,entry);
  return entry;
 },
 recordEdit(){history++;},attachImportedLOD(){},
 queueDecalRebuild(){refreshed++;},
 setTool(){},syncInspector(){}};
editing.scene.add(original);
Builder.prototype.duplicate.call(editing,true);
const clone=editing.selected;
assert.notStrictEqual(clone.root,original,'Should never mirror original mesh');
assert.equal(original.scale.x,1,'Original must remain unchanged');
assert.equal(clone.mirrorX,true);
assert(clone.root.scale.x<0,'Duplicate must be physically mirrored');
assert.equal(clone.openings.length,1,'Window cut data must survive mirror');
assert(clone.root.getObjectByName('structure:wall')?.geometry?.attributes?.position,
 'Window opening must be physically cut on the mirrored duplicate');
assert(clone.root.position.x>0,'Mirrored copy must be positioned beside original');
assert.equal(history,1);
assert.equal(refreshed,1,'Transparent graffiti overlays must be refreshed');
Builder.prototype.duplicate.call(editing,true);
assert.equal(editing.selected.mirrorX,false,
 'A second mirror should toggle original X sign back');
assert(editing.selected.root.scale.x>0);
console.log('Two original Mirror Duplicate buttons, GLB/corner mirroring, project state, CAD gizmo, saved openings and decals OK');
