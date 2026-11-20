'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '../app/src/main/assets');
const read = file => fs.readFileSync(path.join(base,file),'utf8');
const html = read('index.html');
const builder = read('js/clean-app.js');
const css = read('clean.css');
const adapter = read('engine/builder/play-bridge.js');
for(const id of ['btnPhoenixPlay','btnPhoenixEdit','phoenixPlayHud','joystickPad','view']) {
 assert(html.includes('id="'+id+'"'), 'Missing PLAY/EDIT UI element '+id);
}
const order=[
 'engine/core/phoenix-core.js',
 'engine/builder/play-bridge.js',
 'js/clean-app.js'
];
const positions=order.map(file=>{
 assert(fs.existsSync(path.join(base,file)), 'Missing script '+file);
 return html.indexOf('<script src="'+file+'"></script>');
});
assert(positions.every(n=>n>=0));
assert(positions[0]<positions[1] && positions[1]<positions[2], 'Engine scripts must load before Builder');
assert(builder.includes('this.playBridge=new PhoenixPlayBridge(this,window.PhoenixCore)'), 'Builder must attach PLAY adapter');
assert(builder.includes("if(this.playBridge?.handleKeyDown(e))return"), 'Keyboard must block editor shortcuts in PLAY');
assert(builder.includes("if(this.playBridge?.active)return;\n   const start=this.pointerStart"), 'Scene selection/placement must be blocked in PLAY');
assert(builder.includes("if(!this.playBridge?.active)this.beginObjectDrag(e)"), 'Object dragging must be blocked in PLAY');
assert(css.includes('body.phoenixPlaying .panel'), 'Builder controls must be hidden in PLAY');
assert(css.includes('body.phoenixPlaying #charControls'), 'Joystick must remain visible in PLAY');
assert(!adapter.includes('requestAnimationFrame('), 'PLAY bridge must not add a second draw loop');
assert(!adapter.includes('WebGLRenderer'), 'PLAY bridge must reuse existing WebGL renderer');
assert(!adapter.includes('localStorage.setItem('), 'PLAY must not modify project persistence');
console.log('PASS: UV44 PLAY/EDIT wiring and single render-loop invariants');
