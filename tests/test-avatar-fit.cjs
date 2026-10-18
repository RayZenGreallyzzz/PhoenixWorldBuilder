const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.join(__dirname,'../app/src/main/assets/js'),THREE=global.THREE=require(path.join(dir,'three.min.js'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8')+'\nglobal.WorldBuilder=WorldBuilder');
(async()=>{
 const world=Object.create(WorldBuilder.prototype);
 world.player=new THREE.Group();world.player.position.y=.85;world.avatarHeight=1.8;
 world.avatarMixer=null;world.avatarAnimationsEnabled=true;world.assetAnimations=new Map();
 world.getAsset=async()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(30,2,10),new THREE.MeshBasicMaterial()));return g};
 const info=await world.setAvatar('wide-animal');
 assert(Math.abs(info.originalSize.width-30)<1e-9);
 assert(world.avatarModel.scale.x<.1,'Wide model should be fit to avatar footprint');
 const box=new THREE.Box3().setFromObject(world.avatarModel);
 const size=box.getSize(new THREE.Vector3());assert(size.x<=1.8*1.61,'Oversized width must be normalized');
 assert(size.y<=1.8+1e-6,'Height must fit');assert(world.toggleAvatarAnimations()===false);
 assert(world.toggleAvatarAnimations()===true);
 console.log('Wide animal/monster auto-fit + animation toggle OK');
})().catch(e=>{console.error(e);process.exit(1)});
