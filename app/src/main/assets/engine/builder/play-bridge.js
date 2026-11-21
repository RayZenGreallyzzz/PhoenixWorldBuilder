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
   this.crosshair = this.document.getElementById('phoenixCrosshair');
   this.mpLine = this.document.getElementById('phoenixMpLine');
   this.mpText = this.document.getElementById('phoenixMpText');
   if (!playButton || !editButton || !this.hud)
    throw new Error('Phoenix Engine PLAY/EDIT UI is missing');
   playButton.addEventListener('click', () => this.enter());
   editButton.addEventListener('click', () => this.exit());
   this.attackButton?.addEventListener('click', () => this.attack());
   this.respawnButton?.addEventListener('click', () => this.respawn());
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
    b.prefabEditor?.setPlaying(true);
    b.skillEditor?.setPlaying(true);
    b.skillDefinitionEditor?.startPlay();
    this.weapon?.reset();this.ammoSignature='';
    this.healReadyAt=0;
    if(this.combatHud)this.combatHud.hidden=false;
    this.showGenreHud();this.updatePlayerHud();
    if(this.hpBar)this.hpBar.hidden=true;
    if(this.hpTarget)this.hpTarget.textContent='⚔ Ближайший враг';
    if(this.combatNotice)this.combatNotice.textContent='Касайся ⚔ или нажми F';
    return true;
   } catch (error) {
    // Entering PLAY must never leave the editor with a half-finished UI.
    this.active = false;
    b.prefabEditor?.setPlaying(false);
    b.skillEditor?.setPlaying(false);
    b.skillDefinitionEditor?.stopPlay();
    this.document.body.classList.remove('phoenixPlaying');
    this.hud.hidden = true;
    if(this.combatHud)this.combatHud.hidden=true;
    this.restore(saved);
    throw error;
   }
  }

  restore(saved) {
   const b = this.builder;
   b.setMode(saved.mode);
   b.player.position.copy(saved.playerPosition);
   b.player.rotation.copy(saved.playerRotation);
   b.camera.position.copy(saved.camera);
   b.controls.target.copy(saved.target);
   b.controls.enabled = saved.controlsEnabled;
   if(saved.cameraFov!==null&&Number.isFinite(saved.cameraFov)){
    b.camera.fov=saved.cameraFov;b.camera.updateProjectionMatrix?.();
   }
   this.weapon?.setAim(false);
   if(this.crosshair)this.crosshair.hidden=true;
   if(this.ammoLine)this.ammoLine.hidden=true;
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
   b.prefabEditor?.setPlaying(false);
   b.skillEditor?.setPlaying(false);
   b.skillDefinitionEditor?.stopPlay();
   this.document.body.classList.remove('phoenixPlaying');
   this.hud.hidden = true;
   if(this.combatHud)this.combatHud.hidden=true;
   const saved = this.saved;
   this.saved = null;
   try {
    this.restore(saved);
   } finally {
    this.modeController.setMode('edit');
   }
   this.message('⏹ Режим EDIT: строительство восстановлено', 'success');
   return true;
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
   if(this.deathNotice)this.deathNotice.hidden=!player.dead;
   if(this.respawnButton)this.respawnButton.hidden=!player.dead;
   if(this.attackButton)this.attackButton.disabled=player.dead;
  }

  onPlayerHit(hit,mobName='Враг'){
   if(!this.active||!hit?.ok)return;
   this.updatePlayerHud();
   if(this.combatNotice)this.combatNotice.textContent=
    '💔 '+mobName+': −'+hit.damage+' HP';
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
   b.skillDefinitionEditor?.resetPlay();
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
   const shooter=!!this.builder.skillEditor?.layout?.slots?.some(s=>s.id==='fire'&&s.enabled);
   if(this.ammoLine)this.ammoLine.hidden=!shooter;
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
   const target=this.builder.prefabEditor?.findEnemy(attempt.range,{forward:true});
   const result=target?this.builder.prefabEditor.damageEnemy(target.id,attempt.damage):null;
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
   const effect=def.type==='heal'?combat.healPlayer(result.power):
    this.builder.prefabEditor.damageEnemy(target.id,result.power);
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
   this.updatePlayerHud();
   if(this.combatNotice)this.combatNotice.textContent=
    '💚 Восстановлено '+result.healed+' HP · откат 12 сек';
   return true;
  }

  attack(){
   if(!this.active)return false;
   const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000;
   const result=this.builder.prefabEditor?.attackNearest(now);
   if(!result)return false;
   if(result.reason==='cooldown'){
    if(this.combatNotice)this.combatNotice.textContent=
     '⏳ Перезарядка '+result.remaining.toFixed(1)+' сек';
    return true;
   }
   if(result.reason==='player-dead')return false;
   this.builder.playAttackAnimation?.();
   if(result.ok){
    this.updatePlayerHud();
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
