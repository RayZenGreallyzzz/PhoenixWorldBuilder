const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const dir=path.join(__dirname,'../app/src/main/assets/js');
const THREE=global.THREE=require(path.join(dir,'three.min.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
const w=Object.create(WorldBuilder.prototype);
const root=new THREE.Group();
const hips=new THREE.Bone();hips.name='mixamorig:Hips';hips.position.set(-.2697,11.52,1.586);
// Official Three.js GLTFLoader r140 sanitizes ':' to '', e.g. mixamorig:Hips => mixamorigHips.
hips.name='mixamorigHips';
const foot=new THREE.Bone();foot.name='mixamorig:LeftFoot';foot.position.set(0,36,0);
root.add(hips);hips.add(foot);
const before=new THREE.VectorKeyframeTrack(hips.uuid+'.position',[0,1],
 [-.7,-6,-90,30,11,-100]);
const limb=new THREE.VectorKeyframeTrack(foot.uuid+'.position',[0,1],
 [0,36,0,0,38,0]);
const rootless=new THREE.AnimationClip('Walk',1,[before,limb]);
assert.equal(w.lockAvatarRootMotion(rootless,[root,hips,foot]),1);
const newRoot=rootless.tracks[0];
for(let i=0;i<newRoot.values.length;i+=3){
 assert(Math.abs(newRoot.values[i]-hips.position.x)<1e-5);
 assert(Math.abs(newRoot.values[i+1]-hips.position.y)<1e-5);
 assert(Math.abs(newRoot.values[i+2]-hips.position.z)<1e-5);
}
assert.deepEqual(Array.from(rootless.tracks[1].values),Array.from(limb.values),
 'limb animation must remain unchanged');
const mixer=new THREE.AnimationMixer(root);
mixer.clipAction(rootless).play();mixer.update(.5);
assert(hips.position.distanceTo(new THREE.Vector3(-.2697,11.52,1.586))<1e-4);
assert(foot.position.y>36.5,'leg keyframes must still animate');
console.log('Mixamo root-motion lock and limb movement OK');
