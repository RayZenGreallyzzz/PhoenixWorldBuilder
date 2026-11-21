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
   this.painting=false;this.paintMode='place';
   this.currentStyle='grass';this.selectedCell='';
   this.terrainRoot=new THREE.Group();this.terrainRoot.name='phoenix:landscape';
   builder.scene.add(this.terrainRoot);
   this.tileGeometry=new THREE.PlaneGeometry(1,1);
   this.tileGeometry.rotateX(-Math.PI/2);
   this.materials=new Map(Object.entries(this.schema.STYLES).map(([name,meta])=>
    [name,new THREE.MeshStandardMaterial({
     color:meta.color,roughness:1,side:THREE.DoubleSide
    })]));
   this.instanced=new Map();this.grid=null;
   this.bind();this.applyScene();this.renderForm();this.updateStatus();
  }
  el(id){return this.doc.getElementById(id)}
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
   on('btnWorldErase',()=>this.startPainting(true));
   on('btnWorldStopPaint',()=>this.stopPainting());
   on('btnWorldClear',()=>this.clear());
   on('btnWorldFill',()=>this.fill());
   this.el('worldCanvasPreset')?.addEventListener('change',()=>this.chooseCanvasPreset());
   this.el('worldTilePreset')?.addEventListener('change',()=>this.chooseTilePreset());
   this.el('worldTileStyle')?.addEventListener('change',e=>{
    this.currentStyle=e.target.value;
   });
  }
  getVisible(){return !this.panel.hidden}
  open(){
   if(this.b.playBridge?.active){
    this.notify('Сначала выйди из PLAY в EDIT','warn');return false;
   }
   this.b.prefabEditor?.close();
   this.b.skillEditor?.close();
   this.b.skillDefinitionEditor?.close();
   this.panel.hidden=false;this.renderForm();this.updateStatus();
   return true;
  }
  close(){
   this.stopPainting();this.panel.hidden=true;return true;
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
   const grid=this.el('btnWorldGrid');
   if(grid){
    grid.textContent=this.gridVisible?'▦ СЕТКА: ВКЛ':'▦ СЕТКА: ВЫКЛ';
    grid.setAttribute('aria-pressed',String(this.gridVisible));
    grid.classList.toggle('active',this.gridVisible);
   }
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
    this.state=next;this.applyScene();this.renderForm();
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
  rebuildTerrain(){
   for(const mesh of this.instanced.values())this.terrainRoot.remove(mesh);
   this.instanced.clear();
   const grouped=new Map();
   for(const tile of this.state.tiles){
    const list=grouped.get(tile.style)||[];
    list.push(tile);grouped.set(tile.style,list);
   }
   const matrixObj=new THREE.Object3D();
   for(const [style,items] of grouped){
    const mesh=new THREE.InstancedMesh(
     this.tileGeometry,this.materials.get(style),items.length);
    mesh.name='phoenix:landscape:'+style;
    mesh.frustumCulled=false;
    for(let i=0;i<items.length;i++){
     const p=this.schema.rect(this.state,items[i].col,items[i].row);
     matrixObj.position.set(p.x,.009,p.z);
     matrixObj.rotation.set(0,0,0);
     matrixObj.scale.set(p.width,1,p.depth);
     matrixObj.updateMatrix();
     mesh.setMatrixAt(i,matrixObj.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    this.terrainRoot.add(mesh);this.instanced.set(style,mesh);
   }
  }
  updateStatus(){
   const text=this.el('worldCanvasInfo');
   if(text){
    const s=this.state;
    const nx=Math.ceil(s.width/s.tileSize),nz=Math.ceil(s.depth/s.tileSize);
    text.textContent='🌍 '+s.width+'×'+s.depth+' м · '+
     nx+'×'+nz+' секторов · '+this.state.tiles.length+
     ' окрашено · максимум '+this.schema.MAX_TILES+
     ' тайлов · сетка '+(this.gridVisible?'вкл':'выкл');
   }
   const paint=this.el('worldPaintStatus');
   if(paint)paint.textContent=this.painting?
    (this.paintMode==='erase'?'🧹 Ластик: коснись сектора на сцене':
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
  startPainting(erase=false){
   if(this.b.playBridge?.active)return false;
   this.painting=true;this.paintMode=erase?'erase':'place';
   this.b.prefabEditor?.cancelPlacement?.();
   this.updateStatus();
   return true;
  }
  stopPainting(){
   this.painting=false;this.updateStatus();return true;
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
     this.b.recordEdit?.();
     this.state=next;this.rebuildTerrain();this.b.save?.();
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
  serialize(){return this.schema.validate(this.state)}
  loadFromProject(data){
   this.stopPainting();
   // Projects from UV44 up through 1.3 have no `worldCanvas` member.
   // Restore their original 128x128 ground rather than resizing silently.
   try{this.state=data==null?this.schema.legacy():this.schema.validate(data)}
   catch(error){
    console.warn('Invalid worldCanvas saved in project',error);
    this.state=this.schema.legacy();
   }
   // Grid display is always opt-in after opening a scene or restarting.
   this.gridVisible=false;
   this.applyScene();this.renderForm();
  }
 }
 return WorldEditor;
});
