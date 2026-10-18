const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base=path.join(__dirname,'../app/src/main/assets/js');
global.THREE=require(path.join(base,'three.min.js'));
for(const filename of ['GLTFLoader.js','SkeletonUtils.js','glb-loader.js'])vm.runInThisContext(fs.readFileSync(path.join(base,filename),'utf8'),{filename});
function makeGLB(){
 const coords=new Float32Array([0,0,0,1,0,0,0,1,0]),times=new Float32Array([0,1]),translations=new Float32Array([0,0,0,0,1,0]);
 const buf=Buffer.alloc(12+8+24+8+coords.byteLength+times.byteLength+translations.byteLength+32);
 const binary=Buffer.concat([Buffer.from(coords.buffer),Buffer.from(times.buffer),Buffer.from(translations.buffer)]);
 const json={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:coords.byteLength},{buffer:0,byteOffset:coords.byteLength,byteLength:times.byteLength},{buffer:0,byteOffset:coords.byteLength+times.byteLength,byteLength:translations.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:2,componentType:5126,count:2,type:'VEC3'}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{name:'AvatarNode',mesh:0}],scenes:[{nodes:[0]}],scene:0,animations:[{name:'Idle',samplers:[{input:1,output:2,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]};
 const jsonBuf=Buffer.from(JSON.stringify(json));const jsonPadded=Buffer.alloc(Math.ceil(jsonBuf.length/4)*4,0x20);jsonBuf.copy(jsonPadded);
 const binPadded=Buffer.alloc(Math.ceil(binary.length/4)*4);binary.copy(binPadded);
 const out=Buffer.alloc(12+8+jsonPadded.length+8+binPadded.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonPadded.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonPadded.copy(out,20);
 const off=20+jsonPadded.length;out.writeUInt32LE(binPadded.length,off);out.writeUInt32LE(0x004e4942,off+4);binPadded.copy(out,off+8);return out;
}
(async()=>{
 const bytes=makeGLB();
 const r=await GLB.load(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.length));
 assert(r.root,'No model root');assert.equal(r.animations.length,1);
 const clone=THREE.SkeletonUtils.clone(r.root);const mixer=new THREE.AnimationMixer(clone);
 const action=mixer.clipAction(r.animations[0]);action.play();mixer.update(.5);
 const node=clone.getObjectByName('AvatarNode');assert(node&&node.position.y>.4,'Animation did not play');
 const sub=new Uint8Array(bytes.length+19);sub.set(bytes,7);
 const sliced=await GLB.load(sub.subarray(7,7+bytes.length));assert.equal(sliced.animations.length,1,'Typed array offset broken');
 console.log('GLB Uint8Array, animation playback and clone OK');
})().catch(e=>{console.error(e);process.exit(1)});
