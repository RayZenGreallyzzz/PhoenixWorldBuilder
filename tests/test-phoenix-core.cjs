'use strict';
const assert = require('node:assert/strict');
const { VERSION, MODES, PhoenixWorld, PhoenixModeController } =
  require('../app/src/main/assets/engine/core/phoenix-core.js');

assert.equal(VERSION, 1);
assert.deepEqual(MODES, ['edit', 'play', 'live-edit']);

const world = new PhoenixWorld();
const wolf = world.createEntity('Волк');
const player = world.createEntity('Игрок');
assert.equal(wolf, 'entity-1');
assert.equal(player, 'entity-2');
world.setComponent(wolf, 'stats', { hp: 500, damage: 35, tags: ['enemy'] });
world.setComponent(player, 'stats', { hp: 100, mp: 50 });
world.setComponent(player, 'transform', { position: [0, 0, 0] });
const wolfStats = world.getComponent(wolf, 'stats');
wolfStats.hp = -99;
assert.equal(world.getComponent(wolf, 'stats').hp, 500,
  'Caller must not mutate stored components');

const snapshot = world.serialize();
assert.equal(snapshot.format, 'phoenix-world');
assert.equal(snapshot.version, 1);
assert.equal(snapshot.entities.length, 2);

const restored = new PhoenixWorld();
restored.load(JSON.parse(JSON.stringify(snapshot)));
assert.deepEqual(restored.serialize(), snapshot, 'JSON round-trip must be lossless');
assert.equal(restored.createEntity('Новый моб'), 'entity-3');

const previous = restored.serialize();
assert.throws(() => restored.load({ ...snapshot,
  entities: [...snapshot.entities, snapshot.entities[0]] }), /duplicate/);
assert.deepEqual(restored.serialize(), previous, 'Failed import must not destroy project');

const cyclic = {}; cyclic.self = cyclic;
assert.throws(() => world.setComponent(wolf, 'ai', cyclic), /Cyclic/);
assert.throws(() => world.setComponent(wolf, 'ai', { speed: Infinity }), /JSON-serializable/);
assert.throws(() => world.setComponent(wolf, 'bad type', {}), /Invalid/);
assert.equal(world.removeComponent(wolf, 'stats'), true);
assert.equal(world.getComponent(wolf, 'stats'), undefined);
assert.equal(world.removeEntity(wolf), true);
assert.equal(world.hasEntity(wolf), false);

const mode = new PhoenixModeController();
const notifications = [];
const unsubscribe = mode.subscribe(event => notifications.push(event));
assert.equal(mode.mode, 'edit');
assert.equal(mode.setMode('play'), true);
assert.equal(mode.setMode('live-edit'), true);
assert.equal(mode.setMode('edit'), true);
assert.equal(mode.setMode('edit'), false);
assert.throws(() => mode.setMode('something'), /Invalid mode/);
unsubscribe();
assert.equal(notifications.length, 3);
assert.deepEqual(notifications[0], { previous: 'edit', current: 'play' });
assert.equal(mode.setMode('play'), true);
assert.equal(notifications.length, 3);

console.log('PASS: Phoenix Engine Core 0.1 entity, component, snapshot and modes');
