/* Phoenix Weather runtime — single existing WebGL scene and RAF.
 * All effects are visual; no collisions, character prefabs or map geometry
 * are authored or moved by the weather system.
 */
(function(root,factory){
 'use strict';const API=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=API;
 if(root)root.PhoenixWeatherRuntime=API;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const COUNTS={
  lite:{rain:100,snow:75,cloud:5,fog:3,stars:32,trees:18},
  balanced:{rain:270,snow:165,cloud:10,fog:6,stars:65,trees:48},
  ultra:{rain:520,snow:290,cloud:16,fog:10,stars:96,trees:92}
 };
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const foliage=/tree|pine|oak|birch|willow|spruce|forest|дерево|сосн|елк|ёлк|берез|берёз|листва|пальм/i;
 const uniforms={}; // private state is per material, never saved in project.
 class Runtime{
  constructor(builder,THREE){
   this.b=builder;this.T=THREE;this.settings=PhoenixWeather.defaults();
   this.sim=new PhoenixWeather.Simulator(this.settings);
   this.initial={background:builder.scene.background,
    fog:builder.scene.fog,exposure:builder.renderer.toneMappingExposure,
    sunlight:builder.scene.children.find(x=>x.isDirectionalLight)||null,
    ambient:builder.scene.children.find(x=>x.isHemisphereLight)||null,
    ground:builder.ground?.material?.color?.clone?.()||null};
   this.sunIntensity=this.initial.sunlight?.intensity??1;
   this.sunColor=this.initial.sunlight?.color?.clone?.()||null;
   this.sunPosition=this.initial.sunlight?.position?.clone?.()||null;
   this.ambientIntensity=this.initial.ambient?.intensity??1;
   this.clouds=[];this.fogWisps=[];this.effectRoot=null;
   this.rain=null;this.snow=null;this.sky=null;this.flashLight=null;
   this.stars=null;this.windMaterials=new Map();
   this.windUniforms=[];this.windSync=0;
   this.time=0;this.last=null;this.audio=null;
   this.cameraColor=new THREE.Color();
  }
  cloudTexture(){
   const doc=this.b.canvas?.ownerDocument||globalThis.document;
   const canvas=doc?.createElement?.('canvas');
   if(!canvas)return null;
   canvas.width=canvas.height=128;const cx=canvas.getContext('2d');
   if(!cx)return null;
   cx.clearRect(0,0,128,128);
   for(let i=0;i<17;i++){
    const x=24+(i*31%82),y=38+(i*19%50),r=16+(i%5)*5;
    const g=cx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,.24)');
    g.addColorStop(.65,'rgba(255,255,255,.11)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    cx.fillStyle=g;cx.fillRect(x-r,y-r,r*2,r*2);
   }
   const texture=new this.T.CanvasTexture(canvas);texture.needsUpdate=true;
   return texture;
  }
  particleTexture(snow){
   const doc=this.b.canvas?.ownerDocument||globalThis.document;
   const canvas=doc?.createElement?.('canvas');
   if(!canvas)return null;
   canvas.width=32;canvas.height=32;const cx=canvas.getContext('2d');
   if(!cx)return null;
   const grad=cx.createRadialGradient(16,16,1,16,16,snow?14:10);
   grad.addColorStop(0,'rgba(255,255,255,1)');
   grad.addColorStop(snow?.4:.22,'rgba(255,255,255,.87)');
   grad.addColorStop(1,'rgba(255,255,255,0)');
   cx.fillStyle=grad;cx.fillRect(0,0,32,32);
   const t=new this.T.CanvasTexture(canvas);t.needsUpdate=true;
   return t;
  }
  createParticles(count,kind){
   const T=this.T;
   const arr=new Float32Array(count*3);
   const velocities=new Float32Array(count);
   for(let i=0;i<count;i++){
    arr[i*3]=(Math.random()-.5)*36;
    arr[i*3+1]=Math.random()*34-18;
    arr[i*3+2]=(Math.random()-.5)*36;
    velocities[i]=kind==='snow'?(.65+Math.random()*1.2):(13+Math.random()*13);
   }
   const geo=new T.BufferGeometry();
   const attr=new T.BufferAttribute(arr,3);if(attr.setUsage)attr.setUsage(T.DynamicDrawUsage);
   geo.setAttribute('position',attr);
   const texture=this.particleTexture(kind==='snow');
   const mat=new T.PointsMaterial({
    color:kind==='snow'?0xf4faff:0xc3dbf1,
    size:kind==='snow'?.33:.13,transparent:true,opacity:.87,
    depthWrite:false,depthTest:true,alphaTest:.03,
    map:texture||null,blending:T.NormalBlending
   });
   const points=new T.Points(geo,mat);
   points.frustumCulled=false;points.visible=false;
   this.effectRoot.add(points);
   return {points,arr,velocities,texture,kind};
  }
  ensure(){
   if(this.effectRoot)return;
   const T=this.T,root=new T.Group();
   root.name='phoenix:weather:visual-only';this.effectRoot=root;
   this.b.scene.add(root);
   const shader=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,depthTest:false,fog:false,
    uniforms:{topColor:{value:new T.Color('#699dc8')},
     horizonColor:{value:new T.Color('#d4e0df')},
     bottomColor:{value:new T.Color('#7e9eae')}},
    vertexShader:`varying vec3 vSkyDirection;
    void main(){vSkyDirection=normalize(position);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vSkyDirection;
    uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;
    void main(){float y=normalize(vSkyDirection).y;
    vec3 c=mix(horizonColor,topColor,smoothstep(0.0,.9,y));
    c=mix(bottomColor,c,smoothstep(-.23,.09,y));
    gl_FragColor=vec4(c,1.0);}`
   });
   this.sky=new T.Mesh(new T.SphereGeometry(1,20,12),shader);
   this.sky.name='phoenix:weather:sky';
   this.sky.renderOrder=-120;this.sky.frustumCulled=false;
   root.add(this.sky);
   this.cloudRoot=new T.Group();
   this.cloudRoot.name='phoenix:weather:clouds';
   root.add(this.cloudRoot);
   const cloudMap=this.cloudTexture();
   this.cloudMap=cloudMap;
   const cloudMaterial=new T.SpriteMaterial({map:cloudMap||null,
    color:0xffffff,transparent:true,opacity:0,depthWrite:false,fog:false});
   for(let i=0;i<COUNTS.ultra.cloud;i++){
    const sprite=new T.Sprite(cloudMaterial.clone());
    sprite.position.set((Math.random()-.5)*150,35+Math.random()*30,
     (Math.random()-.5)*150);
    const sx=22+Math.random()*26;
    sprite.scale.set(sx,sx*.44,1);
    this.cloudRoot.add(sprite);
    this.clouds.push({sprite,speed:.65+Math.random()*1.8});
   }
   const fogMap=this.particleTexture(true);this.fogMap=fogMap;
   for(let i=0;i<COUNTS.ultra.fog;i++){
    const mat=new T.SpriteMaterial({map:fogMap||null,color:0xc5d4d6,
     transparent:true,opacity:0,depthWrite:false,fog:false});
    const sprite=new T.Sprite(mat);
    sprite.position.set((Math.random()-.5)*48,-3+Math.random()*5,
     (Math.random()-.5)*48);
    sprite.scale.set(22+Math.random()*24,12+Math.random()*12,1);
    root.add(sprite);this.fogWisps.push({sprite,speed:.08+Math.random()*.26});
   }
   this.rain=this.createParticles(COUNTS.ultra.rain,'rain');
   this.snow=this.createParticles(COUNTS.ultra.snow,'snow');
   const positions=new Float32Array(COUNTS.ultra.stars*3);
   for(let i=0;i<COUNTS.ultra.stars;i++){
    const phi=Math.random()*Math.PI*2, elevation=.24+Math.random()*1.22;
    positions[i*3]=Math.cos(phi)*Math.cos(elevation)*140;
    positions[i*3+1]=Math.sin(elevation)*140;
    positions[i*3+2]=Math.sin(phi)*Math.cos(elevation)*140;
   }
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.BufferAttribute(positions,3));
   this.stars=new T.Points(geometry,new T.PointsMaterial({
    color:0xfff7dc,size:.65,transparent:true,opacity:0,
    depthWrite:false,fog:false}));
   this.stars.frustumCulled=false;root.add(this.stars);
   this.flashLight=new T.PointLight(0xe8f2ff,0,210,1.4);
   root.add(this.flashLight);
  }
  setSettings(raw){
   this.settings=PhoenixWeather.normalize(raw);
   this.sim.setSettings(this.settings);
   if(!this.settings.enabled)this.restoreEnvironment();
   else this.ensure();
   return this.settings;
  }
  restoreEnvironment(){
   const b=this.b;
   b.scene.background=this.initial.background;
   b.scene.fog=this.initial.fog;
   b.renderer.toneMappingExposure=this.initial.exposure;
   if(this.initial.sunlight){
    this.initial.sunlight.intensity=this.sunIntensity;
    if(this.sunPosition)this.initial.sunlight.position.copy(this.sunPosition);
    if(this.sunColor)this.initial.sunlight.color.copy(this.sunColor);
   }
   if(this.initial.ambient)this.initial.ambient.intensity=this.ambientIntensity;
   if(this.initial.ground&&b.ground?.material?.color)
    b.ground.material.color.copy(this.initial.ground);
   if(this.effectRoot)this.effectRoot.visible=false;
   this.restoreWind();
  }
  candidateTree(e){
   if(!e||!e.root||!e.root.traverse)return false;
   const meta=this.b.catalogMeta?.get?.(e.kind);
   const label=[e.kind,e.label,meta?.name,e.root.name].join(' ');
   return foliage.test(label);
  }
  setWindMaterial(mesh){
   if(this.windMaterials.has(mesh))return;
   if(mesh.isSkinnedMesh)return;
   const original=mesh.material;
   if(!original)return;
   const make=(material)=>{
    if(!material?.clone||!material.isMaterial)return material;
    const cloned=material.clone();
    const previous=cloned.onBeforeCompile;
    const state={time:{value:0},strength:{value:0}};
    cloned.onBeforeCompile=(shader,renderer)=>{
     if(typeof previous==='function')previous(shader,renderer);
     shader.uniforms.phoenixWindTime=state.time;
     shader.uniforms.phoenixWindStrength=state.strength;
     shader.vertexShader='uniform float phoenixWindTime; uniform float phoenixWindStrength;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float phoenixLeaf = smoothstep(0.0, 3.5, position.y);
       float phoenixGust=sin(phoenixWindTime*1.7+position.x*.42+position.z*.27);
       transformed.x += phoenixWindStrength*phoenixLeaf*phoenixGust*.18;
       transformed.z += phoenixWindStrength*phoenixLeaf*
        sin(phoenixWindTime*1.1+position.z*.31)*.09;`);
    };
    cloned.needsUpdate=true;
    this.windUniforms.push(state);return cloned;
   };
   if(Array.isArray(original))mesh.material=original.map(make);
   else mesh.material=make(original);
   this.windMaterials.set(mesh,{original,modified:mesh.material});
  }
  restoreWind(){
   for(const [mesh,{original,modified}] of this.windMaterials){
    if(mesh.material===modified){
     mesh.material=original;
     for(const mat of Array.isArray(modified)?modified:[modified]){
      if(mat&&mat!==original)mat.dispose?.();
     }
    }
   }
   this.windMaterials.clear();this.windUniforms=[];
  }
  syncWind(){
   if(!this.settings.swayTrees){this.restoreWind();return}
   if(!this.windUniforms)this.windUniforms=[];
   const limit=COUNTS[this.settings.quality].trees;
   let count=this.windMaterials.size;
   for(const entry of this.b.entries||[]){
    if(count>=limit)break;
    if(!this.candidateTree(entry))continue;
    entry.root.traverse(obj=>{
     if(count>=limit)return;
     if(obj.isMesh&&!obj.isSkinnedMesh&&!this.windMaterials.has(obj)){
      this.setWindMaterial(obj);count++;
     }
    });
   }
   for(const [mesh] of this.windMaterials){
    if(!mesh.parent){const old=this.windMaterials.get(mesh);
     mesh.material=old.original;this.windMaterials.delete(mesh)}
   }
  }
  updateParticles(state,pack,dt,visible,cap){
   if(!pack)return;
   const obj=pack.points;
   obj.visible=visible>.03;
   if(!obj.visible)return;
   const count=Math.min(cap,pack.velocities.length);
   obj.geometry.setDrawRange(0,count);
   obj.material.opacity=clamp(visible,0,1);
   obj.position.copy(this.b.camera.position);
   const direction=state.windDirection*Math.PI/180;
   const dx=Math.cos(direction)*state.windSpeed*dt;
   const dz=Math.sin(direction)*state.windSpeed*dt;
   const a=pack.arr;
   for(let i=0;i<count;i++){
    const off=i*3,rate=pack.velocities[i];
    a[off]+=dx*(pack.kind==='snow'?2.5:4);
    a[off+2]+=dz*(pack.kind==='snow'?2.5:4);
    a[off+1]-=rate*dt;
    if(a[off+1]<-18||Math.abs(a[off])>20||Math.abs(a[off+2])>20){
     a[off]=(Math.random()-.5)*36;
     a[off+1]=16+Math.random()*10;
     a[off+2]=(Math.random()-.5)*36;
    }
    if(pack.kind==='snow')a[off]+=.015*Math.sin(this.time*1.7+i)*dt*60;
   }
   obj.geometry.attributes.position.needsUpdate=true;
  }
  shade(state){
   const T=this.T,day=state.timeOfDay;
   const solar=Math.sin((day-6)/24*Math.PI*2);
   const light=clamp((solar+.15)/.9,0,1);
   const dusk=clamp(1-Math.abs(solar)*3,0,1);
   const cloud=state.cloud,fog=state.fog;
   const skyTop=new T.Color('#051126').lerp(new T.Color('#508fd5'),light);
   const horizon=new T.Color('#111c35').lerp(new T.Color('#b6dbe7'),light);
   horizon.lerp(new T.Color('#ff9a56'),dusk*light*.66);
   skyTop.lerp(new T.Color('#505d6f'),cloud*.56);
   horizon.lerp(new T.Color('#7f8996'),cloud*.59);
   const bottom=horizon.clone().lerp(new T.Color('#536870'),.42);
   this.sky.material.uniforms.topColor.value.copy(skyTop);
   this.sky.material.uniforms.horizonColor.value.copy(horizon);
   this.sky.material.uniforms.bottomColor.value.copy(bottom);
   const groundColor=bottom.clone().lerp(horizon,.48);
   this.b.scene.background=groundColor;
   // Fog density and clear distance transition gradually every frame.
   const near=Math.max(8,140-fog*113-cloud*24);
   const far=Math.max(near+20,420-fog*361-cloud*65);
   if(!this.weatherFog)this.weatherFog=new T.Fog(groundColor.clone(),near,far);
   this.weatherFog.color.copy(groundColor);
   this.weatherFog.near=near;this.weatherFog.far=far;
   this.b.scene.fog=this.weatherFog;
   const sun=this.initial.sunlight;
   if(sun){
    sun.intensity=this.sunIntensity*(.17+light*.88)*(1-cloud*.56)+state.flash*1.3;
    sun.color.set('#ffe7c2').lerp(new T.Color('#e7f1ff'),light*.86);
    sun.position.set(Math.cos((day-6)/24*Math.PI*2)*66,
     12+solar*66,Math.sin((day-6)/24*Math.PI*2)*66);
   }
   const ambient=this.initial.ambient;
   if(ambient)ambient.intensity=this.ambientIntensity*(.22+light*.79)+state.flash*.23;
   this.b.renderer.toneMappingExposure=this.initial.exposure*(.6+light*.38+state.flash*.22);
   const surface=this.b.ground?.material?.color;
   if(surface&&this.initial.ground){
    surface.copy(this.initial.ground);
    if(state.snow>.15)surface.lerp(new T.Color('#e8edf2'),state.snow*.52);
   }
   this.stars.material.opacity=clamp((.31-light)*2.6,0,.8);
   this.stars.visible=this.stars.material.opacity>.02;
   this.flashLight.intensity=state.flash*18;
   this.flashLight.position.copy(this.b.camera.position);
   this.flashLight.position.y+=17;
   return {light,solar};
  }
  update(dt){
   if(!Number.isFinite(dt)||dt<=0)return;
   if(!this.settings.enabled){
    if(this.effectRoot?.visible)this.restoreEnvironment();
    return;
   }
   this.ensure();this.effectRoot.visible=true;
   this.time+=dt;
   const state=this.sim.step(dt);this.last=state;
   this.shade(state);
   const cam=this.b.camera,angle=state.windDirection*Math.PI/180;
   this.sky.position.copy(cam.position);
   this.sky.scale.setScalar(clamp(cam.far*.74,60,1800));
   this.stars.position.copy(cam.position);
   const cloudsCap=COUNTS[state.quality].cloud;
   this.cloudRoot.position.copy(cam.position);
   for(let i=0;i<this.clouds.length;i++){
    const {sprite,speed}=this.clouds[i];
    sprite.visible=i<cloudsCap&&state.cloud>.025;
    if(!sprite.visible)continue;
    sprite.position.x+=Math.cos(angle)*state.windSpeed*dt*speed*3;
    sprite.position.z+=Math.sin(angle)*state.windSpeed*dt*speed*3;
    if(Math.abs(sprite.position.x)>88)sprite.position.x*=-.93;
    if(Math.abs(sprite.position.z)>88)sprite.position.z*=-.93;
    sprite.material.opacity=state.cloud*.52;
    sprite.position.y=45+(i%4)*9;
   }
   const fogCap=COUNTS[state.quality].fog;
   for(let i=0;i<this.fogWisps.length;i++){
    const {sprite,speed}=this.fogWisps[i];
    sprite.visible=i<fogCap&&state.fog>.05;
    if(!sprite.visible)continue;
    sprite.position.set(
     cam.position.x+Math.sin(this.time*speed+i*3)*19,
     cam.position.y-6+(i%4)*2,
     cam.position.z+Math.cos(this.time*speed*.75+i*2)*19);
    sprite.material.opacity=state.fog*.12;
   }
   this.updateParticles(state,this.rain,dt,state.rain,COUNTS[state.quality].rain);
   this.updateParticles(state,this.snow,dt,state.snow,COUNTS[state.quality].snow);
   this.windSync+=dt;
   if(this.windSync>1.7){this.windSync=0;this.syncWind()}
   for(const row of this.windUniforms||[]){
    row.time.value=this.time;
    row.strength.value=state.windSpeed*this.settings.intensity;
   }
   if(state.lightning&&this.onLightning)this.onLightning(state);
  }
  dispose(){
   this.restoreEnvironment();
   if(!this.effectRoot)return;
   this.effectRoot.traverse(obj=>{
    obj.geometry?.dispose?.();
    if(obj.material){
     const mats=Array.isArray(obj.material)?obj.material:[obj.material];
     for(const mat of mats){
      if(mat.map&&mat.map!==this.cloudMap&&mat.map!==this.fogMap)
       mat.map.dispose?.();
      mat.dispose?.();
     }
    }
   });
   this.cloudMap?.dispose?.();this.fogMap?.dispose?.();
   this.b.scene.remove(this.effectRoot);this.effectRoot=null;
   this.clouds=[];this.fogWisps=[];
  }
 }
 return Runtime;
});
