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
   const playButton = this.document.getElementById('btnPhoenixPlay');
   const editButton = this.document.getElementById('btnPhoenixEdit');
   this.hud = this.document.getElementById('phoenixPlayHud');
   if (!playButton || !editButton || !this.hud)
    throw new Error('Phoenix Engine PLAY/EDIT UI is missing');
   playButton.addEventListener('click', () => this.enter());
   editButton.addEventListener('click', () => this.exit());
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
    controlsEnabled: b.controls.enabled
   };
   try {
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
    return true;
   } catch (error) {
    // Entering PLAY must never leave the editor with a half-finished UI.
    this.active = false;
    this.document.body.classList.remove('phoenixPlaying');
    this.hud.hidden = true;
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
   if (saved.previewRoot && b.preview && b.preview.root === saved.previewRoot)
    saved.previewRoot.visible = saved.previewVisible;
   if (saved.previewOutline && b.previewOutline === saved.previewOutline)
    saved.previewOutline.visible = saved.outlineVisible;
   b.controls.update();
   if (typeof b.setAvatarAnimation === 'function') b.setAvatarAnimation(false);
  }

  exit() {
   if (!this.active) return false;
   const b = this.builder;
   b.keys.clear();
   if (b.joystick) b.joystick.reset();
   this.active = false;
   this.document.body.classList.remove('phoenixPlaying');
   this.hud.hidden = true;
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

  handleKeyDown(event) {
   if (!this.active) return false;
   if (event.key === 'Escape') {
    event.preventDefault();
    this.exit();
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
