/* Phoenix Engine 1.4: one shared world canvas, opt-in grid and InstancedMesh
 * terrain tile painting. Tile geometry is sparse until explicitly painted.
 * 10,000 sectors -> at most 6 GPU draw calls, not 10,000 separate meshes.
 */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.PhoenixWorldEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class WorldEditor{
  constructor(builder,doc){
   if(!builder?.ground||!builder.scene||!globalThis.PhoenixWorldLayout)
    throw Error('World editor requires a scene and layout schema');
   this.b=builder;this.doc=doc||document;this.schema=globalThis.PhoenixWorldLayout;
   this.panel=this.el('phoenixWorldPanel');
   if(!this.panel)throw Error('World settings panel missing');
   this.state=this.schema.plain();this.gridVisible=false;
   this.splat=globalThis.PhoenixTerrainSplat;
   if(!this.splat)throw Error('Landscape splat masks module missing');
   this.painter=new this.splat.Painter(this.state,this.state.paintMasks);
   this.textureId='';this.textureMaps=new Map();this.texturePromises=new Map();
   this.textureMeshes=new Map();this.textureGeneration=0;
   this.painting=false;this.paintMode='place';
   this.currentStyle='grass';this.selectedCell='';
   this.terrainRoot=new THREE.Group();this.terrainRoot.name='phoenix:landscape';
   builder.scene.add(this.terrainRoot);
   this.brushIndicator=this.createBrushIndicator();
   this.indicatorPoint=null;
   this.tileGeometry=new THREE.PlaneGeometry(1,1);
   this.tileGeometry.rotateX(-Math.PI/2);
   this.materials=new Map(Object.entries(this.schema.STYLES).map(([name,meta])=>
    [name,new THREE.MeshStandardMaterial({
     color:meta.color,roughness:1,side:THREE.DoubleSide
    })]));
   this.instanced=new Map();this.grid=null;
   this.patchSize=50;this.patchSegments=10;
   this.flatPatches=new Map();this.sculptPatches=new Map();
   this.materials.set('_default',new THREE.MeshStandardMaterial({
    color:0x657e64,roughness:1,side:THREE.DoubleSide
   }));
   this.heightLookup=new Map();
   // Reuse Builder's collision solver for joystick movement over hills
   // rather than introducing a second Android physics/render loop.
   if(builder.collisionSolver)
    builder.collisionSolver.groundY=(x,z)=>this.heightAt(x,z);
   this.stroke=null;this.strokeChanged=false;this.lastPointerAt=0;
   this.bind();this.applyScene();this.renderForm();this.updateStatus();
  }
  el(id){return this.doc.getElementById(id)}
  textureBrushRadius(){
   const radius=Number(this.el('worldTextureRadius')?.value||10);
   return Number.isFinite(radius)?Math.max(.2,Math.min(50,radius)):10;
  }
  formatBrushSize(metres){
   return metres<1?Math.round(metres*100)+' см':
    Number(metres.toFixed(1))+' м';
  }
  currentBrushRadius(){
   return this.paintMode==='texture'||this.paintMode==='texture-erase'?
    this.textureBrushRadius():Number(this.el('worldBrushRadius')?.value||25);
  }
  setTextureBrushRadius(radius,persist=true){
   const number=Number(radius);
   if(!Number.isFinite(number))return false;
   const value=Math.round(Math.max(.2,Math.min(50,number))*10)/10;
   const input=this.el('worldTextureRadius');
   if(input)input.value=String(value);
   const label=this.el('worldTextureRadiusValue');
   if(label)label.textContent=this.formatBrushSize(value)+' радиус · '+
    this.formatBrushSize(value*2)+' диаметр';
   for(const button of this.doc.querySelectorAll?.('[data-texture-brush-radius]')||[]){
    const active=Number(button.getAttribute?.('data-texture-brush-radius'))===value;
    button.classList?.toggle('active',active);
    button.setAttribute?.('aria-pressed',String(active));
   }
   if(persist&&typeof localStorage!=='undefined'){
    try{localStorage.setItem('phoenix-terrain-texture-radius',String(value))}
    catch(error){/* browser storage may be disabled */}
   }
   if(this.brushIndicator?.visible&&this.indicatorPoint)
    this.showBrushIndicator(this.indicatorPoint.x,this.indicatorPoint.z);
   return value;
  }
  createBrushIndicator(){
   // A tiny, reusable 64-segment outline. It follows heightfield vertices,
   // uses no new textures and does not interfere with touch raycasting.
   const geometry=new THREE.BufferGeometry();
   const attribute=new THREE.BufferAttribute(new Float32Array(64*6*3),3);
   attribute.setUsage?.(THREE.DynamicDrawUsage);
   geometry.setAttribute('position',attribute);
   const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    color:0x5bffdc,transparent:true,opacity:.86,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide
   }));
   mesh.name='phoenix:terrain:brush-outline';
   mesh.renderOrder=1200;mesh.frustumCulled=false;mesh.visible=false;
   this.terrainRoot.add(mesh);
   return mesh;
  }
  showBrushIndicator(x,z){
   if(!this.painting||!Number.isFinite(x)||!Number.isFinite(z))return false;
   const radius=Math.max(.2,this.currentBrushRadius());
   const thickness=Math.max(.025,Math.min(1.2,radius*.03));
   const inner=Math.max(.08,radius-thickness*.5);
   const outer=radius+thickness*.5;
   const attr=this.brushIndicator.geometry.getAttribute('position');
   const points=[];
   for(let i=0;i<64;i++){
    const angle=i*Math.PI/32,next=(i+1)*Math.PI/32;
    const point=(r,a)=>{
     const xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
     return [xx,this.heightAt(xx,zz)+.075,zz];
    };
    const a=point(inner,angle),b=point(outer,angle),
     c=point(inner,next),d=point(outer,next);
    points.push(a,b,c,c,b,d);
   }
   let offset=0;
   for(const p of points){attr.setXYZ(offset++,p[0],p[1],p[2]);}
   attr.needsUpdate=true;
   this.brushIndicator.geometry.computeBoundingSphere();
   this.brushIndicator.visible=true;
   this.indicatorPoint={x,z};
   return true;
  }
  hideBrushIndicator(){
   if(this.brushIndicator)this.brushIndicator.visible=false;
   this.indicatorPoint=null;
  }
  notify(message,type='neutral'){
   const status=this.el('worldCanvasStatus');if(status)status.textContent=message;
   const main=this.el('status');if(main)main.textContent=message;
  }
  bind(){
   const on=(id,fn)=>this.el(id)?.addEventListener('click',fn);
   on('btnPhoenixWorld',()=>this.open());
   on('btnWorldClose',()=>this.close());
   on('btnWorldGrid',()=>this.toggleGrid());
   on('btnWorldApply',()=>this.applySizes());
   on('btnWorldOverview',()=>this.overview());
   on('btnWorldPaint',()=>this.startPainting(false));
   on('btnWorldOpenTextures',()=>this.openTextureFolder());
   on('btnWorldImportTexture',()=>this.el('importLandscapeTexture')?.click());
   on('btnWorldTexturePaint',()=>this.startTexturePaint(false));
   on('btnWorldTextureErase',()=>this.startTexturePaint(true));
   on('btnWorldErase',()=>this.startPainting(true));
   on('btnWorldStopPaint',()=>this.stopPainting());
   on('btnWorldClear',()=>this.clear());
   on('btnWorldFill',()=>this.fill());
   on('btnWorldRaise',()=>this.startSculpt('raise'));
   on('btnWorldLower',()=>this.startSculpt('lower'));
   on('btnWorldSmooth',()=>this.startSculpt('smooth'));
   on('btnWorldClearHeights',()=>this.clearHeights());
   const catalog=this.el('btnCatalogLandscape');
   if(catalog)catalog.onclick=event=>{
    event?.preventDefault?.();this.openTextureFolder();return false;
   };
   const folder=this.el('smartCategoryFilter'),oldFolder=folder?.onchange;
   if(folder)folder.onchange=e=>{
    if(folder.value==='landscape'){
     folder.value=this.b.smartCatalogFolder||'all';
     this.openTextureFolder();return;
    }
    oldFolder?.call(folder,e);
   };
   const w=typeof window!=='undefined'?window:null;
   if(w){
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
     w.addEventListener(type,e=>this.handleBrushPointer(type,e),true);
   }
   this.el('worldCanvasPreset')?.addEventListener('change',()=>this.chooseCanvasPreset());
   this.el('worldTilePreset')?.addEventListener('change',()=>this.chooseTilePreset());
   this.el('worldTileStyle')?.addEventListener('change',e=>{
    this.currentStyle=e.target.value;
   });
   const radiusInput=this.el('worldTextureRadius');
   radiusInput?.addEventListener('input',e=>
    this.setTextureBrushRadius(Number(e.target.value)));
   for(const button of this.doc.querySelectorAll?.('[data-texture-brush-radius]')||[]){
    button.addEventListener('click',()=>this.setTextureBrushRadius(
     Number(button.getAttribute('data-texture-brush-radius'))));
   }
   let savedRadius=NaN;
   if(typeof localStorage!=='undefined'){
    try{savedRadius=Number(localStorage.getItem('phoenix-terrain-texture-radius'))}
    catch(error){/* browser storage may be disabled */}
   }
   if(Number.isFinite(savedRadius)&&savedRadius>=.2&&savedRadius<=50)
    this.setTextureBrushRadius(savedRadius,false);
   else this.setTextureBrushRadius(this.textureBrushRadius(),false);
   this.el('worldTextureScale')?.addEventListener('change',e=>{
    const next=Number(e.target.value);
    if(!Number.isFinite(next)||next<1||next>32||
       this.state.textureScale===next)return;
    this.b.recordEdit?.();
    this.state.textureScale=next;
    this.setTextureScale(next);
    this.b.save?.();
   });
   for(const [id,display] of [['worldBrushRadius','worldBrushRadiusValue'],
    ['worldBrushPower','worldBrushPowerValue'],
    ['worldTextureSoftness','worldTextureSoftnessValue'],
    ['worldTextureOpacity','worldTextureOpacityValue'],
    ['worldTextureScale','worldTextureScaleValue']]){
    this.el(id)?.addEventListener('input',e=>{
     const target=this.el(display);
     if(target)target.textContent=e.target.value+
      (id==='worldBrushRadius'?' м':id==='worldBrushPower'?' м/с':
       ['worldTextureSoftness','worldTextureOpacity'].includes(id)?'%':' м');
     if(id==='worldTextureScale')this.setTextureScale(Number(e.target.value));
    });
   }
  }
  getVisible(){return !this.panel.hidden}
  open(){
   if(this.b.playBridge?.active){
    this.notify('Сначала выйди из PLAY в EDIT','warn');return false;
   }
   this.b.prefabEditor?.close();
   // The terrain brush owns canvas edits; construction ghost must be off.
   if(this.b.tool==='place')this.b.setTool('pick');
   this.b.skillEditor?.close();
   this.b.skillDefinitionEditor?.close();
   this.panel.hidden=false;this.renderForm();this.updateStatus();
   return true;
  }
  close(){
   this.stopPainting();this.hideBrushIndicator();
   this.panel.hidden=true;return true;
  }
  renderForm(){
   const s=this.state;
   for(const [id,value] of Object.entries({
    worldCanvasWidth:s.width,worldCanvasDepth:s.depth,
    worldTileCustom:s.tileSize
   })){const input=this.el(id);if(input)input.value=String(value);}
   const select=this.el('worldCanvasPreset');
   if(select)select.value=(s.width===s.depth&&
     [50,100,250,500,1000,5000].includes(s.width))?String(s.width):'custom';
   const tile=this.el('worldTilePreset');
   if(tile)tile.value=this.schema.SIZES.includes(s.tileSize)?
    String(s.tileSize):'custom';
   const style=this.el('worldTileStyle');
   if(style)style.value=this.currentStyle;
   const tileScale=this.el('worldTextureScale');
   if(tileScale)tileScale.value=String(s.textureScale||4);
   const grid=this.el('btnWorldGrid');
   if(grid){
    grid.textContent=this.gridVisible?'▦ СЕТКА: ВКЛ':'▦ СЕТКА: ВЫКЛ';
    grid.setAttribute('aria-pressed',String(this.gridVisible));
    grid.classList.toggle('active',this.gridVisible);
   }
   const radius=this.el('worldBrushRadius');
   const power=this.el('worldBrushPower');
   if(radius)this.el('worldBrushRadiusValue').textContent=radius.value+' м';
   if(power)this.el('worldBrushPowerValue').textContent=power.value+' м/с';
   const textureRadius=this.textureBrushRadius();
   const sizeLabel=this.el('worldTextureRadiusValue');
   if(sizeLabel)sizeLabel.textContent=this.formatBrushSize(textureRadius)+
    ' радиус · '+this.formatBrushSize(textureRadius*2)+' диаметр';
   for(const [id,display,suffix] of [['worldTextureSoftness','worldTextureSoftnessValue','%'],
    ['worldTextureOpacity','worldTextureOpacityValue','%'],
    ['worldTextureScale','worldTextureScaleValue',' м']]){
    const input=this.el(id),label=this.el(display);
    if(input&&label)label.textContent=input.value+suffix;
   }
   this.updateTextureChosen();
   this.updateStatus();
  }
  chooseCanvasPreset(){
   const preset=this.el('worldCanvasPreset')?.value;
   if(!preset||preset==='custom')return;
   const n=Number(preset);
   this.el('worldCanvasWidth').value=String(n);
   this.el('worldCanvasDepth').value=String(n);
  }
  chooseTilePreset(){
   const preset=this.el('worldTilePreset')?.value;
   if(!preset||preset==='custom')return;
   this.el('worldTileCustom').value=preset;
  }
  applySizes(){
   if(this.b.playBridge?.active)return false;
   try{
    const draft={
     width:Number(this.el('worldCanvasWidth').value),
     depth:Number(this.el('worldCanvasDepth').value),
     tileSize:Number(this.el('worldTileCustom').value)
    };
    const next=this.schema.resize(this.state,draft);
    this.b.recordEdit?.();
    this.state=next;
    this.painter=new this.splat.Painter(next,next.paintMasks);
    this.applyScene();this.renderForm();
    this.b.save?.();
    this.notify('🌍 Общий холст '+next.width+'×'+next.depth+
     ' м · сектор '+next.tileSize+'×'+next.tileSize+' м','success');
    return true;
   }catch(error){
    this.notify('⚠ Размер не применён: '+error.message,'warn');return false;
   }
  }
  applyScene(){
   const b=this.b,s=this.state;
   const old=b.ground.geometry;
   b.ground.geometry=new THREE.PlaneGeometry(s.width,s.depth,1,1);
   old?.dispose?.();
   // One plane for the WHOLE world. Sparse painted tiles are separate from
   // building entries; world size never multiplies the construction mesh.
   const span=Math.max(s.width,s.depth);
   b.camera.far=Math.max(240,Math.hypot(s.width,s.depth)*1.6);
   b.camera.updateProjectionMatrix();
   b.controls.maxDistance=Math.max(140,span*1.4);
   if(b.scene.fog)b.scene.fog.far=Math.max(220,span*1.5);
   this.rebuildTerrain();
   this.rebuildGrid();
  }
  overview(){
   if(this.b.playBridge?.active)return false;
   const s=this.state,span=Math.max(s.width,s.depth);
   this.b.controls.target.set(0,0,0);
   this.b.camera.position.set(s.width*.52,span*.92,s.depth*.52);
   this.b.camera.lookAt(0,0,0);
   this.b.controls.update();return true;
  }
  toggleGrid(){
   this.gridVisible=!this.gridVisible;
   this.rebuildGrid();this.renderForm();
   return this.gridVisible;
  }
  rebuildGrid(){
   if(this.grid){this.terrainRoot.remove(this.grid);
    this.grid.geometry?.dispose();this.grid.material?.dispose();this.grid=null;}
   if(!this.gridVisible)return;
   const s=this.state,step=s.tileSize;
   const nx=Math.ceil(s.width/step),nz=Math.ceil(s.depth/step);
   // At most 202 lines on each axis even for custom 10m tiles on a 5km
   // canvas. The GRID is never shown until the user presses 'СЕТКА'.
   const everyX=Math.max(1,Math.ceil(nx/200)),
    everyZ=Math.max(1,Math.ceil(nz/200));
   const positions=[];
   for(let i=0;i<=nx;i+=everyX){
    const x=Math.min(s.width/2,-s.width/2+i*step);
    positions.push(x,.022,-s.depth/2,x,.022,s.depth/2);
   }
   if(nx%everyX!==0)positions.push(s.width/2,.022,-s.depth/2,s.width/2,.022,s.depth/2);
   for(let i=0;i<=nz;i+=everyZ){
    const z=Math.min(s.depth/2,-s.depth/2+i*step);
    positions.push(-s.width/2,.022,z,s.width/2,.022,z);
   }
   if(nz%everyZ!==0)positions.push(-s.width/2,.022,s.depth/2,s.width/2,.022,s.depth/2);
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   this.grid=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
    color:0x2b605a,transparent:true,opacity:.7,depthWrite:false
   }));
   this.grid.name='phoenix:opt-in-sector-grid';
   this.grid.renderOrder=2;this.terrainRoot.add(this.grid);
  }
  patchRect(col,row){
   const x0=-this.state.width/2+col*this.patchSize;
   const z0=-this.state.depth/2+row*this.patchSize;
   const width=Math.min(this.patchSize,this.state.width/2-x0);
   const depth=Math.min(this.patchSize,this.state.depth/2-z0);
   return {x:x0+width/2,z:z0+depth/2,minX:x0,minZ:z0,width,depth,col,row,
    key:col+':'+row};
  }
  refreshHeightLookup(){
   this.heightLookup=new Map(this.state.heights.map(([i,j,h])=>[i+':'+j,h]));
  }
  heightAt(x,z){
   return this.schema.heightAt(this.state,x,z,this.heightLookup);
  }
  hasElevations(){return this.state.heights.length>0}
  flatMatrix(rect,visible=true){
   const obj=new THREE.Object3D();
   obj.position.set(rect.x,-.009,rect.z);
   obj.scale.set(visible?rect.width:0,1,visible?rect.depth:0);
   obj.updateMatrix();return obj.matrix;
  }
  setFlatVisibility(key,visible){
   const ref=this.flatPatches.get(key);
   if(!ref)return;
   ref.mesh.setMatrixAt(ref.index,this.flatMatrix(ref.rect,visible));
   ref.mesh.instanceMatrix.needsUpdate=true;
  }
  rebuildTerrain(){
   for(const mesh of this.instanced.values())this.terrainRoot.remove(mesh);
   for(const mesh of this.sculptPatches.values()){
    this.terrainRoot.remove(mesh);mesh.geometry.dispose();
   }
   this.instanced.clear();this.flatPatches.clear();this.sculptPatches.clear();
   this.refreshHeightLookup();
   // The old single 128m floor would cover underground valleys.
   // Draw one instanced world surface, with local height-mesh patches
   // replacing only altered sectors. 5km canvas = <=10,000 lightweight
   // plane instances (1-7 draw calls); never build 25km² of triangles.
   this.b.ground.visible=false;
   const groups=new Map(),styles=new Map();
   for(const tile of this.state.tiles)styles.set(tile.col+':'+tile.row,tile.style);
   const countX=Math.ceil(this.state.width/this.patchSize);
   const countZ=Math.ceil(this.state.depth/this.patchSize);
   for(let row=0;row<countZ;row++)for(let col=0;col<countX;col++){
    const rect=this.patchRect(col,row);
    const at=this.schema.cellAt(this.state,rect.x,rect.z);
    const style=styles.get(at?.key)||'_default';
    if(!groups.has(style))groups.set(style,[]);
    groups.get(style).push(rect);
   }
   for(const [style,patches] of groups){
    if(!patches.length)continue;
    const mesh=new THREE.InstancedMesh(
     this.tileGeometry,this.materials.get(style),patches.length);
    mesh.name='phoenix:landscape:flat:'+style;
    mesh.frustumCulled=false;
    patches.forEach((rect,index)=>{
     mesh.setMatrixAt(index,this.flatMatrix(rect));
     this.flatPatches.set(rect.key,{mesh,index,rect});
    });
    mesh.instanceMatrix.needsUpdate=true;
    this.terrainRoot.add(mesh);this.instanced.set(style,mesh);
   }
   if(this.state.heights.length){
    // Sparse nodes influence only a small number of 50m mesh patches.
    // Include neighbour patches when a node is near a shared border.
    const dirty=new Set(),step=this.schema.HEIGHT_STEP;
    for(const [i,j] of this.state.heights){
     const x=i*step,z=j*step;
     const cols=[Math.floor((x-step)/this.patchSize),
       Math.floor((x+step)/this.patchSize)];
     const rows=[Math.floor((z-step)/this.patchSize),
       Math.floor((z+step)/this.patchSize)];
     for(let a=Math.max(0,cols[0]);a<=Math.min(countX-1,cols[1]);a++)
      for(let b=Math.max(0,rows[0]);b<=Math.min(countZ-1,rows[1]);b++)
       dirty.add(a+':'+b);
    }
    for(const key of dirty)this.refreshSculptPatch(key);
   }
   this.refreshAllTexturePatches();
  }
  refreshSculptPatch(key){
   const flat=this.flatPatches.get(key);
   if(!flat)return;
   const rect=flat.rect,segments=this.patchSegments;
   let mesh=this.sculptPatches.get(key);
   let geometry=mesh?.geometry;
   if(!geometry){
    geometry=new THREE.PlaneGeometry(rect.width,rect.depth,segments,segments);
    geometry.rotateX(-Math.PI/2);
   }
   const attr=geometry.getAttribute('position');
   let modified=false;
   for(let i=0;i<attr.count;i++){
    const h=this.heightAt(rect.x+attr.getX(i),rect.z+attr.getZ(i));
    if(Math.abs(h)>.004)modified=true;
    attr.setY(i,h+.004);
   }
   if(!modified){
    if(mesh){this.terrainRoot.remove(mesh);mesh.geometry.dispose();
     this.sculptPatches.delete(key);}
    else geometry.dispose();
    this.setFlatVisibility(key,true);
    this.refreshTexturePatch(key,true);return;
   }
   attr.needsUpdate=true;
   geometry.computeVertexNormals();
   if(!mesh){
    // The flat chunk is now replaced by a deformable local mesh.
    const at=this.schema.cellAt(this.state,rect.x,rect.z);
    const style=this.state.tiles.find(t=>t.col===at?.col&&t.row===at?.row)?.style||'_default';
    mesh=new THREE.Mesh(geometry,this.materials.get(style));
    mesh.position.set(rect.x,0,rect.z);
    mesh.name='phoenix:sculpt:'+key;
    this.terrainRoot.add(mesh);this.sculptPatches.set(key,mesh);
    this.setFlatVisibility(key,false);
   }
   this.refreshTexturePatch(key,true);
  }
  refreshSculptArea(x,z,radius){
   this.refreshHeightLookup();
   const pad=this.schema.HEIGHT_STEP;
   const loC=Math.max(0,Math.floor((x-radius-pad+this.state.width/2)/this.patchSize));
   const hiC=Math.min(Math.ceil(this.state.width/this.patchSize)-1,
    Math.floor((x+radius+pad+this.state.width/2)/this.patchSize));
   const loR=Math.max(0,Math.floor((z-radius-pad+this.state.depth/2)/this.patchSize));
   const hiR=Math.min(Math.ceil(this.state.depth/this.patchSize)-1,
    Math.floor((z+radius+pad+this.state.depth/2)/this.patchSize));
   for(let row=loR;row<=hiR;row++)for(let col=loC;col<=hiC;col++)
    this.refreshSculptPatch(col+':'+row);
  }
  updateStatus(){
   const text=this.el('worldCanvasInfo');
   if(text){
    const s=this.state;
    const nx=Math.ceil(s.width/s.tileSize),nz=Math.ceil(s.depth/s.tileSize);
    text.textContent='🌍 '+s.width+'×'+s.depth+' м · '+
     nx+'×'+nz+' секторов · '+this.state.tiles.length+
     ' цветных секторов · '+this.painter.patches.size+
     ' секторов с текстурами · '+this.painter.materials().length+
     ' материалов · сетка '+(this.gridVisible?'вкл':'выкл');
   }
   const paint=this.el('worldPaintStatus');
   if(paint)paint.textContent=this.painting?
    (this.paintMode==='texture'?'🖌 Мягкая круглая кисть: веди пальцем по горе / земле':
     this.paintMode==='texture-erase'?'🧽 Ластик покрытия: сотри текстуру круглой кистью':
     this.paintMode==='erase'?'🧹 Ластик старого сектора: коснись земли':
     ['raise','lower','smooth'].includes(this.paintMode)?
     ('⛰ '+{raise:'Подними',lower:'Опусти',smooth:'Сгладь'}[this.paintMode]+
     ' землю пальцем. Undo/Redo — общие кнопки Builder.'):
     '🖌 Рисование «'+this.schema.STYLES[this.currentStyle]?.title+
     '»: коснись сектора на сцене'):
    'Рисование выключено. Для выбора сектора нажми «Рисовать» или «Стереть».';
  }
  selectStyle(style){
   if(!this.schema.STYLES[style])return false;
   this.currentStyle=style;
   const sel=this.el('worldTileStyle');if(sel)sel.value=style;
   this.open();this.startPainting(false);
   return true;
  }
  openTextureFolder(){
   this.b.setTextureTab?.('textures');
   const folder=this.el('textureCategoryFilter');
   if(folder)folder.value='landscape-tiles';
   this.b.renderTextureLibrary?.();
   return this.open();
  }
  updateTextureChosen(){
   const label=this.el('worldTextureChosen');
   if(!label)return;
   const info=this.b.textureFiles?.find(t=>t.id===this.textureId);
   label.textContent=info?'🖼 Выбран материал: '+info.name+
    ' · одно изображение, круглые мазки':'🎨 Выбери картинку слева: Текстуры → Ландшафт';
  }
  selectTexture(id){
   const info=this.b.textureFiles?.find(t=>t.id===id&&
    t.folder==='landscape-tiles');
   if(!info)return this.notify('Сначала добавь PNG/WebP в папку «Ландшафт»'),false;
   this.textureId=id;
   this.open();
   this.startTexturePaint(false);
   this.updateTextureChosen();
   this.ensureTexture(id).catch(error=>this.notify(
    '⚠ Не удалось прочитать тайл «'+info.name+'»: '+error.message));
   return true;
  }
  startTexturePaint(erase=false){
   if(this.b.playBridge?.active)return false;
   if(!erase&&!this.textureId)return this.notify(
    'Сначала выбери материал в папке «Ландшафт» слева'),false;
   this.finishStroke();
   this.painting=true;this.paintMode=erase?'texture-erase':'texture';
   this.b.prefabEditor?.cancelPlacement?.();
   this.b.surfaceSidePick=false;
   this.b.decalPickMode=false;
   this.updateStatus();
   this.hideBrushIndicator();
   return true;
  }
  usesTexture(id){
   return this.painter.materials().includes(id);
  }
  releaseTexture(id){
   if(this.usesTexture(id))return false;
   const cached=this.textureMaps.get(id);
   if(cached){cached.dispose?.();this.textureMaps.delete(id);}
   this.texturePromises.delete(id);
   return true;
  }
  async ensureTexture(id){
   if(this.textureMaps.has(id))return this.textureMaps.get(id);
   if(this.texturePromises.has(id))return this.texturePromises.get(id);
   const request=Promise.resolve().then(()=>this.b.textureAsset(id))
    .then(raw=>{
     // Three.js Texture.clone() shares the decoded image, not a new copy
     // of the imported PNG/WebP bytes. Builder keeps the master asset once.
     const tex=raw.clone();
     tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
     tex.offset.set(0,0);tex.repeat.set(1,1);
     tex.needsUpdate=true;
     this.textureMaps.set(id,tex);
     this.texturePromises.delete(id);
     for(const [key,layers] of this.painter.patches)
      if(layers.has(id))this.refreshTexturePatch(key);
     return tex;
    }).catch(error=>{this.texturePromises.delete(id);throw error});
   this.texturePromises.set(id,request);
   return request;
  }
  setTextureScale(n){
   if(!Number.isFinite(n)||n<1||n>32)return false;
   for(const patches of this.textureMeshes.values())
    for(const overlay of patches.values()){
     const rect=overlay.rect,uniforms=overlay.mesh.material.userData;
     uniforms.terrainRepeat.set(rect.width/n,rect.depth/n);
     uniforms.terrainOffset.set(rect.minX/n,-(rect.minZ+rect.depth)/n);
    }
   return true;
  }
  removeTextureMeshes(){
   for(const layers of this.textureMeshes.values())
    for(const value of layers.values())this.disposeTextureOverlay(value);
   this.textureMeshes.clear();
  }
  disposeTextureOverlay(value){
   this.terrainRoot.remove(value.mesh);
   value.mesh.geometry?.dispose?.();
   value.mesh.material?.alphaMap?.dispose?.();
   value.mesh.material?.dispose?.();
  }
  geometryForTexture(rect){
   const geo=new THREE.PlaneGeometry(rect.width,rect.depth,
    this.patchSegments,this.patchSegments);
   geo.rotateX(-Math.PI/2);
   const points=geo.getAttribute('position');
   for(let i=0;i<points.count;i++)
    points.setY(i,this.heightAt(rect.x+points.getX(i),
     rect.z+points.getZ(i))+.042);
   points.needsUpdate=true;
   geo.computeVertexNormals();
   return geo;
  }
  materialForTexture(id,rect,maskTexture){
   const tileMetres=this.state.textureScale||4;
   const texture=this.textureMaps.get(id);
   const material=new THREE.MeshBasicMaterial({
    map:texture,alphaMap:maskTexture,
    transparent:true,depthWrite:false,alphaTest:.004,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1
   });
   material.userData.terrainRepeat=new THREE.Vector2(
    rect.width/tileMetres,rect.depth/tileMetres);
   material.userData.terrainOffset=new THREE.Vector2(
    rect.minX/tileMetres,-(rect.minZ+rect.depth)/tileMetres);
   // Three r140 normally uses the SAME UV for map and alphaMap.
   // The mask needs local 0..1 UV while terrain imagery must tile by
   // metres across patch boundaries. Custom map sampling fixes both.
   material.onBeforeCompile=shader=>{
    shader.uniforms.terrainRepeat={
     value:material.userData.terrainRepeat
    };
    shader.uniforms.terrainOffset={
     value:material.userData.terrainOffset
    };
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
     '#include <common>\nuniform vec2 terrainRepeat;\nuniform vec2 terrainOffset;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
     '#ifdef USE_MAP\n'+
     ' vec2 worldPaintUV = vUv * terrainRepeat + terrainOffset;\n'+
     ' vec4 sampledDiffuseColor = texture2D(map,worldPaintUV);\n'+
     ' diffuseColor *= sampledDiffuseColor;\n#endif');
   };
   material.customProgramCacheKey=()=> 'phoenix-terrain-splat-uv-v1';
   return material;
  }
  refreshTexturePatch(key,refreshGeometry=false){
   const flat=this.flatPatches.get(key),existing=this.textureMeshes.get(key);
   if(!flat){
    if(existing){for(const overlay of existing.values())
     this.disposeTextureOverlay(overlay);
     this.textureMeshes.delete(key);}
    return;
   }
   const rect=flat.rect,layers=this.painter.layersFor(key);
   const overlays=existing||new Map();
   if(!existing)this.textureMeshes.set(key,overlays);
   for(const [id,overlay] of overlays)
    if(!layers.has(id)||!layers.get(id).some(v=>v)){
     this.disposeTextureOverlay(overlay);overlays.delete(id);
    }
   for(const [id,mask] of layers){
    if(!mask.some(v=>v))continue;
    if(!this.textureMaps.has(id)){
     if(this.b.textureAsset&&!this.texturePromises.has(id))
      this.ensureTexture(id).catch(e=>this.notify('Ошибка текстуры ландшафта: '+e.message));
     continue;
    }
    let overlay=overlays.get(id);
    const resolution=this.splat.resolutionOf(mask);
    // Upgraded a legacy 64px patch to a detailed 512px patch:
    // replace its alpha canvas once, without cloning source PNG/WebP.
    if(overlay&&overlay.canvas.width!==resolution){
     this.disposeTextureOverlay(overlay);
     overlays.delete(id);
     overlay=null;
    }
    if(!overlay){
     const canvas=this.doc.createElement('canvas');
     canvas.width=canvas.height=resolution;
     const context=canvas.getContext('2d',{willReadFrequently:true});
     if(!context)continue;
     const maskTexture=new THREE.CanvasTexture(canvas);
     maskTexture.magFilter=THREE.LinearFilter;
     maskTexture.minFilter=THREE.LinearFilter;
     maskTexture.generateMipmaps=false;
     const geometry=this.geometryForTexture(rect);
     const mesh=new THREE.Mesh(geometry,
      this.materialForTexture(id,rect,maskTexture));
     mesh.name='phoenix:terrain:paint:'+key;
     mesh.position.set(rect.x,0,rect.z);
     mesh.frustumCulled=false;
     mesh.renderOrder=4;
     this.terrainRoot.add(mesh);
     overlay={mesh,rect,canvas,context};
     overlays.set(id,overlay);
    }else if(refreshGeometry){
     const geo=this.geometryForTexture(rect);
     overlay.mesh.geometry.dispose();
     overlay.mesh.geometry=geo;
    }
    const pixels=overlay.context.createImageData(resolution,resolution);
    for(let i=0;i<mask.length;i++){
     const off=i*4,v=mask[i];
     pixels.data[off]=v;pixels.data[off+1]=v;
     pixels.data[off+2]=v;pixels.data[off+3]=255;
    }
    overlay.context.putImageData(pixels,0,0);
    overlay.mesh.material.alphaMap.needsUpdate=true;
   }
   if(!overlays.size)this.textureMeshes.delete(key);
  }
  refreshAllTexturePatches(){
   this.removeTextureMeshes();
   this.textureGeneration++;
   for(const key of this.painter.patches.keys())this.refreshTexturePatch(key);
  }
  paintTextureAt(x,z,erase=false,seconds=.09){
   if(!erase&&!this.textureId)return false;
   const radius=this.textureBrushRadius();
   const opacity=Number(this.el('worldTextureOpacity')?.value||100)/100;
   const softness=Number(this.el('worldTextureSoftness')?.value||65)/100;
   const oldState=!this.stroke?this.b.project?.():null;
   const changed=this.painter.paint(x,z,radius,
    this.textureId,opacity,erase,softness);
   if(!changed.length)return false;
   // History uses the exact same Builder snapshots as walls/doors/modules.
   if(!this.stroke?.recorded){
    const ok=this.b.recordEdit?.(this.stroke?.snapshot||oldState);
    if(this.stroke)this.stroke.recorded=ok!==false;
   }
   if(this.stroke)this.stroke.changed=true;
   for(const key of changed)this.refreshTexturePatch(key);
   if(!this.stroke){
    this.state.paintMasks=this.painter.serialize();
    this.b.save?.();
   }
   this.updateStatus();
   return true;
  }
  startPainting(erase=false){
   if(this.b.playBridge?.active)return false;
   this.finishStroke();this.hideBrushIndicator();
   this.painting=true;this.paintMode=erase?'erase':'place';
   this.b.prefabEditor?.cancelPlacement?.();
   this.updateStatus();
   return true;
  }
  startSculpt(mode){
   if(this.b.playBridge?.active||
      !['raise','lower','smooth'].includes(mode))return false;
   this.finishStroke();this.hideBrushIndicator();
   this.painting=true;this.paintMode=mode;
   this.b.prefabEditor?.cancelPlacement?.();
   this.updateStatus();
   return true;
  }
  stopPainting(){
   this.finishStroke();this.hideBrushIndicator();
   this.painting=false;this.updateStatus();return true;
  }
  rememberEdit(){
   if(this.stroke&&this.stroke.recorded)return;
   const snapshot=this.stroke?.snapshot||this.b.project?.();
   const recorded=this.b.recordEdit?.(snapshot);
   if(this.stroke)this.stroke.recorded=recorded!==false;
   if(recorded===false&&this.b.history?.lastWarning)
    this.notify('⚠ '+this.b.history.lastWarning,'warn');
  }
  brushAt(x,z,seconds=.09){
   if(!this.painting||this.b.playBridge?.active)return false;
   try{
    if(this.paintMode==='texture'||this.paintMode==='texture-erase')
     return this.paintTextureAt(x,z,this.paintMode==='texture-erase',seconds);
    if(['raise','lower','smooth'].includes(this.paintMode)){
     const radius=Number(this.el('worldBrushRadius')?.value||25);
     const strength=Number(this.el('worldBrushPower')?.value||6);
     const next=this.schema.sculpt(this.state,x,z,{
      mode:this.paintMode,radius,strength,seconds
     });
     if(next.heights.length===this.state.heights.length&&
        JSON.stringify(next.heights)===JSON.stringify(this.state.heights))
      return false;
     this.rememberEdit();
     this.state=next;
     this.refreshSculptArea(x,z,radius);
     if(this.brushIndicator.visible&&this.indicatorPoint)
      this.showBrushIndicator(this.indicatorPoint.x,this.indicatorPoint.z);
     if(this.stroke)this.stroke.changed=true;
     else this.b.save?.();
     this.updateStatus();
     return true;
    }
    return this.paintAt(x,z,this.paintMode==='erase');
   }catch(error){
    this.notify('⚠ Кисть: '+error.message,'warn');return false;
   }
  }
  pointerTerrain(event){
   // Trace actual hills before the old UV44 flat Y=0 placement plane.
   // The brush must land on a rock summit, not project behind the hill.
   const plane=this.b.rayPoint(event,0);
   if(this.sculptPatches.size&&this.b.ray?.intersectObjects){
    this.terrainRoot.updateMatrixWorld(true);
    const hits=this.b.ray.intersectObjects([...this.sculptPatches.values()],false);
    if(hits.length)return hits[0].point;
   }
   return plane;
  }
  brushLine(from,to,seconds){
   if(!from)return this.brushAt(to.x,to.z,seconds);
   const distance=Math.hypot(to.x-from.x,to.z-from.z);
   // Minimum stamp separation prevents gaps even when pointermove events
   // are throttled by Android. This keeps long pencil strokes continuous.
   const radius=this.currentBrushRadius();
   const step=Math.max(.07,Math.min(12,radius*.45));
   const samples=Math.max(1,Math.ceil(distance/step));
   let any=false;
   for(let i=1;i<=samples;i++){
    const t=i/samples;
    any=this.brushAt(from.x+(to.x-from.x)*t,
     from.z+(to.z-from.z)*t,seconds/samples)||any;
   }
   return any;
  }
  handleBrushPointer(type,event){
   if(!this.painting||this.b.playBridge?.active)return;
   const canvas=this.b.canvas;
   if(type==='pointermove'&&!this.stroke){
    if(event.target===canvas&&event.isPrimary!==false){
     const hit=this.pointerTerrain(event);
     if(hit)this.showBrushIndicator(hit.x,hit.z);
     else this.hideBrushIndicator();
    }
    return;
   }
   if(type==='pointerdown'){
    if(event.target!==canvas||event.isPrimary===false||this.stroke)return;
    const hit=this.pointerTerrain(event);
    if(!hit)return;
    this.showBrushIndicator(hit.x,hit.z);
    this.stroke={pointerId:event.pointerId,snapshot:this.b.project?.(),
     recorded:false,changed:false,last:performance.now(),
     point:{x:hit.x,z:hit.z}};
    canvas.setPointerCapture?.(event.pointerId);
    this.brushAt(hit.x,hit.z,.12);
    event.preventDefault();event.stopImmediatePropagation();
    return;
   }
   if(!this.stroke||event.pointerId!==this.stroke.pointerId)return;
   if(type==='pointermove'||type==='pointerup'){
    const now=performance.now(),dt=(now-this.stroke.last)/1000;
    if(type==='pointerup'||dt>=.045){
     const hit=this.pointerTerrain(event);
     if(hit){
      const to={x:hit.x,z:hit.z};
      this.brushLine(this.stroke.point,to,Math.min(.24,Math.max(.04,dt)));
      this.showBrushIndicator(to.x,to.z);
      this.stroke.point=to;
     }
     this.stroke.last=now;
    }
   }
   if(type==='pointerup'||type==='pointercancel'){
    this.finishStroke();this.hideBrushIndicator();
   }
   event.preventDefault();event.stopImmediatePropagation();
  }
  finishStroke(){
   const stroke=this.stroke;
   this.stroke=null;
   if(!stroke)return;
   try{
    if(this.b.canvas.hasPointerCapture?.(stroke.pointerId))
     this.b.canvas.releasePointerCapture(stroke.pointerId);
   }catch(error){console.warn('Terrain pointer release:',error)}
   if(stroke.changed){
    this.state.paintMasks=this.painter.serialize();
    this.b.save?.();
   }
  }
  clearHeights(){
   if(!this.state.heights.length)return false;
   if(typeof window!=='undefined'&&!window.confirm(
    'Сбросить всю высоту гор и низин? Текстуры тайлов и постройки останутся.'))
    return false;
   this.stopPainting();
   this.b.recordEdit?.();
   this.state=this.schema.validate({...this.state,heights:[]});
   this.rebuildTerrain();this.b.save?.();this.updateStatus();
   this.notify('⛰ Рельеф сброшен. Строительство и тайлы сохранены.','success');
   return true;
  }
  paintFromEvent(event){
   if(!this.painting||this.b.playBridge?.active)return false;
   const point=this.b.rayPoint(event,0);
   if(!point)return false;
   return this.paintAt(point.x,point.z,this.paintMode==='erase');
  }
  paintAt(x,z,erase=false){
   if(!this.painting||this.b.playBridge?.active)return false;
   try{
    const next=erase?this.schema.erase(this.state,x,z):
     this.schema.paint(this.state,x,z,this.currentStyle);
    // Don't clutter undo history when erasing an empty cell or repainting
    // a cell in the same colour.
    if(JSON.stringify(next.tiles)!==JSON.stringify(this.state.tiles)){
     this.rememberEdit();
     this.state=next;this.rebuildTerrain();
     if(this.stroke)this.stroke.changed=true;
     else this.b.save?.();
    }
    this.updateStatus();
    const at=this.schema.cellAt(this.state,x,z);
    this.notify((erase?'🧹 Стерто':'🌿 Тайл добавлен')+
     ' · сектор '+at.col+','+at.row,'success');
    return true;
   }catch(error){this.notify('⚠ '+error.message,'warn');return false;}
  }
  async fill(){
   if(this.b.playBridge?.active)return false;
   const s=this.state;
   const columns=Math.ceil(s.width/s.tileSize),rows=Math.ceil(s.depth/s.tileSize);
   if(columns*rows>this.schema.MAX_TILES)
    return this.notify('⚠ Для покрытия всей сцены выбери более крупные сектора','warn'),false;
   if(this.state.tiles.length&&typeof window!=='undefined'&&
      !window.confirm('Заменить все ландшафтные тайлы текущим типом?'))return false;
   this.stopPainting();
   const tiles=[];
   // Build in small chunks to keep Android touch UI responsive.
   for(let row=0;row<rows;row++){
    for(let col=0;col<columns;col++)
     tiles.push({row,col,style:this.currentStyle});
    if(row%12===11)await new Promise(resolve=>setTimeout(resolve,0));
   }
   this.b.recordEdit?.();
   this.state=this.schema.validate({...s,tiles});
   this.rebuildTerrain();this.b.save?.();this.updateStatus();
   this.notify('✅ Заполнено '+tiles.length+' ландшафтных секторов','success');
   return true;
  }
  clear(){
   if(!this.state.tiles.length)return false;
   if(typeof window!=='undefined'&&
      !window.confirm('Удалить ВСЕ ландшафтные тайлы? Строительные объекты останутся.'))
    return false;
   this.b.recordEdit?.();
   this.state=this.schema.validate({...this.state,tiles:[]});
   this.rebuildTerrain();this.b.save?.();this.updateStatus();
   this.notify('Ландшафтные тайлы удалены. Постройки не тронуты.','success');
   return true;
  }
  serialize(){
   this.state.paintMasks=this.painter.serialize();
   return this.schema.validate(this.state);
  }
  loadFromProject(data,options={}){
   const showGrid=options.preserveUI&&this.gridVisible;
   this.stopPainting();
   // Projects from UV44 up through 1.3 have no `worldCanvas` member.
   // Restore their original 128x128 ground rather than resizing silently.
   try{this.state=data==null?this.schema.legacy():this.schema.validate(data)}
   catch(error){
    console.warn('Invalid worldCanvas saved in project',error);
    this.state=this.schema.legacy();
   }
   // Grid display is always opt-in after opening a scene or restarting.
   this.gridVisible=!!showGrid;
   this.painter=new this.splat.Painter(this.state,this.state.paintMasks);
   this.applyScene();this.renderForm();
  }
 }
 return WorldEditor;
});
