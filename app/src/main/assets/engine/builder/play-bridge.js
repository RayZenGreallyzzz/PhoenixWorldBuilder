/* Phoenix Engine PLAY/EDIT bridge for Phoenix Builder UV44.
 * Reuses Builder's player, OrbitControls, collisions, animation mixer and RAF.
 * Does not serialize or mutate construction objects; game code stays isolated.
 */
(function (root, factory) {
 'use strict';
 const api = factory();
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
 if (root) root.PhoenixPlayBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
 'use strict';
 const PlayerProfiles=(typeof globalThis!=='undefined'&&globalThis.PhoenixPlayerCombat)||
  (typeof require==='function'?require('../core/phoenix-player-combat.js'):null);
 const Progression=(typeof globalThis!=='undefined'&&globalThis.PhoenixProgression)||
  (typeof require==='function'?require('../core/phoenix-progression.js'):null);
 class PhoenixPlayBridge {
  constructor(builder, core, doc) {
   if (!builder || !core || !core.PhoenixWorld || !core.PhoenixModeController)
    throw new Error('Phoenix Core and UV44 builder are required');
   this.builder = builder;
   this.core = core;
   this.document = doc || document;
   this.gameWorld = new core.PhoenixWorld();
   this.modeController = new core.PhoenixModeController('edit');
   this.active = false;
   this.saved = null;
   this.healReadyAt=0;
   this.playerCombat=PlayerProfiles.normalize();
   this.progressionSession=null;this.progressionSignature='';
   this.playerRuntimeStats=null;this.playerActiveCombat=null;
   this.levelLine=this.document.getElementById('phoenixLevelLine');
   this.weapon=typeof PhoenixWeapon!=='undefined'?new PhoenixWeapon.Session():null;
   this.ammoSignature='';
   const playButton = this.document.getElementById('btnPhoenixPlay');
   const editButton = this.document.getElementById('btnPhoenixEdit');
   this.hud = this.document.getElementById('phoenixPlayHud');
   this.combatHud = this.document.getElementById('phoenixCombatHud');
   this.attackButton = this.document.getElementById('btnPhoenixAttack');
   this.hpBar = this.document.getElementById('phoenixCombatHP');
   this.hpTarget = this.document.getElementById('phoenixCombatTarget');
   this.combatNotice = this.document.getElementById('phoenixCombatNotice');
   this.playerHPBar = this.document.getElementById('phoenixPlayerHP');
   this.playerHPText = this.document.getElementById('phoenixPlayerHPText');
   this.killsLabel = this.document.getElementById('phoenixKills');
   this.deathNotice = this.document.getElementById('phoenixDeathNotice');
   this.respawnButton = this.document.getElementById('btnPhoenixRespawn');
   this.ammoLine = this.document.getElementById('phoenixAmmoLine');
   this.ammoText = this.document.getElementById('phoenixAmmoText');
   this.rangedControls=this.document.getElementById('phoenixRangedControls');
   this.crosshair = this.document.getElementById('phoenixCrosshair');
    this.mobCard=this.document.getElementById('phoenixMobCard');
    this.selectedMobId='';this.mobTags=new Map();this.mobTagTextures=new Map();
    this.effects=null;this.mobCardElapsed=0;this.mobPointer=null;
    this.playerAttackEffect='impact';
    const playerFx=this.document.getElementById('phoenixPlayerAttackEffect');
    playerFx?.addEventListener('change',()=>{
     const selected=playerFx.value;
     if(PhoenixVFX.PRESETS.includes(selected)){
      this.playerAttackEffect=selected;this.builder.markProjectDirty?.();
     }
    });
    const canvas=builder.canvas;
    canvas?.addEventListener('pointerdown',e=>{
     if(this.active&&e.isPrimary!==false&&e.target===canvas)
      this.mobPointer={id:e.pointerId,x:e.clientX,y:e.clientY};
    });
    canvas?.addEventListener('pointerup',e=>{
     const p=this.mobPointer;this.mobPointer=null;
     if(!this.active||!p||p.id!==e.pointerId||
      Math.hypot(e.clientX-p.x,e.clientY-p.y)>12)return;
     this.selectMobAt(e);
    });
    canvas?.addEventListener('pointercancel',()=>{this.mobPointer=null});
    this.document.getElementById('btnPhoenixMobCardClose')?.
     addEventListener('click',()=>this.selectMob(''));
   this.mpLine = this.document.getElementById('phoenixMpLine');
   this.mpText = this.document.getElementById('phoenixMpText');
   if (!playButton || !editButton || !this.hud)
    throw new Error('Phoenix Engine PLAY/EDIT UI is missing');
   playButton.addEventListener('click', () => this.enter());
   editButton.addEventListener('click', () => this.exit());
   this.attackButton?.addEventListener('click', () => this.attack());
   this.respawnButton?.addEventListener('click', () => this.respawn());
   this.document.getElementById('btnPhoenixRangedAim')?.addEventListener('click',()=>this.aim());
   this.document.getElementById('btnPhoenixRangedReload')?.addEventListener('click',()=>this.reload());
   this.document.getElementById('btnPlayerCombatPreset')?.
    addEventListener('click',()=>this.showPlayerCombatForm(
     PlayerProfiles.preset(this.document.getElementById('phoenixPlayerCombatMode')?.value||'melee')));
   this.document.getElementById('btnPlayerCombatApply')?.
    addEventListener('click',()=>this.applyPlayerCombatForm());
   this.showPlayerCombatForm();
  }

  showPlayerCombatForm(profile=this.playerCombat){
   const el=id=>this.document.getElementById('phoenixPlayerCombat'+id);
   for(const [key,value] of Object.entries(profile)){
    const suffix=key==='hp'?'HP':key[0].toUpperCase()+key.slice(1);
    const input=el(suffix);
    if(input)input.value=String(value);
   }
   const mode=el('Mode');if(mode)mode.value=profile.mode;
  }
  applyPlayerCombatForm(){
   if(this.active)return false;
   const el=id=>this.document.getElementById('phoenixPlayerCombat'+id);
   const raw={mode:el('Mode')?.value||'melee'};
   for(const key of ['hp','damage','range','cooldown','magazineSize',
    'reserveCapacity','reloadDuration']){
    const suffix=key==='hp'?'HP':key[0].toUpperCase()+key.slice(1);
    raw[key]=Number(el(suffix)?.value);
   }
   const status=this.document.getElementById('phoenixPlayerCombatStatus');
   try{
    this.playerCombat=PlayerProfiles.normalize(raw);
    this.builder.markProjectDirty?.();
    if(status)status.textContent='✅ Стиль героя применён: '+
     (this.playerCombat.mode==='ranged'?'дальний':'ближний')+
     '. Для сохранения в проект нажми верхнюю 💾 Сохранить.';
    return true;
   }catch(error){
    if(status)status.textContent='Ошибка настройки героя: '+error.message;
    return false;
   }
  }

  // Build effective PLAY stats without ever changing the authored profile.
  initializeProgression(){
   const raw=this.builder.progressionEditor?.serializePlayer?.()||null;
   if(!raw){
    this.progressionSession=null;this.progressionSignature='';
    this.playerRuntimeStats=null;this.playerActiveCombat=null;return;
   }
   const signature=JSON.stringify(raw);
   if(!this.progressionSession||this.progressionSignature!==signature){
    this.progressionSession=new Progression.Session(raw);
    this.progressionSignature=signature;
   }
   this.applyProgressionStats();
  }
  applyProgressionStats(){
   if(!this.progressionSession){
    this.playerRuntimeStats=null;this.playerActiveCombat=null;return;
   }
   const stats=this.progressionSession.stats;
   this.playerRuntimeStats=stats;
   this.playerActiveCombat=PlayerProfiles.normalize({
    ...this.playerCombat,hp:Math.round(stats.hp),damage:stats.damage,
    cooldown:Math.max(.06,Math.min(10,1/stats.attackSpeed))
   });
  }
  onMobKilled(id,result){
   if(!this.active||!result?.killed||!this.progressionSession)return;
   const mob=this.builder.prefabEditor?.mobProfile?.(id);
   const mobLevel=Math.max(1,Math.min(150,Number(mob?.level)||1));
   const reward=Math.round(40+mobLevel*12);
   const before=this.progressionSession.level;
   const gained=this.progressionSession.grant(reward);
   if(gained.levels){
    this.applyProgressionStats();
    const combat=this.builder.prefabEditor?.combat;
    if(combat&&this.playerActiveCombat){
     // Level-up replenishes HP by the extra maximum amount, never changes
     // any serialized prefab or construction entity.
     const increase=this.playerActiveCombat.hp-combat.playerMaxHp;
     combat.playerMaxHp=this.playerActiveCombat.hp;
     combat.playerHp=Math.max(0,Math.min(combat.playerMaxHp,combat.playerHp+increase));
     combat.damage=this.playerActiveCombat.damage;
     combat.cooldown=this.playerActiveCombat.cooldown;
    }
    const skill=this.builder.skillDefinitionEditor?.runtime;
    if(skill){
     const mp=Math.max(1,Math.round(this.playerRuntimeStats.mp));
     skill.mp=Math.max(0,Math.min(mp,skill.mp+mp-skill.maxMp));
     skill.maxMp=mp;
    }
    if(this.weapon&&this.playerCombat.mode==='ranged'){
     this.weapon.damage=this.playerActiveCombat.damage;
     this.weapon.fireInterval=this.playerActiveCombat.cooldown;
    }
   }
   this.updatePlayerHud();this.updateManaHud();
   if(this.combatNotice)this.combatNotice.textContent=gained.levels?
    '🌟 Уровень '+before+' → '+gained.level+
    ' · +'+gained.gained+' XP · очки навыков: '+gained.skillPoints:
    '✨ +'+gained.gained+' XP · '+gained.xp+'/'+gained.nextXP;
  }

  message(text, level) {
   const status = this.document.getElementById('status');
   const dot = this.document.getElementById('placementDot');
   if (status) status.textContent = text;
   if (dot) dot.className = 'dot ' + (level || 'neutral');
  }

  canEnter() {
   const b = this.builder;
   // Never interrupt an unfinished edit or a staged project restore.
   return !(b.projectLoadRunning || b.restoringProject || b.projectLoadPaused ||
    b.bakeBusy || b.gizmoPointer != null || b.dragMove ||
    b.shapeDragPointer != null || b.shapeSourceMode || b.shapePlaceMode ||
    b.controls.enabled === false);
  }

  enter() {
   if (this.active) return false;
   if (!this.canEnter()) {
    this.message('Заверши текущую операцию или загрузку проекта перед PLAY', 'warn');
    return false;
   }
   const b = this.builder;
   const saved = {
    mode: b.mode,
    tool: b.tool,
    camera: b.camera.position.clone(),
    target: b.controls.target.clone(),
    playerPosition: b.player.position.clone(),
    playerRotation: b.player.rotation.clone(),
    previewRoot: b.preview && b.preview.root,
    previewVisible: b.preview && b.preview.root ? b.preview.root.visible : null,
    previewOutline: b.previewOutline || null,
    outlineVisible: b.previewOutline ? b.previewOutline.visible : null,
    controlsEnabled: b.controls.enabled,
    cameraFov: Number.isFinite(b.camera.fov)?b.camera.fov:null
   };
   try {
    b.prefabEditor?.close();
    b.worldEditor?.close();
    b.keys.clear();
    if (b.joystick) b.joystick.reset();
    this.saved = saved;
    this.active = true;
    b.setMode('character'); // UV44 already handles camera, avatar and collision.
    if (saved.previewRoot) saved.previewRoot.visible = false;
    if (saved.previewOutline) saved.previewOutline.visible = false;
    this.document.body.classList.add('phoenixPlaying');
    this.hud.hidden = false;
    this.modeController.setMode('play');
    this.initializeProgression();
    b.prefabEditor?.setPlaying(true);
    if(typeof PhoenixVFX!=='undefined'&&typeof THREE!=='undefined'&&b.scene)
     this.effects=new PhoenixVFX.SceneFX(b.scene,THREE);
    this.createMobTags();this.selectMob('');
    b.skillEditor?.setPlaying(true);
    b.skillDefinitionEditor?.startPlay(this.playerRuntimeStats?.mp);
    if(this.weapon&&typeof PhoenixWeapon!=='undefined'){
     // Preserve older shooter-HUD weapon stats for existing projects.
     // The new profile configures the gun only when ranged style is selected.
     const combat=this.playerActiveCombat||this.playerCombat;
     this.weapon=new PhoenixWeapon.Session(this.playerCombat.mode==='ranged'?{
      magazineSize:combat.magazineSize,
      reserveCapacity:combat.reserveCapacity,
      damage:combat.damage,range:combat.range,
      fireInterval:combat.cooldown,
      reloadDuration:combat.reloadDuration
     }:{});
    }
    this.ammoSignature='';
    this.healReadyAt=0;
    if(this.combatHud)this.combatHud.hidden=false;
    this.showGenreHud();this.updatePlayerHud();
    // Explicit opt-in only: entering PLAY may join a saved test server.
    b.networkEditor?.beginPlay?.();
    if(this.hpBar)this.hpBar.hidden=true;
    if(this.hpTarget)this.hpTarget.textContent='⚔ Ближайший враг';
    if(this.combatNotice)this.combatNotice.textContent='Касайся ⚔ или нажми F';
    return true;
   } catch (error) {
    // Entering PLAY must never leave the editor with a half-finished UI.
    this.active = false;
    b.networkEditor?.disconnect?.();
    this.selectMob('');
    b.prefabEditor?.setPlaying(false);
    this.clearMobTags();this.effects?.dispose();this.effects=null;
    b.skillEditor?.setPlaying(false);
    b.skillDefinitionEditor?.stopPlay();
    this.playerRuntimeStats=null;this.playerActiveCombat=null;
    this.document.body.classList.remove('phoenixPlaying');
    this.hud.hidden = true;
    if(this.combatHud)this.combatHud.hidden=true;
    this.restore(saved);
    throw error;
   }
  }

  restore(saved,{keepLocation=false}={}) {
   const b = this.builder;
   // Normal PLAY -> EDIT keeps the hero exactly where gameplay ended.
   // Enter failure instead rolls back the original position and camera.
   const lastPosition=keepLocation?b.player.position.clone():null;
   const lastRotation=keepLocation?b.player.rotation.clone():null;
   const travelled=keepLocation?
    lastPosition.clone().sub(saved.playerPosition):null;
   b.setMode(saved.mode);
   // Restore a consciously selected construction tool after leaving PLAY;
   // character editor never inherits a wall placement tool.
   if(saved.mode==='build'&&typeof b.setTool==='function'&&saved.tool)
    b.setTool(saved.tool);
   b.player.position.copy(lastPosition||saved.playerPosition);
   b.player.rotation.copy(lastRotation||saved.playerRotation);
   b.camera.position.copy(saved.camera);
   b.controls.target.copy(saved.target);
   // Move the EDIT camera by the same travelled distance, keeping its angle
   // and zoom relative to the hero instead of jumping to the starting house.
   if(travelled){
    b.camera.position.add(travelled);
    b.controls.target.add(travelled);
   }
   b.controls.enabled = saved.controlsEnabled;
   if(saved.cameraFov!==null&&Number.isFinite(saved.cameraFov)){
    b.camera.fov=saved.cameraFov;b.camera.updateProjectionMatrix?.();
   }
   this.weapon?.setAim(false);
   if(this.crosshair)this.crosshair.hidden=true;
   if(this.ammoLine)this.ammoLine.hidden=true;
   if(this.rangedControls)this.rangedControls.hidden=true;
   if(this.mpLine)this.mpLine.hidden=true;
   if (saved.previewRoot && b.preview && b.preview.root === saved.previewRoot)
    saved.previewRoot.visible = saved.previewVisible;
   if (saved.previewOutline && b.previewOutline === saved.previewOutline)
    saved.previewOutline.visible = saved.outlineVisible;
   b.controls.update();
   b.avatarAttackUntil=0;
   if (typeof b.setAvatarAnimation === 'function') b.setAvatarAnimation(false);
  }

  exit() {
   if (!this.active) return false;
   const b = this.builder;
   b.keys.clear();
   if (b.joystick) b.joystick.reset();
   this.active = false;
    b.networkEditor?.disconnect?.();
    this.selectMob('');
    b.prefabEditor?.setPlaying(false);
    this.clearMobTags();this.effects?.dispose();this.effects=null;
    b.skillEditor?.setPlaying(false);
   b.skillDefinitionEditor?.stopPlay();
   this.playerRuntimeStats=null;this.playerActiveCombat=null;
   this.document.body.classList.remove('phoenixPlaying');
   this.hud.hidden = true;
   if(this.combatHud)this.combatHud.hidden=true;
   const saved = this.saved;
   this.saved = null;
   try {
    this.restore(saved,{keepLocation:true});
   } finally {
    this.modeController.setMode('edit');
   }
   this.message('⏹ EDIT: герой остался на последнем месте', 'success');
   return true;
  }

  selectMobAt(event){
   if(!this.active)return null;
   const found=this.builder.prefabEditor?.pickMobAt(event)||'';
   this.selectMob(found);
   return found;
  }
  selectMob(id){
   const editor=this.builder.prefabEditor;
   const valid=!!id&&!!editor?.mobProfile(id);
   this.selectedMobId=valid?id:'';
   if(this.mobCard)this.mobCard.hidden=!valid||!this.active;
   this.refreshMobCard();
   this.refreshMobTags();
   return this.selectedMobId;
  }
  refreshMobCard(){
   if(!this.selectedMobId||!this.active){
    if(this.mobCard)this.mobCard.hidden=true;
    return;
   }
   const profile=this.builder.prefabEditor?.mobProfile(this.selectedMobId);
   if(!profile){this.selectMob('');return}
   const el=id=>this.document.getElementById(id);
   if(this.mobCard)this.mobCard.hidden=false;
   if(el('phoenixMobCardName'))el('phoenixMobCardName').textContent=
    (profile.type==='npc'?'🧑 ':'🐺 ')+profile.name;
   const faction={enemy:'🔴 Враг',neutral:'⚪ Нейтрал',ally:'🟢 Союзник'};
   if(el('phoenixMobCardRole'))el('phoenixMobCardRole').textContent=
    (faction[profile.faction]||profile.faction)+' · Уровень '+profile.level;
   const health=el('phoenixMobCardHP');
   if(health){health.max=profile.maxHp;health.value=profile.hp;}
   if(el('phoenixMobCardHPText'))el('phoenixMobCardHPText').textContent=
    profile.hp+' / '+profile.maxHp+' HP'+(profile.dead?' · ☠ Погиб':'');
   if(el('phoenixMobCardStats'))el('phoenixMobCardStats').textContent=
    '⚔ Урон: '+profile.damage+' · 🛡 Защита: '+profile.defense+
    ' · 🏃 Скорость: '+profile.speed;
   if(el('phoenixMobCardSkills'))el('phoenixMobCardSkills').textContent=
    profile.skills.length?'✨ Навыки: '+profile.skills.map(v=>
     v.name+' (ур. '+v.level+', откат '+v.cooldown+'с)').join(' · '):
    '✨ Навыки не назначены';
   if(el('phoenixMobCardRespawn'))el('phoenixMobCardRespawn').textContent=
    profile.dead&&profile.respawnLeft!==null?
     '🔁 Возрождение через '+Math.ceil(profile.respawnLeft)+' сек':
    profile.respawn.enabled?'🔁 Респаун: '+profile.respawn.delay+' сек':
    'Респаун выключен';
   if(this.hpTarget)this.hpTarget.textContent='🎯 '+profile.name;
   if(this.hpBar){this.hpBar.max=profile.maxHp;this.hpBar.value=profile.hp;
    this.hpBar.hidden=false;}
  }
  createMobTags(){
   this.clearMobTags();
   if(!this.document.createElement||typeof THREE==='undefined')return;
   const rendered=this.builder.prefabEditor?.rendered;
   if(!rendered)return;
   for(const [id,render] of rendered){
    const profile=this.builder.prefabEditor.mobProfile(id);
    if(!profile)continue;
    const color=/^#[0-9a-fA-F]{6}$/.test(profile.nameColor||'')?
     profile.nameColor:'#ffffff';
    const key=profile.name+'|'+color.toLowerCase();
    let texture=this.mobTagTextures.get(key);
    if(!texture){
     const canvas=this.document.createElement('canvas');
     canvas.width=512;canvas.height=128;
     const ctx=canvas.getContext?.('2d');
     if(!ctx)continue;
     // Transparent label: user-selected text only, no rectangle or border.
     ctx.clearRect?.(0,0,512,128);
     ctx.textAlign='center';ctx.textBaseline='middle';
     ctx.font='bold 48px sans-serif';
     ctx.lineJoin='round';ctx.lineWidth=7;
     ctx.strokeStyle='rgba(0,0,0,.85)';ctx.fillStyle=color;
     const name=[...profile.name].length>36?
      [...profile.name].slice(0,35).join('')+'…':profile.name;
     ctx.strokeText?.(name,256,64,492);
     ctx.fillText(name,256,64,492);
     texture=new THREE.CanvasTexture(canvas);
     texture.minFilter=THREE.LinearFilter;
     texture.generateMipmaps=false;
     this.mobTagTextures.set(key,texture);
    }
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,
     depthWrite:false,depthTest:false});
    const tag=new THREE.Sprite(material);tag.name='phoenix:mob:nametag';
    tag.scale.set(3.1,.775,1);tag.renderOrder=950;
    // Box3.setFromObject on skinned GLB measures bind pose and may place
    // names near the grass. Sample posed vertices in the mob-root space.
    let top=2.2;
    try{
     if(typeof AvatarFit!=='undefined'&&AvatarFit?.measure&&render.visual){
      const metrics=AvatarFit.measure(render.visual,render.root,2000);
      if(Number.isFinite(metrics.max.y))top=metrics.max.y+.35;
     }else{
      const bounds=new THREE.Box3().setFromObject(render.visual||render.root);
      if(Number.isFinite(bounds.max.y))
       top=bounds.max.y-render.root.getWorldPosition(new THREE.Vector3()).y+.35;
     }
    }catch(error){console.warn('Nickname height fallback:',error)}
    tag.position.y=Math.max(1.85,Math.min(10,top));
    render.root.add(tag);this.mobTags.set(id,tag);tag.visible=false;
   }
   this.refreshMobTags();
  }
  refreshMobTags(){
   if(!this.active)return;
   for(const [id,tag] of this.mobTags){
    const render=this.builder.prefabEditor?.rendered.get(id);
    if(!render)continue;
    // No distance fade: visible while the living mob is rendered.
    tag.visible=render.root.visible&&
     !this.builder.prefabEditor?.combat.isDead(id);
    tag.material.color.setHex(0xffffff); // Preserve the exact chosen name color.
   }
  }
  clearMobTags(){
   for(const tag of this.mobTags.values()){
    tag.removeFromParent();tag.material?.dispose?.();
   }
   this.mobTags.clear();
   for(const texture of this.mobTagTextures.values())texture.dispose?.();
   this.mobTagTextures.clear();
  }
  updatePlayerHud(){
   const player=this.builder.prefabEditor?.combat?.getPlayer();
   if(!player)return;
   if(this.playerHPBar){
    this.playerHPBar.max=player.maxHp;
    this.playerHPBar.value=player.hp;
   }
   if(this.playerHPText)this.playerHPText.textContent=
    player.hp+' / '+player.maxHp+' HP';
   if(this.killsLabel)this.killsLabel.textContent='☠ Побеждено: '+player.kills;
   if(this.levelLine){
    const s=this.progressionSession?.status();
    this.levelLine.hidden=!s;
    if(s)this.levelLine.textContent='🌟 Ур. '+s.level+
     (s.nextXP?' · XP '+s.xp+'/'+s.nextXP:' · MAX')+
     ' · Очки навыков: '+s.skillPoints+' (тест PLAY)';
   }
   if(this.deathNotice)this.deathNotice.hidden=!player.dead;
   if(this.respawnButton)this.respawnButton.hidden=!player.dead;
   if(this.attackButton)this.attackButton.disabled=player.dead;
  }

  onPlayerHit(hit,mobName='Враг'){
   if(!this.active||!hit?.ok)return;
   this.updatePlayerHud();
   if(this.combatNotice)this.combatNotice.textContent=
    '💔 '+mobName+': −'+hit.damage+' HP';
   if(!hit.dead)this.builder.playHitAnimation?.();
   if(hit.dead){
    this.builder.keys.clear();
    this.builder.joystick?.reset();
    this.builder.playDeathAnimation?.();
    if(this.combatNotice)this.combatNotice.textContent=
     '☠ Ты погиб. Нажми «Возродиться»';
   }
  }

  respawn(){
   if(!this.active||!this.saved||
      !this.builder.prefabEditor?.combat?.isPlayerDead())return false;
   const b=this.builder;
   // Restart only the disposable PLAY runtime; never touch Builder project JSON.
   this.clearMobTags();this.selectMob('');
   b.prefabEditor.setPlaying(false);
   const delta=this.saved.playerPosition.clone().sub(b.player.position);
   b.player.position.add(delta);
   b.player.rotation.copy(this.saved.playerRotation);
   b.camera.position.add(delta);
   b.controls.target.add(delta);
   b.controls.update();
   b.keys.clear();b.joystick?.reset();
   b.avatarAttackUntil=0;b.avatarState='';
   b.prefabEditor.setPlaying(true);
   this.createMobTags();
   b.skillDefinitionEditor?.resetPlay(this.playerRuntimeStats?.mp);
   this.weapon?.reset();this.ammoSignature='';
   this.healReadyAt=0;
   b.setAvatarAnimation?.(false);
   if(this.hpBar)this.hpBar.hidden=true;
   if(this.hpTarget)this.hpTarget.textContent='⚔ Ближайший враг';
   if(this.combatNotice)this.combatNotice.textContent='❤️ Возрождение · 100% HP';
   this.updatePlayerHud();this.showGenreHud();
   return true;
  }

  now(){return (typeof performance!=='undefined'?performance.now():Date.now())/1000;}
  showGenreHud(){
   const shooter=this.playerCombat.mode==='ranged'||
    !!this.builder.skillEditor?.layout?.slots?.some(s=>s.id==='fire'&&s.enabled);
   if(this.ammoLine)this.ammoLine.hidden=!shooter;
   if(this.rangedControls)this.rangedControls.hidden=this.playerCombat.mode!=='ranged';
   if(this.crosshair)this.crosshair.hidden=!shooter;
   if(this.mpLine)this.mpLine.hidden=!
    Object.keys(this.builder.skillDefinitionEditor?.runtime?.skills||{}).length;
   this.updateAmmoHud();
   this.updateManaHud();
  }
  updateAmmoHud(){
   if(!this.weapon||!this.ammoText)return;
   const state=this.weapon.status(this.now());
   const label=state.ammo+' / '+state.reserve+
    (state.reloading?' · Перезарядка '+state.remaining.toFixed(1)+' с':'')+
    (state.aiming?' · 🎯':'');
   if(label!==this.ammoSignature){
    this.ammoSignature=label;this.ammoText.textContent=label;
   }
  }
  updateManaHud(){
   const rt=this.builder.skillDefinitionEditor?.runtime;
   if(this.mpText&&rt)this.mpText.textContent=rt.mp+' / '+rt.maxMp;
  }
  update(dt){
   if(!this.active||!Number.isFinite(dt)||dt<=0)return;
   if(this.ammoLine&&!this.ammoLine.hidden)this.updateAmmoHud();
   this.effects?.update(dt);
   this.mobCardElapsed+=dt;
   if(this.mobCardElapsed>=.18){
    this.mobCardElapsed=0;this.refreshMobCard();this.refreshMobTags();
   }
  }
  fire(){
   if(!this.active||!this.weapon||
      this.builder.prefabEditor?.combat?.isPlayerDead())return false;
   const attempt=this.weapon.fire(this.now());
   if(!attempt.ok){
    if(this.combatNotice)this.combatNotice.textContent=
     attempt.reason==='empty'?'🔫 Нет патронов · нажми ПЕРЕЗАРЯД':
     attempt.reason==='reloading'?'🔄 Перезарядка...':'⏳ Подожди';
    return false;
   }
   this.builder.playAttackAnimation?.();
   const target=this.builder.prefabEditor?.findEnemy(attempt.range,{forward:true});
   const result=target?this.builder.prefabEditor.damageEnemy(target.id,attempt.damage):null;
   if(result?.ok)this.effects?.spawn({preset:'spark'},target.position);
   this.updateAmmoHud();
   if(this.combatNotice)this.combatNotice.textContent=result?.ok?
    result.killed?'🔫 Противник повержен':'🔫 Попадание: −'+result.damage+' HP':
    '🔫 Промах';
   if(result?.ok){
    this.updatePlayerHud();
    if(this.hpTarget)this.hpTarget.textContent=result.name+' · HP '+result.hp+'/'+result.maxHp;
    if(this.hpBar){this.hpBar.max=result.maxHp;this.hpBar.value=result.hp;this.hpBar.hidden=false;}
   }
   return true;
  }
  reload(){
   if(!this.active||!this.weapon||
      this.builder.prefabEditor?.combat?.isPlayerDead())return false;
   const result=this.weapon.reload(this.now());
   this.updateAmmoHud();
   if(this.combatNotice)this.combatNotice.textContent=result.ok?
    '🔄 Перезарядка...':'🔫 '+(result.reason==='full'?'Магазин полный':
     result.reason==='no-ammo'?'Патронов больше нет':'Уже перезаряжается');
   return result.ok;
  }
  aim(){
   if(!this.active||!this.weapon||
      this.builder.prefabEditor?.combat?.isPlayerDead())return false;
   const next=this.weapon.setAim(!this.weapon.aiming);
   const camera=this.builder.camera;
   if(this.saved?.cameraFov!==null&&Number.isFinite(this.saved?.cameraFov)){
    camera.fov=next?Math.max(30,this.saved.cameraFov*.7):this.saved.cameraFov;
    camera.updateProjectionMatrix?.();
   }
   this.updateAmmoHud();return next;
  }
  castSkill(slot){
   const ed=this.builder.skillDefinitionEditor;
   const combat=this.builder.prefabEditor?.combat;
   if(!this.active||!ed?.runtime||combat?.isPlayerDead())return false;
   const def=ed.catalog.get('player',slot);
   if(!def){
    if(this.combatNotice)this.combatNotice.textContent='🧙 Для слота ещё не создан навык.';
    return false;
   }
   const target=def.type==='damage'?
    this.builder.prefabEditor?.findEnemy(def.range):null;
   const canApply=def.type==='heal'?
    (()=>{const p=combat.getPlayer();return p.hp<p.maxHp;}):
    (()=>!!target);
   const result=ed.cast(slot,this.now(),canApply);
   if(!result.ok){
    if(this.combatNotice)this.combatNotice.textContent=
     result.reason==='mana'?'🔵 Недостаточно MP':
     result.reason==='cooldown'?'⏳ Навык на перезарядке':
     result.reason==='no-target'?'🎯 Нет доступной цели':'🧙 Навык не назначен';
    return false;
   }
   this.builder.playCastAnimation?.();
   const effect=def.type==='heal'?combat.healPlayer(result.power):
     this.builder.prefabEditor.damageEnemy(target.id,result.power);
   if(effect?.ok)this.effects?.spawn(def.effect,
    def.type==='heal'?this.builder.player.position:target?.position,def.type);
   this.updateManaHud();this.updatePlayerHud();
   if(this.combatNotice)this.combatNotice.textContent=
    result.skill.icon+' '+result.skill.name+': '+
    (def.type==='heal'?'+'+effect.healed+' HP':'−'+effect.damage+' HP')+
    ' · MP −'+def.manaCost;
   return true;
  }

  heal(){
   if(!this.active)return false;
   const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000;
   if(now<this.healReadyAt){
    if(this.combatNotice)this.combatNotice.textContent=
     '💚 Лечение через '+(this.healReadyAt-now).toFixed(1)+' сек';
    return false;
   }
   const result=this.builder.prefabEditor?.combat?.healPlayer(30);
   if(!result?.ok){
    if(this.combatNotice)this.combatNotice.textContent=
     result?.reason==='full'?'❤️ HP уже полные':
     '💔 Лечение недоступно после смерти';
    return false;
   }
   this.healReadyAt=now+12;
   this.builder.playCastAnimation?.();
   this.effects?.spawn({preset:'heal'},this.builder.player.position,'heal');
   this.updatePlayerHud();
   if(this.combatNotice)this.combatNotice.textContent=
    '💚 Восстановлено '+result.healed+' HP · откат 12 сек';
   return true;
  }

  attack(){
   if(!this.active||this.builder.prefabEditor?.combat?.isPlayerDead())return false;
   if(this.playerCombat.mode==='ranged')return this.fire();
   const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000;
   const result=this.builder.prefabEditor?.attackNearest(now,this.selectedMobId);
   // A sword can swing without a selected target; animation is not tied to
   // a mob hit result. Cooldown/death still prevent repeated hit triggers.
   if(!result){this.builder.playAttackAnimation?.();return false;}
   if(result.reason==='cooldown'){
    if(this.combatNotice)this.combatNotice.textContent=
     '⏳ Перезарядка '+result.remaining.toFixed(1)+' сек';
    return true;
   }
   if(result.reason==='player-dead')return false;
   this.builder.playAttackAnimation?.();
   if(result.ok){
    const mob=this.builder.prefabEditor?.rendered?.get(result.id);
    this.effects?.spawn({preset:this.playerAttackEffect},mob?.root.position);
    this.updatePlayerHud();this.refreshMobCard();
    if(this.hpTarget)this.hpTarget.textContent=
     result.name+' · HP '+result.hp+'/'+result.maxHp;
    if(this.hpBar){
     this.hpBar.max=result.maxHp;
     this.hpBar.value=result.hp;
     this.hpBar.hidden=false;
    }
    if(this.combatNotice)this.combatNotice.textContent=result.killed?
     '☠ Враг побеждён!':'⚔ Урон: '+result.damage;
   }else{
    if(this.hpBar)this.hpBar.hidden=true;
    if(this.hpTarget)this.hpTarget.textContent='⚔ Нет выбранной цели';
    if(this.combatNotice)this.combatNotice.textContent=
     result.reason==='blocked'?'🧱 Враг за стеной':'Подойди к врагу ближе';
   }
   return true;
  }

  handleKeyDown(event) {
   if (!this.active) return false;
   if (event.key === 'Escape') {
    event.preventDefault();
    this.exit();
    return true;
   }
   // F/Space and the touch button use the same cooldown and target selection.
   if(event.key==='f'||event.key==='F'||event.code==='Space'){
    event.preventDefault();
    if(!event.repeat)this.attack();
    return true;
   }
   // In PLAY, allow WASD/joystick, but never trigger builder undo/delete.
   if (event.ctrlKey || event.metaKey || event.key === 'Delete' ||
       event.key === 'Backspace') {
    event.preventDefault();
    return true;
   }
   return false;
  }
 }
 return PhoenixPlayBridge;
});
