/* Seven real PWB user libraries contain 1337 GLBs, of which many windows
 * have OPAQUE materials even on genuine glazing. The distributable fixed
 * library ZIP is tested separately against its actual original user files.
 * This CI test guards the app importer and real-cut logic without publishing
 * private user-owned binary models into the source repository.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
global.THREE=require(path.join(base,'js/three.min.js'));
const T=global.THREE;
const Cut=require(path.join(base,'js/wall-openings.js'));
const Build=require(path.join(base,'js/clean-geometry.js'));
const Collision=require(path.join(base,'js/character-collision.js'));
const app=fs.readFileSync(path.join(base,'js/clean-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const zip=fs.readFileSync(path.join(base,'js/zip-helper.js'),'utf8');
assert(app.includes('maxEntries:2200'),'Combined seven-pack ZIP has 1337 models');
assert(zip.includes('maxEntries=2200'),'ZIP reader must accept >1200 files');
assert(app.includes('matching.slice(0,visibleLimit)'),
 'Do not create 1337+ DOM model cards on Android');
assert(app.includes('obj?.kind?.startsWith(\'glb:\')'),
 'Imported arch frames need the existing cut assistant');
assert(app.includes('Подготовить настоящий проход под эту GLB-арку'));
assert(app.includes('Без реального выреза стена продолжает блокировать персонажа'));
assert(html.includes('id="btnCutForPrefabDoor"'));
for(const id of ['tabParts','tabTextures','tabCharacter','openingPanel',
 'textureInspector','sceneManagerPanel','btnDirectModuleZip']){
 assert(html.includes('id="'+id+'"'),'Existing tablet UI must not move: '+id);
}
const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,
 Uint32Array,DataView,Response,DecompressionStream,console,setTimeout});
vm.runInContext(zip,ctx);
(async()=>{
 const data={};
 for(let i=0;i<1337;i++)data['06_Окна/test_'+i+'.glb']=new Uint8Array([1,2,3,i%255]);
 const round=await vm.runInContext('ZipUtils.build',ctx)(data);
 const files=await vm.runInContext('ZipUtils.extract',ctx)(round);
 assert.equal(Object.keys(files).length,1337,
  'One combined ZIP with all 1337 GLBs must be accepted without artificial 1200 limit');
 const arch=new T.Group(),mat=new T.MeshStandardMaterial({side:T.DoubleSide});
 const add=(geometry,x,y,z)=>{const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);arch.add(m)};
 // A visible decorative arch has a genuine empty center.
 add(new T.BoxGeometry(.2,2.6,.22),-.9,1.3,0);
 add(new T.BoxGeometry(.2,2.6,.22),.9,1.3,0);
 add(new T.BoxGeometry(2,.35,.22),0,2.425,0);
 const wall=Build.create('wall'),solver=new Collision.Solver();
 const point=new T.Vector3(0,0,-1),move=new T.Vector3(0,0,2);
 const archEntry={root:arch,category:'wall'},solidWall={root:wall,category:'wall'};
 assert(!solver.move(point,move,[archEntry]).blocked,
  'An open arch alone must be traversable');
 assert(solver.move(point,move,[archEntry,solidWall]).blocked,
  'Arch OVER an uncut wall must block, even when decorative arch is empty');
 const result=Cut.render(wall,'wall',[{id:'arch',group:'arch',type:'passage',
  shape:'round',x:0,y:0,w:1.3,h:2.25}],{thickness:.22,axes:{x:1,y:1,z:1}});
 assert(result.ok,'Real round opening must cut structural wall');
 solver.cache=new WeakMap(); // Geometry was rebuilt at the same root transform.
 assert(!solver.move(point,move,[archEntry,solidWall]).blocked,
  'Actual cut makes the decorative GLB arch traversable without noclip');
 console.log('1337-GLB ZIP supported; catalog bounded; open arch blocked by solid wall, traversable after real cut OK');
})().catch(err=>{console.error(err);process.exitCode=1});
