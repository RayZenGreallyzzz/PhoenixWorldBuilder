const assert = require('node:assert/strict');
const {Studio} = require('./phoenix-audio.js');

const elements = new Map();
const node = () => ({value: '', addEventListener(){}, replaceChildren(){}, appendChild(){}});
const doc = {getElementById(id) {
  if (!elements.has(id)) elements.set(id, node());
  return elements.get(id);
}, createElement: node, addEventListener(){}, removeEventListener(){}};

(async () => {
  let contexts = 0, players = 0, reads = 0, starts = 0;
  global.AudioContext = class { constructor() { contexts++; } };
  let rejectPlay = false;
  global.Audio = class {
    constructor() { players++; }
    play() {
      starts++;
      return rejectPlay ? Promise.reject(new Error('bad media')) : Promise.resolve();
    }
    pause(){}
    addEventListener(){}
    removeEventListener(){}
  };
  const editor = new Studio({}, doc, {async readAsset(){ reads++; return null; }});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([contexts, players, reads], [0, 0, 0]);
  editor.startPlay();
  editor.onGameGesture();
  for (let i=0; i<200; i++) editor.move('player', 'walk');
  assert.deepEqual([contexts, players, reads], [0, 0, 0]);
  const wav = {data:'data:audio/wav;base64,UklGRg==', volume:1, loop:true};
  editor.state.actors.player = {walk:wav, run:{...wav}};
  for (let i=0; i<200; i++) editor.move('player', 'walk');
  await flush();
  assert.equal(starts, 1);
  editor.stopInstance('player');
  rejectPlay = true;
  for (let i=0; i<100; i++) { editor.move('player', 'walk'); await flush(); }
  assert.equal(starts, 2);
  rejectPlay = false;
  editor.move('player', 'run');
  assert.equal(starts, 3);
  editor.state.actors.player.walk = {ref:'audio:clip:gone', name:'missing', size:32, volume:1, loop:true};
  for (let i=0; i<100; i++) { editor.move('player', 'walk'); await flush(); }
  assert.equal(reads, 1);
  editor.stopPlay();
  assert.equal(editor.loops.size, 0);
  assert.equal(contexts, 0);
  console.log('Empty canvas, silent PLAY, valid loop and failed media/storage retries passed.');
})().catch(error=>{ console.error(error); process.exitCode=1; });
